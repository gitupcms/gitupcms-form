import type { APIRoute } from "astro";
import { createApiKey, revokeApiKey } from "@/plugins/forms/lib/forms";

/** { action: "create", name } → the new key (shown once) | { action: "revoke", id } */
export const POST: APIRoute = async ({ request }) => {
  const body = await request.json().catch(() => ({}));
  if (body.action === "create") {
    const name = String(body.name ?? "").trim().slice(0, 60);
    if (!name) return Response.json({ error: "Give the key a name." }, { status: 400 });
    return Response.json({ data: createApiKey(name) });
  }
  if (body.action === "revoke") return revokeApiKey(String(body.id ?? "")) ? Response.json({ data: null }) : Response.json({ error: "No such key." }, { status: 404 });
  return Response.json({ error: "Unknown action." }, { status: 400 });
};
