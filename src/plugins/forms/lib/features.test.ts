import { test } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";

process.env.BETTER_AUTH_SECRET = "test-secret";
const { applyRules } = await import("./rules.ts");
const { altchaChallenge, verifyAltcha } = await import("./captcha.ts");
const { defaults, patchConfig, forAdmin } = await import("./config.ts");
const { plainText } = await import("./channels.ts");

const rule = ({ name = "r", ...over }: any) => ({ name, match: "all", conditions: [{ field: "topic", op: "equals", value: "Sales" }], actions: { to: "", subject: "", webhook: "", spam: false, stop: false, ...over } });

test("rules route, rename, mark spam and stop in order", () => {
  const rules = [rule({ to: "sales@x.com", subject: "Lead from {{name}}" }), rule({ name: "stopper", stop: true }), rule({ name: "never", spam: true })] as any;
  const out = applyRules(rules, { topic: "sales", name: "Ada" });
  assert.deepEqual(out.to, ["sales@x.com"]);
  assert.equal(out.subject, "Lead from Ada");
  assert.equal(out.spam, false, "the rule after stop must not run");
  assert.deepEqual(out.matched, ["r", "stopper"]);
  assert.equal(applyRules(rules, { topic: "support" }).to, null, "no match keeps the form's recipients");
  const any = [{ ...rule({ spam: true }), match: "any", conditions: [{ field: "a", op: "contains", value: "casino" }, { field: "b", op: "empty", value: "" }] }] as any;
  assert.equal(applyRules(any, { a: "hello", b: "" }).spam, true);
});

test("Altcha: a solved puzzle passes once, for its own form only", () => {
  const c = altchaChallenge("form1");
  let number = 0;
  while (createHash("sha256").update(c.salt + number).digest("hex") !== c.challenge) number++;
  const payload = Buffer.from(JSON.stringify({ algorithm: "SHA-256", challenge: c.challenge, number, salt: c.salt, signature: c.signature })).toString("base64");
  assert.equal(verifyAltcha(payload, "form2"), false);
  assert.equal(verifyAltcha(payload, "form1"), true);
  assert.equal(verifyAltcha(payload, "form1"), false, "replay");
  const late = altchaChallenge("form1", Date.now() - 700_000);
  const bad = Buffer.from(JSON.stringify({ ...late, number: 1 })).toString("base64");
  assert.equal(verifyAltcha(bad, "form1"), false);
  assert.equal(verifyAltcha("not base64 json", "form1"), false);
});

test("config: validation, and secrets kept when the admin leaves them empty", () => {
  const base = patchConfig(defaults(), { telegram: { token: "123:abc", chatId: "42" }, captcha: { provider: "turnstile", siteKey: "s", secret: "shh" } });
  const next = patchConfig(base, { telegram: { token: "", chatId: "43" }, captcha: { provider: "turnstile", siteKey: "s2", secret: "" } });
  assert.equal(next.telegram.token, "123:abc");
  assert.equal(next.captcha.secret, "shh");
  assert.equal(patchConfig(next, { telegram: { token: "", chatId: "" } }).telegram.token, "", "emptying the section clears it");
  assert.equal(forAdmin(next).config.captcha.secret, "");
  assert.equal(forAdmin(next).saved.captcha, true);
  assert.throws(() => patchConfig(defaults(), { slack: "https://evil.example/hook" }), /Slack/);
  assert.throws(() => patchConfig(defaults(), { nope: 1 }), /Unknown setting/);
  assert.throws(() => patchConfig(defaults(), { rules: [rule({})] }), /does nothing/);
});

test("channel text is cut to the limit and keeps the link", () => {
  const text = plainText({ form: "Contact", data: { message: "x".repeat(5000) }, files: [], url: "https://app/s/1", createdAt: "" }, 300);
  assert.ok(text.length <= 300);
  assert.ok(text.endsWith("https://app/s/1"));
});

test("Airtable leaves out fields the table has no column for; Sheets needs the script's ok", async () => {
  const { channels } = await import("./channels.ts");
  const real = globalThis.fetch;
  const columns = new Set(["Name"]);
  const sent: any[] = [];
  globalThis.fetch = (async (url: string, init: any) => {
    if (String(url).includes("airtable")) {
      const fields = JSON.parse(init.body).records[0].fields;
      const bad = Object.keys(fields).find((k) => !columns.has(k));
      if (bad) return new Response(JSON.stringify({ error: { type: "UNKNOWN_FIELD_NAME", message: `Unknown field name: "${bad}"` } }), { status: 422 });
      sent.push(fields);
      return new Response("{}", { status: 200 });
    }
    if (String(url).includes("script.google.com")) return new Response(null, { status: 302, headers: { location: "https://script.googleusercontent.com/echo" } });
    return new Response(sent.length ? "ok" : "<html>Error: TypeError</html>");
  }) as any;
  try {
    const c = { ...defaults(), airtable: { token: "pat1", base: "app1", table: "T" }, sheets: "https://script.google.com/macros/s/x/exec" };
    const all = channels(c, { form: "F", data: { name: "Ada", email: "a@b.co" }, files: [], url: "u", createdAt: "" });
    const air = all.find((ch) => ch.kind === "airtable")!;
    const sheet = all.find((ch) => ch.kind === "sheets")!;
    assert.match(await air.run(), /no column for: Email/);
    assert.deepEqual(sent, [{ Name: "Ada" }]);
    assert.equal(await sheet.run(), "row added");
    sent.length = 0;
    await assert.rejects(sheet.run(), /did not add the row/);
  } finally {
    globalThis.fetch = real;
  }
});
