import { test } from "node:test";
import assert from "node:assert/strict";
import { spamCheck, THRESHOLD } from "./spam.ts";
import { toCsv } from "./csv.ts";
import { readSpamToken, spamToken } from "./sign.ts";
import { parseSubmission } from "./parse.ts";

process.env.BETTER_AUTH_SECRET = "test-secret";

const base = { data: { name: "Ada", message: "Hello there" }, honeypot: "", email: "ada@example.com", ip: "203.0.113.7", recentFromIp: 0, duplicate: false, blocklist: "" };

test("a normal message passes", () => {
  const r = spamCheck(base);
  assert.equal(r.spam, false);
  assert.equal(r.score, 0);
});

test("honeypot, blocklist (word, email, IP) and link floods are spam", () => {
  assert.ok(spamCheck({ ...base, honeypot: "x" }).spam);
  assert.ok(spamCheck({ ...base, blocklist: "Casino\n", data: { message: "best CASINO here" } }).spam);
  assert.ok(spamCheck({ ...base, blocklist: "ada@example.com" }).spam);
  assert.ok(spamCheck({ ...base, blocklist: "203.0.113.7" }).spam);
  assert.ok(spamCheck({ ...base, data: { message: "http://a http://b http://c" }, recentFromIp: 5 }).spam);
  assert.ok(spamCheck({ ...base, data: { a: "", b: " " } }).spam);
});

test("one weak signal alone stays in the inbox", () => {
  for (const extra of [{ duplicate: true }, { recentFromIp: 5 }, { data: { message: "see https://x.dev" } }, { email: "not-an-email" }]) {
    const r = spamCheck({ ...base, ...extra });
    assert.ok(r.score < THRESHOLD, JSON.stringify(extra));
    assert.ok(r.signals.length > 0);
  }
});

test("CSV: union of columns, quoting, formula cells defused", () => {
  const csv = toCsv([
    { id: "a", createdAt: "2026-01-01T00:00:00.000Z", data: { name: "Ada", note: 'say "hi", ok' }, files: [] },
    { id: "b", createdAt: "2026-01-02T00:00:00.000Z", data: { name: "=HYPERLINK(1)", tags: ["x", "y"] }, files: [{ name: "cv.pdf" }] },
  ]);
  const lines = csv.replace("﻿", "").trim().split("\r\n");
  assert.equal(lines[0], "id,submitted_at,name,note,tags,files");
  assert.equal(lines[1], 'a,2026-01-01T00:00:00.000Z,Ada,"say ""hi"", ok",,');
  assert.equal(lines[2], 'b,2026-01-02T00:00:00.000Z,\'=HYPERLINK(1),,"x, y",cv.pdf');
});

test("spam links: valid for 7 days, tied to one submission", () => {
  const t = spamToken("sub1", 0);
  assert.equal(readSpamToken(t, 1000), "sub1");
  assert.equal(readSpamToken(t, 8 * 86400_000), null);
  assert.equal(readSpamToken(t.replace("sub1", "sub2"), 1000), null);
  assert.equal(readSpamToken("garbage"), null);
});

const req = (body: BodyInit, type?: string, length?: number) => {
  const r = new Request("http://x/f/k", { method: "POST", body, headers: type ? { "content-type": type } : {} });
  const headers = new Headers(r.headers);
  headers.set("content-length", String(length ?? 10));
  return new Request("http://x/f/k", { method: "POST", body, headers, duplex: "half" } as RequestInit);
};

test("parse: urlencoded with repeated names and reserved fields", async () => {
  const p = await parseSubmission(req("name=Ada&tag=a&tag=b&email=ada%40x.dev&_redirect=%2Fthanks&_gotcha=&_secret=1", "application/x-www-form-urlencoded"));
  assert.deepEqual(p.data, { name: "Ada", tag: ["a", "b"], email: "ada@x.dev" });
  assert.equal(p.options.redirect, "/thanks");
  assert.equal(p.options.replyTo, "ada@x.dev");
});

test("parse: JSON, multipart files, and the limits", async () => {
  const p = await parseSubmission(req(JSON.stringify({ n: 1, list: [1, 2], obj: { a: 1 } }), "application/json"));
  assert.deepEqual(p.data, { n: "1", list: ["1", "2"], obj: '{"a":1}' });
  const fd = new FormData();
  fd.append("email", "a@b.co");
  fd.append("cv", new File(["hello"], "cv.txt", { type: "text/plain" }));
  fd.append("empty", new File([], ""));
  const blob = await new Request("http://x", { method: "POST", body: fd }).blob();
  const m = await parseSubmission(req(blob, blob.type));
  assert.equal(m.files.length, 1);
  assert.equal(m.files[0].file.name, "cv.txt");
  await assert.rejects(parseSubmission(req("a=1", "text/plain")), /normal HTML form/);
  await assert.rejects(parseSubmission(req("a=1", "application/x-www-form-urlencoded", 200_000)), /too large/);
  await assert.rejects(parseSubmission(req("a=1", "application/x-www-form-urlencoded", 0)), /Content-Length/);
});
