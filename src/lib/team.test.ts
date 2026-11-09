import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

process.env.DB_PATH = join(mkdtempSync(join(tmpdir(), "gitupcms-forms-")), "test.db");
const { db } = await import("./db.ts");
const t = await import("./team.ts");

test("an invite lets only its email in, once, until it expires", () => {
  const token = t.invite("New@Example.com");
  assert.equal(t.inviteEmail(token), "New@Example.com");
  assert.equal(t.inviteEmail("nope"), null);
  assert.ok(t.invited("new@example.com"), "emails match without case");
  assert.ok(!t.invited("other@example.com"));
  const again = t.invite("new@example.com");
  assert.equal(t.inviteEmail(token), null, "a new invite replaces the old link");
  t.useInvite("new@example.com");
  assert.equal(t.inviteEmail(again), null);
  db.prepare("INSERT INTO admin_invite (token, email, expires_at) VALUES ('old', 'late@example.com', 1)").run();
  assert.ok(!t.invited("late@example.com"), "expired");
});

test("removing an admin signs them out", () => {
  db.exec(`CREATE TABLE "user" (id TEXT PRIMARY KEY, name TEXT, email TEXT, "createdAt" TEXT);
    CREATE TABLE "session" (id TEXT, "userId" TEXT); CREATE TABLE "account" (id TEXT, "userId" TEXT);
    INSERT INTO "user" VALUES ('a', 'A', 'a@x.co', '2026-01-01'), ('b', 'B', 'b@x.co', '2026-01-02');
    INSERT INTO "session" VALUES ('s', 'b'); INSERT INTO "account" VALUES ('c', 'b');`);
  assert.ok(t.removeAdmin("b"));
  assert.deepEqual(t.admins().map((a) => a.id), ["a"]);
  assert.equal((db.prepare('SELECT COUNT(*) AS n FROM "session"').get() as { n: number }).n, 0);
  assert.ok(!t.removeAdmin("b"));
});
