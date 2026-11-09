/**
 * Forms made in the builder: the embed script that draws them on any site (also used by the hosted page at
 * /f/<key>), and the server check that a post matches the fields. Hand-written HTML forms skip both.
 */
import { HttpError } from "../../../lib/http.ts";
import type { FormConfig } from "./config.ts";
import type { Parsed } from "./parse.ts";

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Throws a 400 naming the first field that does not fit the builder's schema. */
export const checkAgainstBuilder = (b: FormConfig["builder"], parsed: Parsed) => {
  for (const f of b.fields) {
    const value = [parsed.data[f.name] ?? ""].flat().join("").trim();
    const hasFile = parsed.files.some((u) => u.field === f.name);
    if (f.required && !(f.type === "file" ? hasFile : value)) throw new HttpError(`${f.label} is required.`, 400);
    if (!value) continue;
    if (f.type === "email" && !EMAIL.test(value)) throw new HttpError(`${f.label} must be an email address.`, 400);
    if (f.type === "number" && !Number.isFinite(Number(value))) throw new HttpError(`${f.label} must be a number.`, 400);
    if (f.type === "url" && !/^https?:\/\/\S+$/.test(value)) throw new HttpError(`${f.label} must be a web address.`, 400);
    if (f.type === "select" && f.options.length && ![parsed.data[f.name]].flat().every((v) => f.options.includes(String(v)))) throw new HttpError(`Pick one of the options for ${f.label}.`, 400);
  }
};

/** Plain browser JS, no build step: draws the form into every `[data-gitupcms-form="<key>"]` and posts it with fetch. */
export const embedScript = (key: string, action: string, b: FormConfig["builder"], captcha: { provider: string; siteKey: string; challengeUrl: string }) => `(() => {
const KEY = ${JSON.stringify(key)}, ACTION = ${JSON.stringify(action)}, FORM = ${JSON.stringify(b)}, CAPTCHA = ${JSON.stringify(captcha)};
const css = \`.gf-form{--gf-accent:#2563eb;--gf-border:#d4d4d8;--gf-bg:#fff;--gf-fg:#18181b;--gf-muted:#71717a;display:grid;gap:14px;font:15px/1.5 system-ui,sans-serif;color:var(--gf-fg);max-width:36rem}
@media (prefers-color-scheme:dark){.gf-form{--gf-border:#3f3f46;--gf-bg:#18181b;--gf-fg:#fafafa;--gf-muted:#a1a1aa}}
.gf-form h2{margin:0;font-size:1.25em}.gf-form p{margin:0;color:var(--gf-muted)}.gf-field{display:grid;gap:4px}.gf-field>span{font-weight:500}
.gf-form input:not([type=checkbox]):not([type=file]),.gf-form textarea,.gf-form select{font:inherit;color:inherit;background:var(--gf-bg);border:1px solid var(--gf-border);border-radius:8px;padding:8px 10px}
.gf-form textarea{min-height:7em;resize:vertical}.gf-check{display:flex;gap:8px;align-items:center}
.gf-form button{font:inherit;font-weight:500;border:0;border-radius:8px;padding:10px 14px;background:var(--gf-accent);color:#fff;cursor:pointer}.gf-form button:disabled{opacity:.6}
.gf-error{color:#dc2626}.gf-done{padding:14px;border-radius:8px;background:#dcfce7;color:#166534}\`;
if (!document.getElementById("gf-style")) document.head.append(Object.assign(document.createElement("style"), { id: "gf-style", textContent: css }));
const el = (tag, props = {}, ...kids) => { const e = Object.assign(document.createElement(tag), props); e.append(...kids); return e; };
const loaded = new Set();
const load = (src, module) => { if (loaded.has(src)) return; loaded.add(src); document.head.append(el("script", { src, async: true, ...(module ? { type: "module" } : {}) })); };
const draw = (host) => {
  const form = el("form", { className: "gf-form", action: ACTION, method: "POST", enctype: "multipart/form-data", noValidate: false });
  if (FORM.title) form.append(el("h2", { textContent: FORM.title }));
  if (FORM.description) form.append(el("p", { textContent: FORM.description }));
  for (const f of FORM.fields) {
    const common = { name: f.name, required: f.required, placeholder: f.placeholder };
    let input;
    if (f.type === "textarea") input = el("textarea", common);
    else if (f.type === "select") input = el("select", { name: f.name, required: f.required }, el("option", { value: "", textContent: f.placeholder || "Choose…" }), ...f.options.map((o) => el("option", { value: o, textContent: o })));
    else if (f.type === "checkbox") { form.append(el("label", { className: "gf-check" }, el("input", { type: "checkbox", name: f.name, value: "yes", required: f.required }), f.label)); continue; }
    else input = el("input", { ...common, type: f.type });
    form.append(el("label", { className: "gf-field" }, el("span", { textContent: f.label + (f.required ? " *" : "") }), input));
  }
  form.append(el("input", { name: "_gotcha", tabIndex: -1, autocomplete: "off", style: "display:none" }));
  if (CAPTCHA.provider === "turnstile") { load("https://challenges.cloudflare.com/turnstile/v0/api.js"); form.append(el("div", { className: "cf-turnstile" })); }
  if (CAPTCHA.provider === "hcaptcha") { load("https://js.hcaptcha.com/1/api.js"); form.append(el("div", { className: "h-captcha" })); }
  if (CAPTCHA.provider === "recaptcha") { load("https://www.google.com/recaptcha/api.js"); form.append(el("div", { className: "g-recaptcha" })); }
  if (CAPTCHA.provider === "altcha") { load("https://cdn.jsdelivr.net/gh/altcha-org/altcha/dist/altcha.min.js", true); const w = document.createElement("altcha-widget"); w.setAttribute("challengeurl", CAPTCHA.challengeUrl); form.append(w); }
  form.querySelectorAll(".cf-turnstile,.h-captcha,.g-recaptcha").forEach((d) => d.setAttribute("data-sitekey", CAPTCHA.siteKey));
  const error = el("p", { className: "gf-error", role: "alert" });
  const button = el("button", { type: "submit", textContent: FORM.submit });
  form.append(error, button);
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    button.disabled = true;
    error.textContent = "";
    try {
      const res = await fetch(ACTION, { method: "POST", body: new FormData(form), headers: { Accept: "application/json" } });
      const json = await res.json();
      if (!json.ok) throw new Error(json.error);
      form.replaceWith(el("p", { className: "gf-done gf-form", role: "status", textContent: FORM.success }));
    } catch (err) {
      error.textContent = err.message || "The form could not be sent. Please try again.";
      button.disabled = false;
    }
  });
  host.replaceChildren(form);
};
const run = () => document.querySelectorAll('[data-gitupcms-form="' + KEY + '"]').forEach(draw);
document.readyState === "loading" ? document.addEventListener("DOMContentLoaded", run) : run();
})();`;
