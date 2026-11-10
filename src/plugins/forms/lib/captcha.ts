/**
 * CAPTCHA checks on the form endpoint. Turnstile, hCaptcha and reCAPTCHA (v2 and v3) are verified with their
 * providers; Altcha is a proof-of-work puzzle this server makes and checks itself, with no third party.
 */
import { createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import type { FormConfig } from "./config.ts";

/** The field each provider's widget adds to the form. */
export const TOKEN_FIELDS: Record<string, string> = {
  turnstile: "cf-turnstile-response",
  hcaptcha: "h-captcha-response",
  recaptcha: "g-recaptcha-response",
  altcha: "altcha",
};
export const isCaptchaField = (name: string) => Object.values(TOKEN_FIELDS).includes(name);

const VERIFY: Record<string, string> = {
  turnstile: "https://challenges.cloudflare.com/turnstile/v0/siteverify",
  hcaptcha: "https://api.hcaptcha.com/siteverify",
  recaptcha: "https://www.google.com/recaptcha/api/siteverify",
};

// ---- Altcha ----

const ALTCHA_MAX = 100_000;
const altchaKey = () => createHash("sha256").update(`gitupcms-forms:altcha:${process.env.BETTER_AUTH_SECRET ?? ""}`).digest();
const sha256 = (s: string) => createHash("sha256").update(s).digest("hex");
const hmac = (s: string) => createHmac("sha256", altchaKey()).update(s).digest("hex");
// shortcut: solved puzzles are remembered in memory to stop replays, per process; fine for one server.
const used = new Map<string, number>();

/** A new puzzle for the Altcha widget, valid for 10 minutes. */
export const altchaChallenge = (formKey: string, nowMs = Date.now()) => {
  const salt = `${randomBytes(12).toString("hex")}?form=${formKey}&expires=${Math.floor(nowMs / 1000) + 600}`;
  const number = Math.floor(Math.random() * ALTCHA_MAX);
  const challenge = sha256(salt + number);
  return { algorithm: "SHA-256", challenge, maxnumber: ALTCHA_MAX, salt, signature: hmac(challenge) };
};

const same = (a: string, b: string) => a.length === b.length && timingSafeEqual(Buffer.from(a), Buffer.from(b));

export const verifyAltcha = (payload: string, formKey: string, nowMs = Date.now()) => {
  let p: any;
  try {
    p = JSON.parse(Buffer.from(payload, "base64").toString("utf8"));
  } catch {
    return false;
  }
  if (p?.algorithm !== "SHA-256" || typeof p.salt !== "string" || typeof p.challenge !== "string" || typeof p.signature !== "string") return false;
  const params = new URLSearchParams(p.salt.split("?")[1] ?? "");
  if (params.get("form") !== formKey || Number(params.get("expires")) * 1000 < nowMs) return false;
  if (!same(sha256(p.salt + p.number), p.challenge) || !same(hmac(p.challenge), p.signature) || used.has(p.challenge)) return false;
  for (const [k, exp] of used) if (exp < nowMs) used.delete(k);
  used.set(p.challenge, Number(params.get("expires")) * 1000);
  return true;
};

/** null when the CAPTCHA passed (or none is set), else why it failed. */
export const checkCaptcha = async (c: FormConfig["captcha"], formKey: string, token: string, ip: string): Promise<string | null> => {
  if (!c.provider) return null;
  if (!token) return "Please complete the CAPTCHA.";
  if (c.provider === "altcha") return verifyAltcha(token, formKey) ? null : "The CAPTCHA check failed. Please try again.";
  const body = new URLSearchParams({ secret: c.secret, response: token, ...(ip ? { remoteip: ip } : {}) });
  try {
    const res = await fetch(VERIFY[c.provider], { method: "POST", body, signal: AbortSignal.timeout(10_000) });
    const json: any = await res.json();
    if (!json.success) return "The CAPTCHA check failed. Please try again.";
    // reCAPTCHA v3 answers with a score instead of a puzzle.
    if (typeof json.score === "number" && json.score < c.minScore) return "The CAPTCHA check failed. Please try again.";
    return null;
  } catch {
    return "The CAPTCHA could not be checked. Please try again.";
  }
};

/** What the site owner adds inside their form for each provider. */
export const widgetSnippet = (c: FormConfig["captcha"], challengeUrl: string) =>
  ({
    "": "",
    turnstile: `<script src="https://challenges.cloudflare.com/turnstile/v0/api.js" async defer></script>\n<div class="cf-turnstile" data-sitekey="${c.siteKey}"></div>`,
    hcaptcha: `<script src="https://js.hcaptcha.com/1/api.js" async defer></script>\n<div class="h-captcha" data-sitekey="${c.siteKey}"></div>`,
    recaptcha: `<!-- reCAPTCHA v2 ("I'm not a robot" box) -->
<script src="https://www.google.com/recaptcha/api.js" async defer></script>
<div class="g-recaptcha" data-sitekey="${c.siteKey}"></div>

<!-- or reCAPTCHA v3 (no box; a token is fetched when the form is sent) -->
<script src="https://www.google.com/recaptcha/api.js?render=${c.siteKey}"></script>
<input type="hidden" name="g-recaptcha-response">
<script>
  document.currentScript.closest("form").addEventListener("submit", (e) => {
    const field = e.target.querySelector('[name="g-recaptcha-response"]');
    if (field.value) return;
    e.preventDefault();
    e.stopImmediatePropagation();
    grecaptcha.ready(() => grecaptcha.execute("${c.siteKey}", { action: "submit" }).then((token) => {
      field.value = token;
      e.target.requestSubmit();
    }));
  }, true);
</script>`,
    altcha: `<script async defer type="module" src="https://cdn.jsdelivr.net/gh/altcha-org/altcha/dist/altcha.min.js"></script>\n<altcha-widget challengeurl="${challengeUrl}"></altcha-widget>`,
  })[c.provider];
