import type { APIRoute } from "astro";
import { createWorkspace, deleteWorkspace, renameWorkspace, workspaces } from "@/plugins/forms/lib/forms";

const name = (v: unknown) => {
  const n = String(v ?? "").trim().slice(0, 100);
  if (!n) throw new Error("Give the workspace a name.");
  return n;
};

/** { action: "switch" | "create" | "rename" | "delete", id?, name? }. Switching only sets a cookie for this browser. */
export const POST: APIRoute = async ({ request, cookies }) => {
  const body = await request.json().catch(() => ({}));
  const id = String(body.id ?? "");
  const known = workspaces().some((w) => w.id === id);
  const remember = (wsId: string) => cookies.set("gf-workspace", wsId, { path: "/", httpOnly: true, sameSite: "lax", maxAge: 365 * 86400 });
  try {
    if (body.action === "create") remember(createWorkspace(name(body.name)));
    else if (!known) throw new Error("Workspace not found.");
    else if (body.action === "switch") remember(id);
    else if (body.action === "rename") renameWorkspace(id, name(body.name));
    else if (body.action === "delete") {
      if (!deleteWorkspace(id)) throw new Error("Move its forms to another workspace first (the last workspace stays).");
    } else throw new Error("Unknown action.");
    return Response.json({ data: null });
  } catch (e: any) {
    return Response.json({ error: e.message }, { status: 400 });
  }
};
