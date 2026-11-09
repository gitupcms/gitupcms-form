import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readdirSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const dir = mkdtempSync(join(tmpdir(), "forms-privacy-"));
process.env.DB_PATH = join(dir, "db.sqlite");
process.env.BETTER_AUTH_SECRET = "test-secret";
const { db } = await import("../../../lib/db.ts");
const f = await import("./forms.ts");

const form = f.formByKey(f.createForm("Contact", "owner@example.com"))!;
const save = (data: Record<string, string>, files: File[] = []) =>
  f.saveSubmission(form, { data, files: files.map((file) => ({ field: "cv", file })), options: { redirect: "", subject: "Hi", replyTo: data.email ?? "", honeypot: "", captcha: "" } }, { ip: "203.0.113.7", origin: "https://site.test", recentFromIp: 0 });
const raw = () => readFileSync(process.env.DB_PATH!, "latin1") + readFileSync(`${process.env.DB_PATH}-wal`, "latin1");

test("what visitors send is encrypted on disk; IPs are not stored", async () => {
  const sub = await save({ name: "Ada Lovelace", email: "Ada@Example.com" }, [new File(["secret cv text"], "cv.txt")]);
  assert.deepEqual(f.submissionById(sub.id)!.data, { name: "Ada Lovelace", email: "Ada@Example.com" });
  assert.ok(!/Ada Lovelace|Example\.com|cv\.txt|203\.0\.113\.7/.test(raw()));
  const file = join(dir, "files", sub.id, readdirSync(join(dir, "files", sub.id))[0]);
  assert.ok(!readFileSync(file, "utf8").includes("secret cv text"));
  assert.equal(f.readUpload(sub.id, 0)!.toString(), "secret cv text");
  assert.equal(f.submissions(form.key, "inbox", "lovelace").total, 1);
});

test("data requests find a person by email in any field, case-insensitively, and delete them", async () => {
  await save({ name: "Bob", contact: "bob@example.com" });
  assert.equal(f.submissionsByEmail("ADA@example.com").length, 1);
  assert.equal(f.submissionsByEmail("bob@example.com").length, 1);
  for (const s of f.submissionsByEmail("ada@example.com")) f.deleteSubmission(s.id);
  assert.equal(f.submissionsByEmail("ada@example.com").length, 0);
});

test("retention deletes old submissions; spam goes after 30 days", async () => {
  const keep = await save({ name: "Recent" });
  const old = await save({ name: "Old" });
  const spam = await save({ name: "Spam" });
  db.prepare("UPDATE submission SET created_at = created_at - 40 * 86400 WHERE id IN (?, ?)").run(old.id, spam.id);
  f.setStatus(spam.id, "spam");
  f.purgeExpired();
  assert.ok(f.submissionById(old.id), "kept while the form keeps everything");
  assert.equal(f.submissionById(spam.id), null);
  f.updateForm(form.key, { ...form, retentionDays: 30 });
  f.purgeExpired();
  assert.equal(f.submissionById(old.id), null);
  assert.ok(f.submissionById(keep.id));
});
