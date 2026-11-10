import type { APIRoute } from "astro";
import { deleteSubmission, setRead, setStarred, setStatus, submissionById } from "@/plugins/forms/lib/forms";

const ACTIONS: Record<string, (id: string) => unknown> = {
  read: (id) => setRead(id, true),
  unread: (id) => setRead(id, false),
  star: (id) => setStarred(id, true),
  unstar: (id) => setStarred(id, false),
  spam: (id) => setStatus(id, "spam"),
  inbox: (id) => setStatus(id, "inbox"),
  delete: (id) => deleteSubmission(id),
};

/** { action, ids }: the same change to many submissions (the inbox's bulk actions), in any form. */
export const POST: APIRoute = async ({ request }) => {
  const body = await request.json().catch(() => ({}));
  const run = ACTIONS[String(body.action ?? "")];
  const ids = (Array.isArray(body.ids) ? body.ids : []).slice(0, 500).map(String);
  if (!run || !ids.length) return Response.json({ error: "Pick submissions and an action." }, { status: 400 });
  let done = 0;
  for (const id of ids) if (submissionById(id)) (run(id), done++);
  return Response.json({ data: { done } });
};
