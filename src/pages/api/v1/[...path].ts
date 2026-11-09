import type { APIRoute } from "astro";
import { HttpError } from "@/lib/http";
import { tool } from "@/plugins/forms/lib/api";

/** REST face of the API tools. The middleware has already checked the Bearer key. */
const route = (method: string, parts: string[], body: any): [string, Record<string, unknown>] | null => {
  const [a, id, c, d] = parts;
  if (method === "GET" && a === "forms" && !id) return ["list_forms", {}];
  if (method === "GET" && a === "forms" && id && !c) return ["get_form", { form: id }];
  if (method === "GET" && a === "forms" && c === "submissions" && !d) return ["list_submissions", { form: id }];
  if (method === "POST" && a === "forms" && c === "rules" && d === "test") return ["test_rules", { form: id, data: body.data }];
  if (method === "GET" && a === "submissions" && !id) return ["list_submissions", {}];
  if (a === "submissions" && id && !c) {
    if (method === "GET") return ["get_submission", { id }];
    if (method === "PATCH") return ["set_submission_status", { id, status: body.status }];
    if (method === "DELETE") return ["delete_submission", { id }];
  }
  return null;
};

export const ALL: APIRoute = async ({ request, params, url }) => {
  try {
    const body = request.method === "POST" || request.method === "PATCH" ? await request.json().catch(() => ({})) : {};
    const hit = route(request.method, (params.path ?? "").split("/").filter(Boolean), body);
    if (!hit) throw new HttpError("No such endpoint.", 404);
    // Query string (status, q, page) fills in for GET lists.
    const args = { ...Object.fromEntries(url.searchParams), ...hit[1] };
    if (hit[0] === "set_submission_status" && body.status !== "inbox" && body.status !== "spam") throw new HttpError('Send {"status":"inbox"} or {"status":"spam"}.', 400);
    return Response.json({ data: await tool(hit[0])!.run(args) });
  } catch (error: any) {
    const status = error instanceof HttpError ? error.status : 500;
    if (status === 500) console.error(error);
    return Response.json({ error: status === 500 ? "Something went wrong." : error.message }, { status });
  }
};
