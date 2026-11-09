import type { APIRoute } from "astro";
import { EMAIL } from "@/lib/team";
import { deleteSubmission, forms, submissionsByEmail } from "@/plugins/forms/lib/forms";

/**
 * { email, action: "find" | "delete" }: someone asked for their data (GDPR / KVKK access or erasure).
 * POST, not GET, so the address stays out of URLs and logs.
 */
export const POST: APIRoute = async ({ request }) => {
  const body = await request.json().catch(() => ({}));
  const email = String(body.email ?? "").trim();
  if (!EMAIL.test(email)) return Response.json({ error: "Enter an email address." }, { status: 400 });
  const found = submissionsByEmail(email);
  if (body.action === "delete") {
    for (const s of found) deleteSubmission(s.id);
    return Response.json({ data: { deleted: found.length } });
  }
  const names = Object.fromEntries(forms().map((f) => [f.key, f.name]));
  return Response.json({
    data: found.map((s) => ({ id: s.id, form: names[s.formKey], formKey: s.formKey, status: s.status, submittedAt: new Date(s.createdAt * 1000).toISOString(), origin: s.origin, data: s.data, files: s.files })),
  });
};
