/**
 * Chat and spreadsheet channels a submission can be sent to besides email and the webhook.
 * Each sender throws on failure (the caller logs it) and returns a short note on success.
 */
import type { FormConfig } from "./config.ts";
import type { Fields } from "./spam.ts";

export type Message = { form: string; data: Fields; files: string[]; url: string; createdAt: string };

const show = (v: string | string[]) => [v].flat().join(", ");
/** The submission as plain text, cut to `max` characters (chat apps limit message length). */
export const plainText = (m: Message, max: number) => {
  const lines = [`New submission to ${m.form}`, ...Object.entries(m.data).map(([k, v]) => `${k}: ${show(v)}`)];
  if (m.files.length) lines.push(`files: ${m.files.join(", ")}`);
  const body = lines.join("\n");
  const link = `\n\n${m.url}`;
  return (body.length + link.length > max ? `${body.slice(0, max - link.length - 1)}…` : body) + link;
};

/** `redirectOk`: Apps Script answers a POST it ran with a redirect to its output. */
const send = async (url: string, init: RequestInit, redirectOk = false) => {
  const res = await fetch(url, { ...init, redirect: "manual", signal: AbortSignal.timeout(10_000) });
  if (!res.ok && !(redirectOk && res.status >= 300 && res.status < 400)) {
    const detail = (await res.text().catch(() => "")).slice(0, 200);
    throw new Error(`HTTP ${res.status}${detail ? `: ${detail}` : ""}`);
  }
  return `HTTP ${res.status}`;
};
const json = (body: unknown, headers: Record<string, string> = {}) => ({ method: "POST", headers: { "Content-Type": "application/json", ...headers }, body: JSON.stringify(body) });

export type Channel = { kind: string; target: string; run: () => Promise<string> };

/** The channels this form has set up, ready to run. Tokens never appear in `target` (it goes in the delivery log). */
export const channels = (c: FormConfig, m: Message): Channel[] => {
  const out: Channel[] = [];
  if (c.slack) out.push({ kind: "slack", target: "Slack", run: () => send(c.slack, json({ text: plainText(m, 3500) })) });
  if (c.discord) out.push({ kind: "discord", target: "Discord", run: () => send(c.discord, json({ content: plainText(m, 1900), allowed_mentions: { parse: [] } })) });
  if (c.telegram.token)
    out.push({ kind: "telegram", target: `Telegram ${c.telegram.chatId}`, run: () => send(`https://api.telegram.org/bot${c.telegram.token}/sendMessage`, json({ chat_id: c.telegram.chatId, text: plainText(m, 4000), disable_web_page_preview: true })) });
  // Google Sheets through an Apps Script web app the owner deploys on their sheet (no Google sign-in here).
  if (c.sheets) out.push({ kind: "sheets", target: "Google Sheets", run: () => send(c.sheets, json({ form: m.form, submittedAt: m.createdAt, ...Object.fromEntries(Object.entries(m.data).map(([k, v]) => [k, show(v)])), files: m.files.join(", "), url: m.url }), true) });
  if (c.notion.token) out.push({ kind: "notion", target: "Notion", run: () => notion(c.notion, m) });
  if (c.airtable.token)
    out.push({
      kind: "airtable",
      target: `Airtable ${c.airtable.table}`,
      run: () =>
        send(`https://api.airtable.com/v0/${c.airtable.base}/${encodeURIComponent(c.airtable.table)}`, json({ typecast: true, records: [{ fields: Object.fromEntries(Object.entries(m.data).map(([k, v]) => [k, show(v)])) }] }, { Authorization: `Bearer ${c.airtable.token}` })),
    });
  return out;
};

const NOTION = { "Notion-Version": "2022-06-28" };
/** A page in the database: its title column gets the first field, the body lists every field. */
const notion = async (n: FormConfig["notion"], m: Message) => {
  const auth = { Authorization: `Bearer ${n.token}`, ...NOTION };
  const db = await fetch(`https://api.notion.com/v1/databases/${n.database}`, { headers: auth, signal: AbortSignal.timeout(10_000) });
  if (!db.ok) throw new Error(`Database not found (HTTP ${db.status}): share it with the integration`);
  const props: Record<string, { type: string }> = (await db.json()).properties ?? {};
  const title = Object.keys(props).find((k) => props[k].type === "title") ?? "Name";
  const first = Object.values(m.data).map(show).find((v) => v.trim()) ?? m.form;
  const paragraph = (content: string) => ({ object: "block", type: "paragraph", paragraph: { rich_text: [{ type: "text", text: { content: content.slice(0, 2000) } }] } });
  return send(
    "https://api.notion.com/v1/pages",
    json(
      {
        parent: { database_id: n.database },
        properties: { [title]: { title: [{ text: { content: first.slice(0, 200) } }] } },
        children: [...Object.entries(m.data).map(([k, v]) => paragraph(`${k}: ${show(v)}`)), ...(m.files.length ? [paragraph(`files: ${m.files.join(", ")}`)] : []), paragraph(m.url)].slice(0, 100),
      },
      auth,
    ),
  );
};

/** The Apps Script the owner pastes into their sheet (Extensions → Apps Script), deployed as a web app. */
export const SHEETS_SCRIPT = `function doPost(e) {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheets()[0];
  const data = JSON.parse(e.postData.contents);
  let headers = sheet.getLastColumn() ? sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0] : [];
  for (const key of Object.keys(data)) if (!headers.includes(key)) headers.push(key);
  sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
  sheet.appendRow(headers.map((h) => data[h] ?? ""));
  return ContentService.createTextOutput("ok");
}`;
