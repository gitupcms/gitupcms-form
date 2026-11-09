/**
 * Form rules: "when these fields match, then…". Run top to bottom on every new submission; each matching rule
 * applies its actions, and one with "stop" ends the run. Pure, so the admin can dry-run them on a sample.
 */
import type { Condition, Rule } from "./config.ts";
import type { Fields } from "./spam.ts";

export type Outcome = {
  matched: string[];
  /** null: the form's own recipients. */
  to: string[] | null;
  subject: string;
  webhooks: string[];
  spam: boolean;
};

const text = (v: string | string[] | undefined) => [v ?? ""].flat().join(", ").trim().toLowerCase();

export const conditionMatches = (c: Condition, data: Fields) => {
  const v = text(data[c.field]);
  const want = c.value.trim().toLowerCase();
  switch (c.op) {
    case "equals":
      return [data[c.field] ?? ""].flat().some((x) => x.trim().toLowerCase() === want);
    case "not_equals":
      return ![data[c.field] ?? ""].flat().some((x) => x.trim().toLowerCase() === want);
    case "contains":
      return v.includes(want);
    case "not_contains":
      return !v.includes(want);
    case "empty":
      return !v;
    case "not_empty":
      return !!v;
  }
};

export const applyRules = (rules: Rule[], data: Fields): Outcome => {
  const out: Outcome = { matched: [], to: null, subject: "", webhooks: [], spam: false };
  for (const r of rules) {
    const hit = r.match === "any" ? r.conditions.some((c) => conditionMatches(c, data)) : r.conditions.every((c) => conditionMatches(c, data));
    if (!hit) continue;
    out.matched.push(r.name);
    const a = r.actions;
    if (a.to) out.to = [...(out.to ?? []), ...a.to.split(/[\s,]+/).filter(Boolean)];
    if (a.subject) out.subject = a.subject.replace(/\{\{\s*([\w.\-\[\]]+)\s*\}\}/g, (_, k) => text(data[k]) && [data[k]].flat().join(", ").slice(0, 100));
    if (a.webhook) out.webhooks.push(a.webhook);
    if (a.spam) out.spam = true;
    if (a.stop) break;
  }
  if (out.to) out.to = [...new Set(out.to)];
  return out;
};
