/**
 * Sends a submission on: an email to each recipient, a signed POST to the webhook, the chat and spreadsheet
 * channels, and the auto-reply to the sender. Rules can change recipients and subject and add webhooks.
 * Every attempt is logged, so the inbox shows what arrived where; the admin can send it again from there.
 */
import { createHmac } from "node:crypto";
import { appOrigin } from "@/lib/admin";
import { db } from "@/lib/db";
import { sendEmail } from "@/lib/email";
import { branding, brandLine } from "@/lib/limits";
import { formByKey, list, logDelivery, submissionById, type Form, type Submission } from "./forms";
import { spamToken } from "./sign";
import { applyRules } from "./rules";
import { channels } from "./channels";

const escape = (s: string) => s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const show = (v: string | string[]) => (Array.isArray(v) ? v.join(", ") : v);

export const submissionUrl = (form: Form, sub: Submission) => `${appOrigin}/forms/${form.key}/${sub.id}`;

/** One submission's fields, files and links; a form that does not store submissions gets no links (they would be dead). */
const subHtml = (form: Form, sub: Submission) => {
  const rows = Object.entries(sub.data)
    .map(([k, v]) => `<tr><td style="padding:6px 12px 6px 0;color:#666;vertical-align:top">${escape(k)}</td><td style="padding:6px 0;white-space:pre-wrap">${escape(show(v))}</td></tr>`)
    .join("");
  const names = sub.files.map((f) => escape(f.name)).join(", ");
  const files = sub.files.length ? `<p>Files: ${names} ${form.config.archive ? "(open the submission to download them)" : "(not kept: this form does not store submissions)"}</p>` : "";
  const links = form.config.archive ? `<p><a href="${submissionUrl(form, sub)}">Open in the inbox</a> · <a href="${appOrigin}/f/spam?t=${spamToken(sub.id)}">Mark as spam</a></p>` : "";
  return `<table style="border-collapse:collapse">${rows}</table>${files}${links}`;
};
const intro = (form: Form) => (form.config.email.intro ? `<p style="white-space:pre-wrap">${escape(form.config.email.intro)}</p>` : "");
const wrap = (body: string) => `<div style="font:14px/1.5 system-ui,sans-serif;color:#111">${body}${branding ? brandLine.html : ""}</div>`;

export const emailHtml = (form: Form, sub: Submission) =>
  wrap(`${intro(form)}<p><strong>New submission to ${escape(form.name)}</strong></p>
${subHtml(form, sub)}
<p style="color:#888;font-size:12px">Reply to this email to answer the sender${sub.replyTo ? ` (${escape(sub.replyTo)})` : ""}.</p>`);

const subText = (form: Form, sub: Submission) => [...Object.entries(sub.data).map(([k, v]) => `${k}: ${show(v)}`), ...(form.config.archive ? ["", submissionUrl(form, sub)] : [])];
const emailText = (form: Form, sub: Submission) =>
  [...(form.config.email.intro ? [form.config.email.intro, ""] : []), `New submission to ${form.name}`, "", ...subText(form, sub), ...(branding ? ["", brandLine.text] : [])].join("\n");

/** The webhook body and its signature header: `t=<unix time>,v1=<HMAC-SHA256 of "<t>.<body>" with the form's secret>`. */
export const webhookRequest = (form: Form, sub: Submission, t = Math.floor(Date.now() / 1000)) => {
  const body = JSON.stringify({
    event: "submission.created",
    form: { key: form.key, name: form.name },
    submission: { id: sub.id, createdAt: new Date(sub.createdAt * 1000).toISOString(), data: sub.data, files: sub.files, url: submissionUrl(form, sub) },
  });
  return { body, signature: `t=${t},v1=${createHmac("sha256", form.webhookSecret).update(`${t}.${body}`).digest("hex")}` };
};

/** The header the form's webhook authentication adds, if any. */
export const webhookAuthHeader = (a: Form["config"]["webhookAuth"]): Record<string, string> =>
  a.kind === "bearer" ? { Authorization: `Bearer ${a.value}` } : a.kind === "basic" ? { Authorization: `Basic ${Buffer.from(a.value).toString("base64")}` } : a.kind === "header" ? { [a.header]: a.value } : {};

const postWebhook = async (form: Form, sub: Submission, url = form.webhookUrl) => {
  const { body, signature } = webhookRequest(form, sub);
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", "User-Agent": "Gitupcms-Forms", "X-Gitupcms-Signature": signature, ...webhookAuthHeader(form.config.webhookAuth) },
    body,
    redirect: "manual",
    signal: AbortSignal.timeout(10_000),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return `HTTP ${res.status}`;
};

const attempt = async (subId: string, kind: string, target: string, run: () => Promise<string | void>) => {
  try {
    logDelivery(subId, { kind, target, ok: 1, detail: (await run()) || "Sent" });
    return true;
  } catch (e: any) {
    logDelivery(subId, { kind, target, ok: 0, detail: String(e?.message ?? e) });
    return false;
  }
};

// Auto-replies go to whatever address a visitor typed, so cap them: one per address per form a day.
// shortcut: in memory per process; resets on restart.
const replied = new Map<string, number>();
const fill = (template: string, sub: Submission) =>
  template.replace(/\{\{\s*([\w.\-\[\]]+)\s*\}\}/g, (_, k) => [sub.data[k] ?? ""].flat().join(", ").replace(/\s+/g, " ").replace(/https?:\/\/\S+/g, "").slice(0, 80).trim());

const autoReply = (form: Form, sub: Submission) => {
  const key = `${form.key}|${sub.replyTo.toLowerCase()}`;
  if ((replied.get(key) ?? 0) > Date.now() - 86_400_000) throw new Error("Skipped: already answered this address today");
  replied.set(key, Date.now());
  const site = sub.origin ? new URL(sub.origin).host : form.name;
  const text = `${fill(form.config.autoReply.body, sub)}\n\n--\nYou get this because this address was entered in a form on ${site}.${branding ? `\n${brandLine.text}` : ""}`;
  return sendEmail({ to: sub.replyTo, replyTo: list(form.recipients)[0], subject: fill(form.config.autoReply.subject, sub) || "We got your message", text, html: `<div style="font:14px/1.5 system-ui,sans-serif;white-space:pre-wrap">${escape(text)}</div>` });
};

// ---- Digest: one email an hour or a day listing what arrived ----

db.exec(`CREATE TABLE IF NOT EXISTS digest_queue (
  submission_id TEXT PRIMARY KEY REFERENCES submission(id) ON DELETE CASCADE,
  form_key TEXT NOT NULL,
  at INTEGER NOT NULL
)`);
const PERIOD: Record<string, number> = { hourly: 3600, daily: 86400 };
const now = () => Math.floor(Date.now() / 1000);

/** Sends each form's queue once its oldest entry is a period old (right away if the digest was turned off since). */
export const sendDigests = async (at = now()) => {
  const queued = db.prepare("SELECT form_key AS key, MIN(at) AS oldest FROM digest_queue GROUP BY form_key").all() as { key: string; oldest: number }[];
  for (const { key, oldest } of queued) {
    const form = formByKey(key);
    if (!form || oldest > at - (PERIOD[form.config.email.digest] ?? 0)) continue;
    const ids = (db.prepare("SELECT submission_id AS id FROM digest_queue WHERE form_key = ? ORDER BY at").all(key) as { id: string }[]).map((r) => r.id);
    db.prepare(`DELETE FROM digest_queue WHERE submission_id IN (${ids.map(() => "?").join(", ")})`).run(...ids);
    // Rules may send a submission to other people than the form's recipients, so each recipient gets their own list.
    const byTo = new Map<string, Submission[]>();
    for (const sub of ids.map(submissionById).filter((s) => s?.status === "inbox") as Submission[])
      for (const to of applyRules(form.config.rules, sub.data).to ?? list(form.recipients)) byTo.set(to, [...(byTo.get(to) ?? []), sub]);
    for (const [to, subs] of byTo) {
      const subject = `${subs.length} new submission${subs.length > 1 ? "s" : ""}: ${form.name}`;
      const html = wrap(`${intro(form)}<p><strong>${escape(subject)}</strong></p>${subs.map((s) => subHtml(form, s)).join('<hr style="border:0;border-top:1px solid #eee">')}`);
      const text = [subject, "", ...subs.flatMap((s) => [...subText(form, s), "", "--", ""]), ...(branding ? [brandLine.text] : [])].join("\n");
      const result = await sendEmail({ to, subject, text, html }).then(() => ({ ok: 1, detail: `Sent in a digest of ${subs.length}` }), (e) => ({ ok: 0, detail: String(e?.message ?? e) }));
      for (const s of subs) logDelivery(s.id, { kind: "email", target: to, ...result });
    }
  }
};
setInterval(() => sendDigests().catch((e) => console.error("Digest failed:", e)), 300_000).unref();

/** Sends to every recipient, the webhooks and channels; a failed webhook is tried once more after a few seconds. */
export const deliver = async (form: Form, sub: Submission, retryMs = 5000, opts = { autoReply: true, digest: true }) => {
  const replyTo = EMAIL.test(sub.replyTo) ? sub.replyTo : undefined;
  const ruled = applyRules(form.config.rules, sub.data);
  const subject = ruled.subject || sub.subject || `New submission: ${form.name}`;
  const recipients = ruled.to ?? list(form.recipients);
  const digest = opts.digest && form.config.archive && form.config.email.digest;
  if (digest && recipients.length) {
    db.prepare("INSERT OR IGNORE INTO digest_queue (submission_id, form_key, at) VALUES (?, ?, ?)").run(sub.id, form.key, now());
    logDelivery(sub.id, { kind: "email", target: recipients.join(", "), ok: 1, detail: `Queued for the ${digest} digest` });
  }
  const jobs = (digest ? [] : recipients).map((to) => attempt(sub.id, "email", to, () => sendEmail({ to, replyTo, subject, text: emailText(form, sub), html: emailHtml(form, sub) })));
  for (const url of [form.webhookUrl, ...ruled.webhooks].filter(Boolean))
    jobs.push(
      attempt(sub.id, "webhook", url, () => postWebhook(form, sub, url)).then(async (ok) => {
        if (!ok && retryMs >= 0) {
          await new Promise((r) => setTimeout(r, retryMs));
          return attempt(sub.id, "webhook", url, () => postWebhook(form, sub, url));
        }
        return ok;
      }),
    );
  const message = { form: form.name, data: sub.data, files: sub.files.map((f) => f.name), url: submissionUrl(form, sub), createdAt: new Date(sub.createdAt * 1000).toISOString(), email: replyTo };
  for (const ch of channels(form.config, message)) jobs.push(attempt(sub.id, ch.kind, ch.target, ch.run));
  if (opts.autoReply && form.config.autoReply.enabled && replyTo) jobs.push(attempt(sub.id, "auto-reply", replyTo, async () => void (await autoReply(form, sub))));
  await Promise.all(jobs);
};
