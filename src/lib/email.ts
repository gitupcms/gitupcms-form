/**
 * Sends email through any SMTP server set in SMTP_URL (a self-hosted Stalwart/Postal, SES, Resend's SMTP…):
 * `smtps://user:pass@mail.example.com:465` (TLS) or `smtp://user:pass@mail.example.com:587` (STARTTLS).
 * Without it (local dev) the message is printed to the server console instead.
 */
import { sendSmtp } from "./smtp.ts";
import { BRAND } from "./brand.ts";

const env = (name: string) => process.env[name] ?? import.meta.env?.[name];

const escape = (s: string) => s.replace(/[&<>"]/g, (c) => `&#${c.charCodeAt(0)};`);

/** "WuppyCMS <noreply@x.com>" → name + address. */
export const parseFrom = (value: string) => {
  const m = /^\s*(?:"?([^"<]*?)"?\s*)?<([^<>\s]+@[^<>\s]+)>\s*$/.exec(value);
  return m ? { fromName: m[1] || undefined, from: m[2] } : { from: value.trim() };
};

/** smtp(s)://user:pass@host:port → the smtp.ts config. */
export const parseSmtpUrl = (value: string) => {
  const u = new URL(value);
  if (u.protocol !== "smtp:" && u.protocol !== "smtps:") throw new Error("SMTP_URL must start with smtp:// or smtps://");
  const secure = u.protocol === "smtps:";
  return { host: u.hostname, port: Number(u.port) || (secure ? 465 : 587), user: decodeURIComponent(u.username), pass: decodeURIComponent(u.password), secure };
};

export const sendEmail = async ({ to, replyTo, subject, text, html }: { to: string; replyTo?: string; subject: string; text: string; html?: string }) => {
  const url = env("SMTP_URL");
  if (!url) {
    console.log(`\n[email] To: ${to}\n[email] Subject: ${subject}\n${text}\n`);
    return;
  }
  const from = parseFrom(env("EMAIL_FROM") || `${BRAND.name} <noreply@localhost>`);
  await sendSmtp(parseSmtpUrl(url), { ...from, to, replyTo, subject, html: html ?? `<pre style="font:14px system-ui;white-space:pre-wrap">${escape(text)}</pre>` }).catch((e) => {
    throw new Error(`Email to ${to} failed: ${e.message}`);
  });
};
