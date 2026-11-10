import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

process.env.DB_PATH = join(mkdtempSync(join(tmpdir(), "forms-inbox-")), "db.sqlite");
process.env.BETTER_AUTH_SECRET = "test-secret";
const { db } = await import("../../../lib/db.ts");
const f = await import("./forms.ts");
const { analytics, monthUsage } = await import("./stats.ts");
const { defaults, patchConfig } = await import("./config.ts");
const { viewCsv } = await import("./csv.ts");

const form = f.formByKey(f.createForm("Contact", "owner@example.com"))!;
const save = (name: string, origin = "https://site.test", country = "") =>
  f.saveSubmission(form, { data: { name, message: "Hello there" }, files: [], options: { redirect: "", subject: "", replyTo: "", honeypot: "", captcha: "" } }, { ip: "203.0.113.7", origin, recentFromIp: 0, country });

test("unread and starred views, read state, date range and order", async () => {
  const a = await save("Ada");
  const b = await save("Bob");
  db.prepare("UPDATE submission SET created_at = created_at - 10 * 86400 WHERE id = ?").run(a.id);
  assert.deepEqual(f.counts(form.key), { inbox: 2, unread: 2, starred: 0, spam: 0 });
  f.setRead(b.id, true);
  f.setStarred(a.id, true);
  assert.deepEqual(f.submissions(form.key, "unread").items.map((s) => s.id), [a.id]);
  assert.deepEqual(f.submissions(form.key, "starred").items.map((s) => s.id), [a.id]);
  assert.deepEqual(f.submissions(form.key, "inbox", "", 1, { days: 7 }).items.map((s) => s.id), [b.id]);
  assert.deepEqual(f.submissions(form.key, "inbox", "", 1, { order: "old" }).items.map((s) => s.id), [a.id, b.id]);
  assert.equal(f.submissions(form.key, "inbox", "", 2, { perPage: 1 }).items[0].id, a.id);
  assert.equal(f.submissions([], "inbox").total, 0, "an empty workspace shows nothing");
  f.setRead(b.id, false);
  assert.equal(f.counts([form.key]).unread, 2);
});

test("analytics count on arrival, by site and country, and survive deletion", async () => {
  const s = await save("Cy", "https://shop.test", "TR");
  f.deleteSubmission(s.id);
  const a = analytics(form.key, 7);
  assert.equal(a.total, 3);
  assert.equal(a.series.length, 7);
  assert.equal(a.series.at(-1)!.inbox, 3);
  assert.deepEqual(a.countries.find((c) => c.name === "TR"), { name: "TR", n: 1 });
  assert.deepEqual(a.sources[0], { name: "site.test", n: 2 });
  assert.equal(monthUsage(), 3);
});

test("workspaces: forms move, an empty one can go, the last one stays", () => {
  const [first] = f.workspaces();
  assert.equal(form.workspaceId, first.id);
  const ws = f.createWorkspace("Client");
  f.moveForm(form.key, ws);
  assert.deepEqual(f.forms(ws).map((x) => x.key), [form.key]);
  assert.equal(f.deleteWorkspace(ws), false, "still has a form");
  f.moveForm(form.key, first.id);
  assert.equal(f.deleteWorkspace(ws), true);
  assert.equal(f.deleteWorkspace(first.id), false, "the last workspace stays");
});

test("a digest needs stored submissions", () => {
  assert.throws(() => patchConfig(defaults(), { archive: false, email: { intro: "", digest: "daily" } }), /digest needs stored/);
  assert.equal(patchConfig(defaults(), { email: { intro: "Hi team", digest: "hourly" } }).email.digest, "hourly");
  assert.throws(() => patchConfig(defaults(), { email: { digest: "weekly" } }), /valid digest/);
});

test("CSV export follows the view, search and date filters", async () => {
  const csv = async (query: string) => (await viewCsv(form.key, new URLSearchParams(query), "Contact").text()).trim().split("\r\n");
  const all = await csv("");
  assert.equal(all.length, 3, "header and two rows");
  assert.match(all[0], /^\uFEFF?id,submitted_at,name,message,files$/);
  assert.equal((await csv("q=bob")).length, 2);
  assert.equal((await csv("days=7")).length, 2, "Ada is ten days old");
  assert.equal((await csv("view=starred")).length, 2);
  assert.equal((await csv("status=spam")).length, 1, "old ?status=spam still means spam");

  // More rows than one read chunk: every row once, in order, and search still pages.
  const big = f.formByKey(f.createForm("Big", "owner@example.com"))!;
  const row = db.prepare("INSERT INTO submission (id, form_key, data, files, status, score, signals, hash, origin, subject, reply_to, created_at) SELECT ?, ?, data, files, status, score, signals, hash, origin, subject, reply_to, ? FROM submission WHERE form_key = ? LIMIT 1");
  for (let i = 0; i < 2500; i++) row.run(`big${i}`, big.key, 1000 + Math.floor(i / 3), form.key);
  const ids = (await viewCsv(big.key, new URLSearchParams("order=old"), "Big").text()).trim().split("\r\n").slice(1).map((l) => l.split(",")[0]);
  assert.deepEqual(ids, Array.from({ length: 2500 }, (_, i) => `big${i}`));
  assert.equal(new Set((await viewCsv(big.key, new URLSearchParams(""), "Big").text()).trim().split("\r\n")).size, 2501);
  const found = f.submissions(big.key, "inbox", "hello", 2, { perPage: 100, order: "old" });
  assert.deepEqual([found.total, found.items.length, found.items[0].id], [2500, 100, "big100"]);
});
