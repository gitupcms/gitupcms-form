import type { APIRoute } from "astro";
import { LIMITS } from "@/lib/limits";
import { createForm, forms } from "@/plugins/forms/lib/forms";

/** { name } → a new form in the current workspace that emails the admin who made it; returns its key. */
export const POST: APIRoute = async ({ request, locals }) => {
  const body = await request.json().catch(() => ({}));
  const name = String(body.name ?? "").trim().slice(0, 100);
  if (!name) return Response.json({ error: "Give the form a name." }, { status: 400 });
  if (LIMITS.forms && forms().length >= LIMITS.forms) return Response.json({ error: `This server allows ${LIMITS.forms} forms. Delete one first.` }, { status: 403 });
  return Response.json({ data: { key: createForm(name, locals.admin.email, locals.workspace.id) } });
};
