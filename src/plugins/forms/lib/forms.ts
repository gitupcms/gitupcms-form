/**
 * Forms and their submissions in SQLite; uploaded files on disk next to the database (FILES_DIR).
 * A form is an endpoint, POST /f/<key>: the site keeps its own HTML form and only points `action` at it.
 */
import { createHash, randomBytes } from "node:crypto";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { db } from "@/lib/db";
import { decrypt, encrypt } from "@/lib/integrations";
import { spamCheck, type Fields, type Signal } from "./spam";
import type { Parsed } from "./parse";

db.pragma("foreign_keys = ON");
db.exec(`
CREATE TABLE IF NOT EXISTS form (
  key TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  domains TEXT NOT NULL DEFAULT '',
  recipients TEXT NOT NULL DEFAULT '',
  redirect TEXT NOT NULL DEFAULT '',
  webhook_url TEXT NOT NULL DEFAULT '',
  webhook_secret TEXT NOT NULL,
  blocklist TEXT NOT NULL DEFAULT '',
  created_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS submission (
  id TEXT PRIMARY KEY,
  form_key TEXT NOT NULL REFERENCES form(key) ON DELETE CASCADE,
  data TEXT NOT NULL,
  files TEXT NOT NULL DEFAULT '[]',
  status TEXT NOT NULL CHECK (status IN ('inbox', 'spam')),
  score INTEGER NOT NULL,
  signals TEXT NOT NULL DEFAULT '[]',
  hash TEXT NOT NULL,
  ip TEXT NOT NULL DEFAULT '',
  origin TEXT NOT NULL DEFAULT '',
  subject TEXT NOT NULL DEFAULT '',
  reply_to TEXT NOT NULL DEFAULT '',
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS submission_list ON submission (form_key, status, created_at);
CREATE INDEX IF NOT EXISTS submission_hash ON submission (form_key, hash, created_at);
CREATE TABLE IF NOT EXISTS delivery (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  submission_id TEXT NOT NULL REFERENCES submission(id) ON DELETE CASCADE,
  kind TEXT NOT NULL,
  target TEXT NOT NULL,
  ok INTEGER NOT NULL,
  detail TEXT NOT NULL DEFAULT '',
  at INTEGER NOT NULL
);
`);

const env = (name: string) => process.env[name] ?? import.meta.env?.[name];
const filesDir = () => env("FILES_DIR") || join(dirname(env("DB_PATH") || "data/gitupcms-forms.db"), "files");
const now = () => Math.floor(Date.now() / 1000);
const id = (bytes = 12) => randomBytes(bytes).toString("base64url");

export type Form = {
  key: string;
  name: string;
  domains: string;
  recipients: string;
  redirect: string;
  webhookUrl: string;
  webhookSecret: string;
  blocklist: string;
  createdAt: number;
};
export type FileInfo = { field: string; name: string; type: string; size: number };
export type Submission = {
  id: string;
  formKey: string;
  data: Fields;
  files: FileInfo[];
  status: "inbox" | "spam";
  score: number;
  signals: Signal[];
  ip: string;
  origin: string;
  subject: string;
  replyTo: string;
  createdAt: number;
};

const FORM_COLUMNS = `key, name, domains, recipients, redirect, webhook_url AS webhookUrl, webhook_secret AS webhookSecret, blocklist, created_at AS createdAt`;
const toForm = (row: any): Form | null => (row ? { ...row, webhookSecret: decrypt(row.webhookSecret) } : null);
const toSubmission = (row: any): Submission | null =>
  row
    ? {
        id: row.id,
        formKey: row.form_key,
        data: JSON.parse(row.data),
        files: JSON.parse(row.files),
        status: row.status,
        score: row.score,
        signals: JSON.parse(row.signals),
        ip: row.ip,
        origin: row.origin,
        subject: row.subject,
        replyTo: row.reply_to,
        createdAt: row.created_at,
      }
    : null;

// ---- Forms ----

export const formByKey = (key: string) => toForm(db.prepare(`SELECT ${FORM_COLUMNS} FROM form WHERE key = ?`).get(key));
export const forms = () =>
  db
    .prepare(
      `SELECT key, name, domains,
        (SELECT COUNT(*) FROM submission s WHERE s.form_key = form.key AND s.status = 'inbox') AS inbox,
        (SELECT MAX(created_at) FROM submission s WHERE s.form_key = form.key AND s.status = 'inbox') AS lastAt
      FROM form ORDER BY name COLLATE NOCASE`,
    )
    .all() as { key: string; name: string; domains: string; inbox: number; lastAt: number | null }[];

export const createForm = (name: string, recipient: string) => {
  const key = id(12);
  db.prepare("INSERT INTO form (key, name, recipients, webhook_secret, created_at) VALUES (?, ?, ?, ?, ?)").run(key, name, recipient, encrypt(newSecret()), now());
  return key;
};
const newSecret = () => `whsec_${id(24)}`;

export const updateForm = (key: string, f: Pick<Form, "name" | "domains" | "recipients" | "redirect" | "webhookUrl" | "blocklist">) =>
  db.prepare("UPDATE form SET name = ?, domains = ?, recipients = ?, redirect = ?, webhook_url = ?, blocklist = ? WHERE key = ?").run(f.name, f.domains, f.recipients, f.redirect, f.webhookUrl, f.blocklist, key);
export const rotateSecret = (key: string) => db.prepare("UPDATE form SET webhook_secret = ? WHERE key = ?").run(encrypt(newSecret()), key);

export const deleteForm = (key: string) => {
  for (const { id } of db.prepare("SELECT id FROM submission WHERE form_key = ?").all(key) as { id: string }[]) removeFiles(id);
  db.prepare("DELETE FROM form WHERE key = ?").run(key);
};

/** Lines or commas → a clean list. */
export const list = (text: string) => text.split(/[\s,]+/).map((s) => s.trim().toLowerCase()).filter(Boolean);

/** Whether a site at `origin` may post to the form: any site when no domains are set, else those domains and their subdomains. */
export const originAllowed = (form: Form, origin: string | null, appOrigin: string) => {
  const domains = list(form.domains);
  if (!domains.length || origin === appOrigin) return true;
  let host: string;
  try {
    host = new URL(origin ?? "").hostname;
  } catch {
    return false;
  }
  return domains.some((d) => host === d || host.endsWith(`.${d}`));
};

// ---- Submissions ----

// Per form and IP, in memory: 5+ sends in 10 minutes count as a spam signal, 20+ are refused outright.
// shortcut: counts reset on restart and are per process, fine for one self-hosted server.
const recent = new Map<string, number[]>();
const WINDOW = 600_000;
export const HARD_LIMIT = 20;
export const countSend = (formKey: string, ip: string) => {
  const key = `${formKey}|${ip}`;
  const times = (recent.get(key) ?? []).filter((t) => t > Date.now() - WINDOW);
  times.push(Date.now());
  recent.set(key, times);
  if (recent.size > 10_000) for (const [k, v] of recent) if (v.at(-1)! < Date.now() - WINDOW) recent.delete(k);
  return times.length - 1;
};

const hashOf = (formKey: string, data: Fields) => createHash("sha256").update(formKey).update(JSON.stringify(data)).digest("base64url");

/** Scores and stores a parsed submission (its files too); returns it. */
export const saveSubmission = async (form: Form, parsed: Parsed, meta: { ip: string; origin: string; recentFromIp: number }) => {
  const hash = hashOf(form.key, parsed.data);
  const duplicate = !!db.prepare("SELECT 1 FROM submission WHERE form_key = ? AND hash = ? AND created_at > ?").get(form.key, hash, now() - 86400);
  const check = spamCheck({ data: parsed.data, honeypot: parsed.options.honeypot, email: parsed.options.replyTo, ip: meta.ip, recentFromIp: meta.recentFromIp, duplicate, blocklist: form.blocklist });
  const subId = id(12);
  const files: FileInfo[] = parsed.files.map(({ field, file }) => ({ field, name: file.name.replace(/[\r\n"\\/]/g, "_").slice(0, 200) || "file", type: file.type.slice(0, 100), size: file.size }));
  if (parsed.files.length) {
    const dir = join(filesDir(), subId);
    mkdirSync(dir, { recursive: true });
    for (const [n, { file }] of parsed.files.entries()) writeFileSync(join(dir, String(n)), Buffer.from(await file.arrayBuffer()));
  }
  db.prepare(
    `INSERT INTO submission (id, form_key, data, files, status, score, signals, hash, ip, origin, subject, reply_to, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(subId, form.key, JSON.stringify(parsed.data), JSON.stringify(files), check.spam ? "spam" : "inbox", check.score, JSON.stringify(check.signals), hash, meta.ip, meta.origin, parsed.options.subject, parsed.options.replyTo, now());
  return submissionById(subId)!;
};

export const submissionById = (subId: string) => toSubmission(db.prepare("SELECT * FROM submission WHERE id = ?").get(subId));

const likeEscape = (s: string) => s.replace(/[\\%_]/g, (c) => `\\${c}`);
export const PAGE = 50;
/** One page of a form's inbox or spam, newest first; `q` searches every field. */
export const submissions = (formKey: string, status: "inbox" | "spam", q = "", page = 1) => {
  const where = `form_key = ? AND status = ?${q ? ` AND data LIKE ? ESCAPE '\\'` : ""}`;
  const args = [formKey, status, ...(q ? [`%${likeEscape(q)}%`] : [])];
  const total = (db.prepare(`SELECT COUNT(*) AS n FROM submission WHERE ${where}`).get(...args) as { n: number }).n;
  const rows = db.prepare(`SELECT * FROM submission WHERE ${where} ORDER BY created_at DESC, rowid DESC LIMIT ? OFFSET ?`).all(...args, PAGE, (page - 1) * PAGE);
  return { total, items: rows.map((r) => toSubmission(r)!) };
};
export const counts = (formKey: string) =>
  Object.fromEntries((db.prepare("SELECT status, COUNT(*) AS n FROM submission WHERE form_key = ? GROUP BY status").all(formKey) as { status: string; n: number }[]).map((r) => [r.status, r.n])) as Partial<Record<"inbox" | "spam", number>>;

export const setStatus = (subId: string, status: "inbox" | "spam") => db.prepare("UPDATE submission SET status = ? WHERE id = ?").run(status, subId).changes > 0;
export const deleteSubmission = (subId: string) => {
  removeFiles(subId);
  return db.prepare("DELETE FROM submission WHERE id = ?").run(subId).changes > 0;
};
const removeFiles = (subId: string) => rmSync(join(filesDir(), subId), { recursive: true, force: true });
/** The stored file `n` of a submission, as a path on disk. */
export const filePath = (subId: string, n: number) => join(filesDir(), subId, String(n));

// ---- Deliveries ----

export type Delivery = { kind: "email" | "webhook"; target: string; ok: number; detail: string; at: number };
export const logDelivery = (subId: string, d: Omit<Delivery, "at">) =>
  db.prepare("INSERT INTO delivery (submission_id, kind, target, ok, detail, at) VALUES (?, ?, ?, ?, ?, ?)").run(subId, d.kind, d.target, d.ok, d.detail.slice(0, 500), now());
export const deliveries = (subId: string) => db.prepare("SELECT kind, target, ok, detail, at FROM delivery WHERE submission_id = ? ORDER BY id").all(subId) as Delivery[];
