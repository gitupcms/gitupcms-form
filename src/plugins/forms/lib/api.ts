/**
 * What an API key may do, shared by the REST API (/api/v1) and the MCP server (/mcp). Each tool checks its own
 * input; secrets (webhook secret, channel tokens) never leave through here.
 */
import { HttpError } from "../../../lib/http.ts";
import { applyRules } from "./rules.ts";
import { deleteSubmission, formByKey, forms, list, setStatus, submissionById, submissions, PAGE, type Submission } from "./forms.ts";

type Args = Record<string, unknown>;
export type Tool = { name: string; description: string; inputSchema: object; run: (a: Args) => unknown };

const str = (v: unknown) => String(v ?? "").trim();
const formOf = (a: Args) => {
  const form = formByKey(str(a.form));
  if (!form) throw new HttpError("Form not found.", 404);
  return form;
};
const subOf = (a: Args) => {
  const sub = submissionById(str(a.id));
  if (!sub) throw new HttpError("Submission not found.", 404);
  return sub;
};
const status = (v: unknown) => (v === "spam" ? "spam" : "inbox");
const show = (s: Submission) => ({ id: s.id, form: s.formKey, status: s.status, createdAt: new Date(s.createdAt * 1000).toISOString(), data: s.data, files: s.files, spamScore: s.score });

const obj = (properties: object, required: string[] = []) => ({ type: "object", properties, required });
const FORM = { form: { type: "string", description: "The form's key (from list_forms)" } };

export const TOOLS: Tool[] = [
  {
    name: "list_forms",
    description: "Every form with its key, name, allowed domains and how many submissions are in its inbox.",
    inputSchema: obj({}),
    run: () => forms().map((f) => ({ key: f.key, name: f.name, domains: f.domains, inbox: f.inbox, lastAt: f.lastAt ? new Date(f.lastAt * 1000).toISOString() : null })),
  },
  {
    name: "get_form",
    description: "One form's settings that are safe to share: name, recipients, domains, paused or not, rules.",
    inputSchema: obj(FORM, ["form"]),
    run: (a) => {
      const f = formOf(a);
      return { key: f.key, name: f.name, active: f.config.active, recipients: list(f.recipients), domains: list(f.domains), retentionDays: f.retentionDays, captcha: f.config.captcha.provider || null, rules: f.config.rules, builderFields: f.config.builder.enabled ? f.config.builder.fields : null };
    },
  },
  {
    name: "list_submissions",
    description: `Submissions, newest first, ${PAGE} per page. Leave out "form" for every form.`,
    inputSchema: obj({ ...FORM, status: { type: "string", enum: ["inbox", "spam"] }, q: { type: "string", description: "Text to search for in any field" }, page: { type: "integer", minimum: 1 } }),
    run: (a) => {
      const page = Math.max(1, Math.floor(Number(a.page)) || 1);
      const { total, items } = submissions(a.form ? formOf(a).key : null, status(a.status), str(a.q).slice(0, 200), page);
      return { total, page, pages: Math.max(1, Math.ceil(total / PAGE)), items: items.map(show) };
    },
  },
  { name: "get_submission", description: "One submission with every field.", inputSchema: obj({ id: { type: "string" } }, ["id"]), run: (a) => show(subOf(a)) },
  {
    name: "set_submission_status",
    description: "Move a submission to the inbox or to spam.",
    inputSchema: obj({ id: { type: "string" }, status: { type: "string", enum: ["inbox", "spam"] } }, ["id", "status"]),
    run: (a) => (setStatus(subOf(a).id, status(a.status)), { ok: true }),
  },
  {
    name: "delete_submission",
    description: "Delete a submission and its files for good. Cannot be undone.",
    inputSchema: obj({ id: { type: "string" } }, ["id"]),
    run: (a) => (deleteSubmission(subOf(a).id), { ok: true }),
  },
  {
    name: "test_rules",
    description: "Dry run: which of the form's rules a sample submission would match and where it would go. Nothing is stored or sent.",
    inputSchema: obj({ ...FORM, data: { type: "object", description: "Field name → value", additionalProperties: { type: "string" } } }, ["form", "data"]),
    run: (a) => {
      const f = formOf(a);
      const data = Object.fromEntries(Object.entries(a.data && typeof a.data === "object" ? a.data : {}).map(([k, v]) => [k, String(v)]));
      const out = applyRules(f.config.rules, data);
      return { ...out, to: out.to ?? list(f.recipients) };
    },
  },
];

export const tool = (name: string) => TOOLS.find((t) => t.name === name);
