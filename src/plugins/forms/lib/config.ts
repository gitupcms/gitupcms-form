/**
 * A form's settings beyond its columns: spam, CAPTCHA, channels, rules and auto-reply.
 * Stored as one encrypted JSON blob (it holds tokens), always read through `withDefaults`.
 */
import { HttpError } from "../../../lib/http.ts";

export const CAPTCHAS = ["", "turnstile", "hcaptcha", "recaptcha", "altcha"] as const;
export const SENSITIVITY = { low: 70, medium: 50, high: 30 } as const;
export const OPS = ["equals", "not_equals", "contains", "not_contains", "empty", "not_empty"] as const;

export type Condition = { field: string; op: (typeof OPS)[number]; value: string };
export type Rule = {
  name: string;
  match: "all" | "any";
  conditions: Condition[];
  /** Empty strings mean "leave as is". `to` replaces the form's recipients for this submission. */
  actions: { to: string; subject: string; webhook: string; spam: boolean; stop: boolean };
};
export const DIGESTS = ["", "hourly", "daily"] as const;
export type FormConfig = {
  active: boolean;
  /** false: submissions are only sent on (email, channels), then deleted; nothing stays on the server. */
  archive: boolean;
  /** `intro` heads the notification email; a `digest` sends one email an hour or a day instead of one per submission. */
  email: { intro: string; digest: (typeof DIGESTS)[number] };
  allowLocalhost: boolean;
  sensitivity: keyof typeof SENSITIVITY;
  captcha: { provider: (typeof CAPTCHAS)[number]; siteKey: string; secret: string; minScore: number };
  webhookAuth: { kind: "" | "bearer" | "basic" | "header"; header: string; value: string };
  slack: string;
  discord: string;
  telegram: { token: string; chatId: string };
  sheets: string;
  notion: { token: string; database: string };
  airtable: { token: string; base: string; table: string };
  zapier: string;
  /** `field`: only subscribe when the submission fills this field (a newsletter checkbox); empty: everyone. */
  mailchimp: { key: string; audience: string; field: string };
  autoReply: { enabled: boolean; subject: string; body: string };
  rules: Rule[];
};

export const defaults = (): FormConfig => ({
  active: true,
  archive: true,
  email: { intro: "", digest: "" },
  allowLocalhost: true,
  sensitivity: "medium",
  captcha: { provider: "", siteKey: "", secret: "", minScore: 0.5 },
  webhookAuth: { kind: "", header: "", value: "" },
  slack: "",
  discord: "",
  telegram: { token: "", chatId: "" },
  sheets: "",
  notion: { token: "", database: "" },
  airtable: { token: "", base: "", table: "" },
  zapier: "",
  mailchimp: { key: "", audience: "", field: "" },
  autoReply: { enabled: false, subject: "We got your message", body: "Hi {{name}},\n\nThanks for writing to us. We will get back to you soon." },
  rules: [],
});

/** Stored JSON (maybe from an older version) on top of the defaults, one level deep. */
export const withDefaults = (stored: any): FormConfig => {
  const d: any = defaults();
  for (const [k, v] of Object.entries(stored ?? {})) if (k in d) d[k] = d[k] && typeof d[k] === "object" && !Array.isArray(d[k]) ? { ...d[k], ...(v as object) } : v;
  return d;
};

// ---- Validation of what the admin saves ----

const str = (v: unknown, max = 500) => String(v ?? "").trim().slice(0, max);
const bool = (v: unknown) => v === true || v === "on" || v === "true" || v === "1";
const oneOf = <T extends readonly string[]>(v: unknown, allowed: T, label: string): T[number] => {
  if (!allowed.includes(String(v ?? ""))) throw new HttpError(`Pick a valid ${label}.`, 400);
  return String(v ?? "") as T[number];
};
export const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
export const httpsUrl = (v: unknown, label: string, host?: RegExp) => {
  const s = str(v, 2000);
  if (!s) return "";
  let url: URL;
  try {
    url = new URL(s);
  } catch {
    throw new HttpError(`${label} must be a full https:// address.`, 400);
  }
  if (!/^https?:$/.test(url.protocol)) throw new HttpError(`${label} must be a full https:// address.`, 400);
  if (host && !host.test(url.hostname)) throw new HttpError(`${label} does not look right (check the address you copied).`, 400);
  return url.href;
};
const emails = (v: unknown, label: string) => {
  const list = str(v, 2000).split(/[\s,]+/).filter(Boolean);
  const bad = list.find((e) => !EMAIL.test(e));
  if (bad) throw new HttpError(`${label}: not an email address: ${bad}`, 400);
  return list.join(", ");
};
const rule = (r: any, i: number): Rule => {
  const conditions = (Array.isArray(r?.conditions) ? r.conditions : []).slice(0, 10).map((c: any) => ({ field: str(c?.field, 100), op: oneOf(c?.op, OPS, "condition"), value: str(c?.value, 500) }));
  if (!conditions.length || conditions.some((c: Condition) => !c.field)) throw new HttpError(`Rule ${i + 1}: every condition needs a field.`, 400);
  const a = r?.actions ?? {};
  const actions = { to: emails(a.to, `Rule ${i + 1}`), subject: str(a.subject, 200), webhook: httpsUrl(a.webhook, `Rule ${i + 1} webhook`), spam: bool(a.spam), stop: bool(a.stop) };
  if (!actions.to && !actions.subject && !actions.webhook && !actions.spam && !actions.stop) throw new HttpError(`Rule ${i + 1} does nothing: give it an action.`, 400);
  return { name: str(r?.name, 100) || `Rule ${i + 1}`, match: r?.match === "any" ? "any" : "all", conditions, actions };
};

/** Each section the admin may save, checked and cleaned. Unknown keys are refused. */
const sections: { [K in keyof FormConfig]: (v: any) => FormConfig[K] } = {
  active: bool,
  archive: bool,
  email: (v) => ({ intro: str(v?.intro, 2000), digest: oneOf(v?.digest ?? "", DIGESTS, "digest") }),
  allowLocalhost: bool,
  sensitivity: (v) => oneOf(v, Object.keys(SENSITIVITY) as (keyof typeof SENSITIVITY)[], "spam sensitivity"),
  captcha: (v) => {
    const provider = oneOf(v?.provider, CAPTCHAS, "CAPTCHA");
    const c = { provider, siteKey: str(v?.siteKey, 200), secret: str(v?.secret, 300), minScore: Math.min(1, Math.max(0, Number(v?.minScore ?? 0.5) || 0)) };
    if (provider && provider !== "altcha" && (!c.siteKey || !c.secret)) throw new HttpError("The CAPTCHA needs its site key and secret key.", 400);
    return c;
  },
  webhookAuth: (v) => {
    const kind = oneOf(v?.kind, ["", "bearer", "basic", "header"] as const, "webhook authentication");
    const header = str(v?.header, 100);
    if (kind === "header" && !/^[A-Za-z0-9-]+$/.test(header)) throw new HttpError("Give the custom header a name like X-Api-Key.", 400);
    if (kind && !str(v?.value, 1000)) throw new HttpError("The webhook authentication needs a value.", 400);
    return { kind, header, value: str(v?.value, 1000) };
  },
  slack: (v) => httpsUrl(v, "The Slack webhook", /^hooks\.slack\.com$/),
  discord: (v) => httpsUrl(v, "The Discord webhook", /^(discord\.com|discordapp\.com|ptb\.discord\.com|canary\.discord\.com)$/),
  telegram: (v) => {
    const t = { token: str(v?.token, 200), chatId: str(v?.chatId, 100) };
    if (t.token && !/^\d+:[\w-]+$/.test(t.token)) throw new HttpError("The Telegram bot token looks like 123456:ABC-…", 400);
    if (!!t.token !== !!t.chatId) throw new HttpError("Telegram needs both the bot token and the chat ID.", 400);
    return t;
  },
  sheets: (v) => httpsUrl(v, "The Google Sheets script address", /^script\.google\.com$/),
  notion: (v) => {
    const n = { token: str(v?.token, 300), database: str(v?.database, 200).replace(/^.*\/([0-9a-f]{32}).*$/i, "$1") };
    if (!!n.token !== !!n.database) throw new HttpError("Notion needs both the integration token and the database.", 400);
    return n;
  },
  airtable: (v) => {
    const a = { token: str(v?.token, 300), base: str(v?.base, 100), table: str(v?.table, 200) };
    if ((a.token || a.base || a.table) && !(a.token && /^app\w+$/.test(a.base) && a.table)) throw new HttpError("Airtable needs the token, the base ID (app…) and the table name.", 400);
    return a;
  },
  zapier: (v) => httpsUrl(v, "The Zapier webhook", /^hooks\.zapier\.com$/),
  mailchimp: (v) => {
    const m = { key: str(v?.key, 200), audience: str(v?.audience, 50), field: str(v?.field, 100) };
    if ((m.key || m.audience) && !(/^[0-9a-f]{32}-us\d+$/.test(m.key) && /^\w+$/.test(m.audience))) throw new HttpError("Mailchimp needs the API key (…-us21) and the audience ID.", 400);
    return m;
  },
  autoReply: (v) => ({ enabled: bool(v?.enabled), subject: str(v?.subject, 200) || "We got your message", body: str(v?.body, 5000) }),
  rules: (v) => (Array.isArray(v) ? v : []).slice(0, 25).map(rule),
};

/** Secret field, and the field that says the section is still in use. */
const KEEP: Record<string, [string, string]> = { captcha: ["secret", "provider"], webhookAuth: ["value", "kind"], telegram: ["token", "chatId"], notion: ["token", "database"], airtable: ["token", "base"], mailchimp: ["key", "audience"] };

/** The config as the admin page may see it: secrets blanked, with a flag saying whether one is saved. */
export const forAdmin = (c: FormConfig) => {
  const out: any = structuredClone(c);
  const saved: Record<string, boolean> = {};
  for (const [k, [secret]] of Object.entries(KEEP)) {
    saved[k] = !!out[k][secret];
    out[k][secret] = "";
  }
  return { config: out as FormConfig, saved };
};

/** The current config with the admin's changes applied; throws a readable HttpError on bad input. */
export const patchConfig = (current: FormConfig, patch: Record<string, unknown>): FormConfig => {
  const next: any = { ...current };
  for (const [k, raw] of Object.entries(patch)) {
    if (!(k in sections)) throw new HttpError(`Unknown setting: ${k}`, 400);
    let v: any = raw;
    // The admin page never shows saved secrets: an empty secret next to a still-set section means "keep it".
    const keep = KEEP[k];
    if (keep && v && typeof v === "object" && !str(v[keep[0]]) && str(v[keep[1]])) v = { ...v, [keep[0]]: (current as any)[k][keep[0]] };
    next[k] = (sections as any)[k](v);
  }
  if (!next.archive && next.email.digest) throw new HttpError("A digest needs stored submissions: keep storing them, or send one email per submission.", 400);
  return next;
};
