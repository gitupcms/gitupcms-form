/**
 * Forms and their submissions in SQLite; uploaded files on disk next to the database (FILES_DIR).
 * A form is an endpoint, POST /f/<key>: the site keeps its own HTML form and only points `action` at it.
 * Privacy: what a visitor sent (fields, file names and contents, subject, reply address) is stored AES-256-GCM
 * encrypted, IP addresses are never stored, and old submissions are deleted on the form's schedule.
 */
import { createHmac, randomBytes } from "node:crypto";
import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { db } from "../../../lib/db.ts";
import { decrypt, encrypt } from "../../../lib/integrations.ts";
import { spamCheck, type Fields, type Signal } from "./spam.ts";
import type { Parsed } from "./parse.ts";
import { SENSITIVITY, withDefaults, type FormConfig } from "./config.ts";
import { applyRules } from "./rules.ts";

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
// Added after the first schema: 0 keeps submissions until deleted by hand.
const formColumns = (db.prepare("PRAGMA table_info(form)").all() as { name: string }[]).map((c) => c.name);
if (!formColumns.includes("retention_days")) db.exec("ALTER TABLE form ADD COLUMN retention_days INTEGER NOT NULL DEFAULT 0");
// Encrypted JSON: CAPTCHA, channels (with their tokens), rules, auto-reply. See config.ts.
if (!formColumns.includes("config")) db.exec("ALTER TABLE form ADD COLUMN config TEXT NOT NULL DEFAULT ''");
if (!formColumns.includes("workspace_id")) db.exec("ALTER TABLE form ADD COLUMN workspace_id TEXT NOT NULL DEFAULT ''");
const subColumns = (db.prepare("PRAGMA table_info(submission)").all() as { name: string }[]).map((c) => c.name);
if (!subColumns.includes("read_at")) db.exec("ALTER TABLE submission ADD COLUMN read_at INTEGER");
if (!subColumns.includes("starred")) db.exec("ALTER TABLE submission ADD COLUMN starred INTEGER NOT NULL DEFAULT 0");
db.exec(`
CREATE TABLE IF NOT EXISTS workspace (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  created_at INTEGER NOT NULL
);
`);
// Counts per day for Analytics and the monthly limit. Kept apart from submissions, so they survive deletion,
// retention and forms that do not store submissions. The status is the spam filter's verdict on arrival.
const hadStats = !!db.prepare("SELECT 1 FROM sqlite_master WHERE name = 'stat'").get();
db.exec(`
CREATE TABLE IF NOT EXISTS stat (
  form_key TEXT NOT NULL REFERENCES form(key) ON DELETE CASCADE,
  day TEXT NOT NULL,
  status TEXT NOT NULL,
  source TEXT NOT NULL,
  country TEXT NOT NULL,
  n INTEGER NOT NULL,
  PRIMARY KEY (form_key, day, status, source, country)
);
`);
if (!hadStats)
  db.exec(`INSERT INTO stat (form_key, day, status, source, country, n)
    SELECT form_key, date(created_at, 'unixepoch'), status, replace(replace(origin, 'https://', ''), 'http://', ''), '', COUNT(*) FROM submission GROUP BY 1, 2, 3, 4`);
db.exec(`
CREATE TABLE IF NOT EXISTS api_key (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  hash TEXT NOT NULL UNIQUE,
  hint TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  last_used_at INTEGER
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
  retentionDays: number;
  config: FormConfig;
  workspaceId: string;
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
  origin: string;
  subject: string;
  replyTo: string;
  read: boolean;
  starred: boolean;
  createdAt: number;
};

const seal = (value: unknown) => encrypt(JSON.stringify(value));
const open = (value: string) => JSON.parse(decrypt(value));

const FORM_COLUMNS = `key, name, domains, recipients, redirect, webhook_url AS webhookUrl, webhook_secret AS webhookSecret, blocklist, retention_days AS retentionDays, config, workspace_id AS workspaceId, created_at AS createdAt`;
const toForm = (row: any): Form | null => (row ? { ...row, webhookSecret: decrypt(row.webhookSecret), config: withDefaults(row.config ? open(row.config) : {}) } : null);
const toSubmission = (row: any): Submission | null =>
  row
    ? {
        id: row.id,
        formKey: row.form_key,
        data: open(row.data),
        files: open(row.files),
        status: row.status,
        score: row.score,
        signals: JSON.parse(row.signals),
        origin: row.origin,
        subject: open(row.subject),
        replyTo: open(row.reply_to),
        read: row.read_at !== null,
        starred: !!row.starred,
        createdAt: row.created_at,
      }
    : null;

// ---- Forms ----

export const formByKey = (key: string) => toForm(db.prepare(`SELECT ${FORM_COLUMNS} FROM form WHERE key = ?`).get(key));
/** Every form, or only one workspace's. */
export const forms = (workspaceId?: string) =>
  db
    .prepare(
      `SELECT key, name, domains, workspace_id AS workspaceId,
        (SELECT COUNT(*) FROM submission s WHERE s.form_key = form.key AND s.status = 'inbox') AS inbox,
        (SELECT COUNT(*) FROM submission s WHERE s.form_key = form.key AND s.status = 'inbox' AND s.read_at IS NULL) AS unread,
        (SELECT MAX(created_at) FROM submission s WHERE s.form_key = form.key AND s.status = 'inbox') AS lastAt
      FROM form ${workspaceId ? "WHERE workspace_id = ?" : ""} ORDER BY name COLLATE NOCASE`,
    )
    .all(...(workspaceId ? [workspaceId] : [])) as { key: string; name: string; domains: string; workspaceId: string; inbox: number; unread: number; lastAt: number | null }[];

export const createForm = (name: string, recipient: string, workspaceId = workspaces()[0].id) => {
  const key = id(12);
  db.prepare("INSERT INTO form (key, name, recipients, webhook_secret, workspace_id, created_at) VALUES (?, ?, ?, ?, ?, ?)").run(key, name, recipient, encrypt(newSecret()), workspaceId, now());
  return key;
};
export const moveForm = (key: string, workspaceId: string) => db.prepare("UPDATE form SET workspace_id = ? WHERE key = ?").run(workspaceId, key);
const newSecret = () => `whsec_${id(24)}`;

export const RETENTION_DAYS = [0, 30, 90, 180, 365];
export const updateForm = (key: string, f: Pick<Form, "name" | "domains" | "recipients" | "redirect" | "webhookUrl" | "blocklist" | "retentionDays">) =>
  db
    .prepare("UPDATE form SET name = ?, domains = ?, recipients = ?, redirect = ?, webhook_url = ?, blocklist = ?, retention_days = ? WHERE key = ?")
    .run(f.name, f.domains, f.recipients, f.redirect, f.webhookUrl, f.blocklist, f.retentionDays, key);
export const saveConfig = (key: string, config: FormConfig) => db.prepare("UPDATE form SET config = ? WHERE key = ?").run(seal(config), key);
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
  if (form.config.allowLocalhost && /^(localhost|127\.0\.0\.1|\[::1\])$|\.localhost$/.test(host)) return true;
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

// Keyed, so the stored duplicate check cannot be reversed by guessing what someone typed.
const hashOf = (formKey: string, data: Fields) => createHmac("sha256", env("BETTER_AUTH_SECRET") ?? "").update(formKey).update(JSON.stringify(data)).digest("base64url");

/** Scores and stores a parsed submission (its files too); returns it. */
export const saveSubmission = async (form: Form, parsed: Parsed, meta: { ip: string; origin: string; recentFromIp: number; country?: string }) => {
  const hash = hashOf(form.key, parsed.data);
  const duplicate = !!db.prepare("SELECT 1 FROM submission WHERE form_key = ? AND hash = ? AND created_at > ?").get(form.key, hash, now() - 86400);
  const check = spamCheck({ data: parsed.data, honeypot: parsed.options.honeypot, email: parsed.options.replyTo, ip: meta.ip, recentFromIp: meta.recentFromIp, duplicate, blocklist: form.blocklist, threshold: SENSITIVITY[form.config.sensitivity] });
  const ruled = applyRules(form.config.rules, parsed.data);
  if (ruled.spam && !check.spam) {
    check.signals.push({ reason: `Rule: ${ruled.matched.join(", ")}`, points: 0 });
    check.spam = true;
  }
  const subId = id(12);
  const files: FileInfo[] = parsed.files.map(({ field, file }) => ({ field, name: file.name.replace(/[\r\n"\\/]/g, "_").slice(0, 200) || "file", type: file.type.slice(0, 100), size: file.size }));
  if (parsed.files.length) {
    const dir = join(filesDir(), subId);
    mkdirSync(dir, { recursive: true });
    // shortcut: base64 inside the cipher text makes files a third bigger on disk; switch to a byte cipher if that matters.
    for (const [n, { file }] of parsed.files.entries()) writeFileSync(join(dir, String(n)), encrypt(Buffer.from(await file.arrayBuffer()).toString("base64")));
  }
  db.prepare(
    `INSERT INTO submission (id, form_key, data, files, status, score, signals, hash, origin, subject, reply_to, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(subId, form.key, seal(parsed.data), seal(files), check.spam ? "spam" : "inbox", check.score, JSON.stringify(check.signals), hash, meta.origin, seal(parsed.options.subject), seal(parsed.options.replyTo), now());
  db.prepare(
    `INSERT INTO stat (form_key, day, status, source, country, n) VALUES (?, date('now'), ?, ?, ?, 1)
     ON CONFLICT DO UPDATE SET n = n + 1`,
  ).run(form.key, check.spam ? "spam" : "inbox", meta.origin.replace(/^https?:\/\//, ""), meta.country ?? "");
  return submissionById(subId)!;
};

export const submissionById = (subId: string) => toSubmission(db.prepare("SELECT * FROM submission WHERE id = ?").get(subId));

export const PAGE = 50;
export const PER_PAGE = [25, 50, 100];
const values = (s: Submission) => Object.values(s.data).flat();
export const VIEWS = ["inbox", "unread", "starred", "spam"] as const;
export type View = (typeof VIEWS)[number];
const VIEW_SQL: Record<View, string> = { inbox: "status = 'inbox'", unread: "status = 'inbox' AND read_at IS NULL", starred: "starred = 1", spam: "status = 'spam'" };
/** One form's key, a list of keys (a workspace), or null for every form. */
export type Scope = string | string[] | null;
const scopeSql = (scope: Scope): [string, string[]] =>
  scope === null ? ["", []] : typeof scope === "string" ? [" AND form_key = ?", [scope]] : [` AND form_key IN (${scope.map(() => "?").join(", ") || "NULL"})`, scope];
export type ListOptions = { perPage?: number; days?: number; order?: "new" | "old" };
/** The inbox filters in an admin URL (?view=&q=&days=&order=&per=&page=), checked; the list and its CSV export read the same ones. */
export const listQuery = (p: URLSearchParams) => {
  // `tab=spam`, `show=` and the export's `status=spam` are old addresses (emails and bookmarks still use them).
  const asked = p.get("view") ?? (p.get("tab") === "spam" || p.get("status") === "spam" ? "spam" : p.get("show"));
  return {
    view: (VIEWS as readonly string[]).includes(asked ?? "") ? (asked as View) : "inbox",
    q: (p.get("q") ?? "").slice(0, 200),
    page: Math.max(1, Number(p.get("page")) || 1),
    days: [7, 30, 90].includes(Number(p.get("days"))) ? Number(p.get("days")) : 0,
    order: p.get("order") === "old" ? ("old" as const) : ("new" as const),
    perPage: PER_PAGE.includes(Number(p.get("per"))) ? Number(p.get("per")) : PAGE,
  };
};
const CHUNK = 1000;
/** Every submission of a view in list order, read CHUNK rows at a time, so a big inbox never sits in memory at once. */
export function* eachSubmission(scope: Scope, view: View, q = "", o: ListOptions = {}) {
  const [sql, keys] = scopeSql(scope);
  const old = o.order === "old";
  const dir = old ? "ASC" : "DESC";
  // Continues after the last row read, so rows arriving meanwhile are neither repeated nor skipped.
  // shortcut: starred and workspace-wide views re-sort their rows for every chunk; past a million rows, read through a second connection instead.
  const next = db.prepare(
    `SELECT rowid AS _rowid, * FROM submission WHERE ${VIEW_SQL[view]}${sql} AND created_at > ? AND (created_at, rowid) ${old ? ">" : "<"} (?, ?)
     ORDER BY created_at ${dir}, rowid ${dir} LIMIT ${CHUNK}`,
  );
  const needle = q.toLowerCase();
  let at = old ? [-1, -1] : [Number.MAX_SAFE_INTEGER, Number.MAX_SAFE_INTEGER];
  for (;;) {
    const rows = next.all(...keys, o.days ? now() - o.days * 86400 : -1, ...at) as { _rowid: number; created_at: number }[];
    for (const r of rows) {
      const s = toSubmission(r)!;
      if (!needle || values(s).some((v) => v.toLowerCase().includes(needle))) yield s;
    }
    if (rows.length < CHUNK) return;
    at = [rows.at(-1)!.created_at, rows.at(-1)!._rowid];
  }
}
/** One page of submissions in a view, newest first unless asked; `q` searches every field, `days` keeps the recent ones. */
export const submissions = (scope: Scope, view: View, q = "", page = 1, o: ListOptions = {}) => {
  const perPage = o.perPage ?? PAGE;
  if (!q) {
    const [sql, keys] = scopeSql(scope);
    const where = `${VIEW_SQL[view]}${sql}${o.days ? " AND created_at > ?" : ""}`;
    const args: (string | number)[] = o.days ? [...keys, now() - o.days * 86400] : keys;
    const dir = o.order === "old" ? "ASC" : "DESC";
    const total = (db.prepare(`SELECT COUNT(*) AS n FROM submission WHERE ${where}`).get(...args) as { n: number }).n;
    const rows = db.prepare(`SELECT * FROM submission WHERE ${where} ORDER BY created_at ${dir}, rowid ${dir} LIMIT ? OFFSET ?`).all(...args, perPage, (page - 1) * perPage);
    return { total, items: rows.map((r) => toSubmission(r)!) };
  }
  // shortcut: fields are encrypted, so search decrypts the whole inbox, a chunk at a time; fine to tens of thousands, then add an index.
  const items: Submission[] = [];
  let total = 0;
  for (const s of eachSubmission(scope, view, q, o)) if (total++ >= (page - 1) * perPage && items.length < perPage) items.push(s);
  return { total, items };
};
export const counts = (scope: Scope) => {
  const [sql, keys] = scopeSql(scope);
  const r = db
    .prepare(`SELECT SUM(status = 'inbox') AS inbox, SUM(status = 'spam') AS spam, SUM(status = 'inbox' AND read_at IS NULL) AS unread, SUM(starred) AS starred FROM submission WHERE 1${sql}`)
    .get(...keys) as Record<View, number | null>;
  return Object.fromEntries(VIEWS.map((v) => [v, r[v] ?? 0])) as Record<View, number>;
};

export const setStatus = (subId: string, status: "inbox" | "spam") => db.prepare("UPDATE submission SET status = ? WHERE id = ?").run(status, subId).changes > 0;
export const setRead = (subId: string, read: boolean) => db.prepare(`UPDATE submission SET read_at = ${read ? "COALESCE(read_at, ?)" : "NULL"} WHERE id = ?`).run(...(read ? [now(), subId] : [subId]));
export const setStarred = (subId: string, starred: boolean) => db.prepare("UPDATE submission SET starred = ? WHERE id = ?").run(starred ? 1 : 0, subId);
export const deleteSubmission = (subId: string) => {
  removeFiles(subId);
  return db.prepare("DELETE FROM submission WHERE id = ?").run(subId).changes > 0;
};
const removeFiles = (subId: string) => rmSync(join(filesDir(), subId), { recursive: true, force: true });
/** The stored file `n` of a submission, decrypted; null when it is gone. */
export const readUpload = (subId: string, n: number) => {
  try {
    return Buffer.from(decrypt(readFileSync(join(filesDir(), subId, String(n)), "utf8")), "base64");
  } catch {
    return null;
  }
};

// ---- Workspaces: forms grouped by client or project ----

export const workspaces = () =>
  db.prepare("SELECT id, name, (SELECT COUNT(*) FROM form WHERE workspace_id = workspace.id) AS forms FROM workspace ORDER BY created_at, rowid").all() as { id: string; name: string; forms: number }[];
export const createWorkspace = (name: string) => {
  const wsId = id(8);
  db.prepare("INSERT INTO workspace (id, name, created_at) VALUES (?, ?, ?)").run(wsId, name, now());
  return wsId;
};
export const renameWorkspace = (wsId: string, name: string) => db.prepare("UPDATE workspace SET name = ? WHERE id = ?").run(name, wsId).changes > 0;
/** Only an empty workspace, and never the last one. */
export const deleteWorkspace = (wsId: string) => {
  const all = workspaces();
  if (all.length < 2 || all.find((w) => w.id === wsId)?.forms !== 0) return false;
  return db.prepare("DELETE FROM workspace WHERE id = ?").run(wsId).changes > 0;
};
// The first start (or an upgrade from before workspaces) gets one, holding every form.
if (!workspaces().length) createWorkspace("My workspace");
db.prepare("UPDATE form SET workspace_id = ? WHERE workspace_id NOT IN (SELECT id FROM workspace)").run(workspaces()[0].id);

// ---- Retention and data requests ----

/** Spam is deleted after this many days whatever the form's setting. */
export const SPAM_DAYS = 30;
/** Deletes submissions (and their files) older than their form's retention; spam after SPAM_DAYS. */
export const purgeExpired = (at = now()) => {
  const old = db
    .prepare(
      `SELECT s.id FROM submission s JOIN form f ON f.key = s.form_key
       WHERE (s.status = 'spam' AND s.created_at < ?) OR (f.retention_days > 0 AND s.created_at < ? - f.retention_days * 86400)`,
    )
    .all(at - SPAM_DAYS * 86400, at) as { id: string }[];
  for (const { id } of old) deleteSubmission(id);
  return old.length;
};
setInterval(() => purgeExpired(), 3600_000).unref();
setTimeout(() => purgeExpired(), 0).unref();

/** Every submission, in any form, that names this email in a field or as the reply address: for access and erasure requests. */
// shortcut: decrypts every submission; fine to ~100k rows, then store a keyed hash of each email to look them up.
export const submissionsByEmail = (email: string) => {
  const e = email.trim().toLowerCase();
  return db
    .prepare("SELECT * FROM submission ORDER BY created_at")
    .all()
    .map((r) => toSubmission(r)!)
    .filter((s) => s.replyTo.toLowerCase() === e || values(s).some((v) => v.trim().toLowerCase() === e));
};

// ---- Deliveries ----

export type Delivery = { kind: string; target: string; ok: number; detail: string; at: number };
export const logDelivery = (subId: string, d: Omit<Delivery, "at">) =>
  db.prepare("INSERT INTO delivery (submission_id, kind, target, ok, detail, at) VALUES (?, ?, ?, ?, ?, ?)").run(subId, d.kind, d.target, d.ok, d.detail.slice(0, 500), now());
export const deliveries = (subId: string) => db.prepare("SELECT kind, target, ok, detail, at FROM delivery WHERE submission_id = ? ORDER BY id").all(subId) as Delivery[];

// ---- API keys (REST API and MCP) ----

const keyHash = (key: string) => createHmac("sha256", env("BETTER_AUTH_SECRET") ?? "").update(key).digest("hex");
/** A new key; the full key is only returned here, the database keeps a hash. */
export const createApiKey = (name: string) => {
  const key = `gf_${id(24)}`;
  db.prepare("INSERT INTO api_key (id, name, hash, hint, created_at) VALUES (?, ?, ?, ?, ?)").run(id(8), name, keyHash(key), key.slice(-4), now());
  return key;
};
export const apiKeys = () => db.prepare("SELECT id, name, hint, created_at AS createdAt, last_used_at AS lastUsedAt FROM api_key ORDER BY created_at").all() as { id: string; name: string; hint: string; createdAt: number; lastUsedAt: number | null }[];
export const revokeApiKey = (keyId: string) => db.prepare("DELETE FROM api_key WHERE id = ?").run(keyId).changes > 0;
/** The key's row when `key` is valid (and marks it used). */
export const apiKeyFor = (key: string) => {
  if (!key.startsWith("gf_")) return null;
  const row = db.prepare("SELECT id, name FROM api_key WHERE hash = ?").get(keyHash(key)) as { id: string; name: string } | undefined;
  if (row) db.prepare("UPDATE api_key SET last_used_at = ? WHERE id = ?").run(now(), row.id);
  return row ?? null;
};
