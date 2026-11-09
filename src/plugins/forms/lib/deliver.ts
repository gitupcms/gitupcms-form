/**
 * Sends a submission on: an email to each recipient and a signed POST to the webhook. Every attempt is logged,
 * so the inbox shows what arrived where; the admin can send it again from there.
 */
import { createHmac } from "node:crypto";
import { appOrigin } from "@/lib/admin";
import { sendEmail } from "@/lib/email";
import { list, logDelivery, type Form, type Submission } from "./forms";
import { spamToken } from "./sign";

const escape = (s: string) => s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const show = (v: string | string[]) => (Array.isArray(v) ? v.join(", ") : v);

export const submissionUrl = (form: Form, sub: Submission) => `${appOrigin}/forms/${form.key}/${sub.id}`;

const emailHtml = (form: Form, sub: Submission) => {
  const rows = Object.entries(sub.data)
    .map(([k, v]) => `<tr><td style="padding:6px 12px 6px 0;color:#666;vertical-align:top">${escape(k)}</td><td style="padding:6px 0;white-space:pre-wrap">${escape(show(v))}</td></tr>`)
    .join("");
  const files = sub.files.length ? `<p>Files: ${sub.files.map((f) => escape(f.name)).join(", ")} (open the submission to download them)</p>` : "";
  return `<div style="font:14px/1.5 system-ui,sans-serif;color:#111">
<p><strong>New submission to ${escape(form.name)}</strong></p>
<table style="border-collapse:collapse">${rows}</table>${files}
<p><a href="${submissionUrl(form, sub)}">Open in the inbox</a> · <a href="${appOrigin}/f/spam?t=${spamToken(sub.id)}">Mark as spam</a></p>
<p style="color:#888;font-size:12px">Reply to this email to answer the sender${sub.replyTo ? ` (${escape(sub.replyTo)})` : ""}.</p>
</div>`;
};

const emailText = (form: Form, sub: Submission) =>
  [`New submission to ${form.name}`, "", ...Object.entries(sub.data).map(([k, v]) => `${k}: ${show(v)}`), "", submissionUrl(form, sub)].join("\n");

/** The webhook body and its signature header: `t=<unix time>,v1=<HMAC-SHA256 of "<t>.<body>" with the form's secret>`. */
export const webhookRequest = (form: Form, sub: Submission, t = Math.floor(Date.now() / 1000)) => {
  const body = JSON.stringify({
    event: "submission.created",
    form: { key: form.key, name: form.name },
    submission: { id: sub.id, createdAt: new Date(sub.createdAt * 1000).toISOString(), data: sub.data, files: sub.files, url: submissionUrl(form, sub) },
  });
  return { body, signature: `t=${t},v1=${createHmac("sha256", form.webhookSecret).update(`${t}.${body}`).digest("hex")}` };
};

const postWebhook = async (form: Form, sub: Submission) => {
  const { body, signature } = webhookRequest(form, sub);
  const res = await fetch(form.webhookUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json", "User-Agent": "Gitupcms-Forms", "X-Gitupcms-Signature": signature },
    body,
    redirect: "manual",
    signal: AbortSignal.timeout(10_000),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return `HTTP ${res.status}`;
};

const attempt = async (subId: string, kind: "email" | "webhook", target: string, run: () => Promise<string | void>) => {
  try {
    logDelivery(subId, { kind, target, ok: 1, detail: (await run()) || "Sent" });
    return true;
  } catch (e: any) {
    logDelivery(subId, { kind, target, ok: 0, detail: String(e?.message ?? e) });
    return false;
  }
};

/** Sends to every recipient and the webhook; a failed webhook is tried once more after a few seconds. */
export const deliver = async (form: Form, sub: Submission, retryMs = 5000) => {
  const replyTo = EMAIL.test(sub.replyTo) ? sub.replyTo : undefined;
  const subject = sub.subject || `New submission: ${form.name}`;
  const jobs = list(form.recipients).map((to) => attempt(sub.id, "email", to, () => sendEmail({ to, replyTo, subject, text: emailText(form, sub), html: emailHtml(form, sub) })));
  if (form.webhookUrl)
    jobs.push(
      attempt(sub.id, "webhook", form.webhookUrl, () => postWebhook(form, sub)).then(async (ok) => {
        if (!ok && retryMs >= 0) {
          await new Promise((r) => setTimeout(r, retryMs));
          return attempt(sub.id, "webhook", form.webhookUrl, () => postWebhook(form, sub));
        }
        return ok;
      }),
    );
  await Promise.all(jobs);
};
