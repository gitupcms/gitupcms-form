import type { APIRoute } from "astro";
import { HttpError } from "@/lib/http";
import { patchConfig } from "@/plugins/forms/lib/config";
import { applyRules } from "@/plugins/forms/lib/rules";
import { deleteForm, deleteSubmission, formByKey, list, RETENTION_DAYS, rotateSecret, saveConfig, setStatus, submissionById, updateForm, type Form } from "@/plugins/forms/lib/forms";
import { deliver } from "@/plugins/forms/lib/deliver";

const url = (value: unknown, label: string) => {
  const v = String(value ?? "").trim();
  if (v && !/^https?:\/\/[^\s]+$/.test(v)) throw new HttpError(`${label} must be a full http(s):// address.`, 400);
  return v;
};

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const actions: Record<string, (form: Form, body: any) => unknown> = {
  /** Any of the form's columns and/or `config` (a partial FormConfig); what is left out stays as it is. */
  update: (form, body) => {
    const has = (k: string) => body[k] !== undefined;
    const name = has("name") ? String(body.name ?? "").trim().slice(0, 100) : form.name;
    if (!name) throw new HttpError("Give the form a name.", 400);
    const recipients = has("recipients") ? list(String(body.recipients ?? "")) : list(form.recipients);
    const bad = recipients.find((r) => !EMAIL.test(r));
    if (bad) throw new HttpError(`Not an email address: ${bad}`, 400);
    const domains = (has("domains") ? list(String(body.domains ?? "")) : list(form.domains)).map((d) => d.replace(/^https?:\/\//, "").replace(/\/.*$/, ""));
    const badDomain = domains.find((d) => !/^[a-z0-9.-]+(:\d+)?$/.test(d));
    if (badDomain) throw new HttpError(`Not a domain: ${badDomain} (use example.com)`, 400);
    const retentionDays = has("retentionDays") ? Number(body.retentionDays) : form.retentionDays;
    if (!RETENTION_DAYS.includes(retentionDays)) throw new HttpError("Pick how long to keep submissions from the list.", 400);
    const config = body.config && typeof body.config === "object" ? patchConfig(form.config, body.config) : form.config;
    updateForm(form.key, {
      name,
      recipients: recipients.join(", "),
      domains: domains.join(", "),
      redirect: has("redirect") ? url(body.redirect, "The redirect") : form.redirect,
      webhookUrl: has("webhookUrl") ? url(body.webhookUrl, "The webhook") : form.webhookUrl,
      blocklist: has("blocklist") ? String(body.blocklist ?? "").slice(0, 20_000) : form.blocklist,
      retentionDays,
    });
    saveConfig(form.key, config);
  },
  /** Dry run: which rules a sample submission would match and what they would do. Nothing is saved or sent. */
  "test-rules": (form, body) => {
    const rules = body.rules ? patchConfig(form.config, { rules: body.rules }).rules : form.config.rules;
    const data = Object.fromEntries(Object.entries(body.data && typeof body.data === "object" ? body.data : {}).map(([k, v]) => [k, String(v)]));
    const out = applyRules(rules, data);
    return { ...out, to: out.to ?? list(form.recipients), defaultRecipients: !out.to };
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
    await deliver(form, sub, -1, { autoReply: false });
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
