import type { APIRoute } from "astro";
import { HttpError } from "@/lib/http";
import { EMAIL } from "@/lib/team";
import { deleteForm, deleteSubmission, formByKey, list, rotateSecret, setStatus, submissionById, updateForm, type Form } from "@/plugins/forms/lib/forms";
import { deliver } from "@/plugins/forms/lib/deliver";

const url = (value: unknown, label: string) => {
  const v = String(value ?? "").trim();
  if (v && !/^https?:\/\/[^\s]+$/.test(v)) throw new HttpError(`${label} must be a full http(s):// address.`, 400);
  return v;
};

const actions: Record<string, (form: Form, body: any) => unknown> = {
  settings: (form, body) => {
    const name = String(body.name ?? "").trim().slice(0, 100);
    if (!name) throw new HttpError("Give the form a name.", 400);
    const recipients = list(String(body.recipients ?? ""));
    const bad = recipients.find((r) => !EMAIL.test(r));
    if (bad) throw new HttpError(`Not an email address: ${bad}`, 400);
    const domains = list(String(body.domains ?? "")).map((d) => d.replace(/^https?:\/\//, "").replace(/\/.*$/, ""));
    const badDomain = domains.find((d) => !/^[a-z0-9.-]+(:\d+)?$/.test(d));
    if (badDomain) throw new HttpError(`Not a domain: ${badDomain} (use example.com)`, 400);
    updateForm(form.key, {
      name,
      recipients: recipients.join(", "),
      domains: domains.join(", "),
      redirect: url(body.redirect, "The redirect"),
      webhookUrl: url(body.webhookUrl, "The webhook"),
      blocklist: String(body.blocklist ?? "").slice(0, 20_000),
    });
  },
  "rotate-secret": (form) => void rotateSecret(form.key),
  "delete-form": (form, body) => {
    if (body.confirm !== form.name) throw new HttpError(`Type ${form.name} to delete the form.`, 400);
    deleteForm(form.key);
  },
  status: (form, body) => {
    const sub = submissionById(String(body.id ?? ""));
    if (!sub || sub.formKey !== form.key) throw new HttpError("Submission not found.", 404);
    setStatus(sub.id, body.status === "spam" ? "spam" : "inbox");
  },
  resend: async (form, body) => {
    const sub = submissionById(String(body.id ?? ""));
    if (!sub || sub.formKey !== form.key) throw new HttpError("Submission not found.", 404);
    await deliver(form, sub, -1);
  },
  delete: (form, body) => {
    const sub = submissionById(String(body.id ?? ""));
    if (!sub || sub.formKey !== form.key) throw new HttpError("Submission not found.", 404);
    deleteSubmission(sub.id);
  },
};

/** { action, ... } from a form's admin pages. Every admin may do everything. */
export const POST: APIRoute = async ({ request, params }) => {
  try {
    const form = formByKey(params.key ?? "");
    if (!form) throw new HttpError("Form not found.", 404);
    const body = await request.json().catch(() => ({}));
    const run = actions[String(body.action ?? "")];
    if (!run) throw new HttpError("Unknown action.", 400);
    return Response.json({ data: (await run(form, body)) ?? null });
  } catch (error: any) {
    const status = error instanceof HttpError ? error.status : 500;
    if (status === 500) console.error(error);
    return Response.json({ error: status === 500 ? "Something went wrong." : error.message }, { status });
  }
};
