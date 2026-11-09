import type { APIRoute } from "astro";
import { createForm } from "@/plugins/forms/lib/forms";

/** { name } → a new form that emails the admin who made it; returns its key. */
export const POST: APIRoute = async ({ request, locals }) => {
  const body = await request.json().catch(() => ({}));
  const name = String(body.name ?? "").trim().slice(0, 100);
  if (!name) return Response.json({ error: "Give the form a name." }, { status: 400 });
  return Response.json({ data: { key: createForm(name, locals.admin.email) } });
};
