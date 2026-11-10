import type { APIRoute } from "astro";
import { allSubmissions, forms } from "@/plugins/forms/lib/forms";
import { toCsv } from "@/plugins/forms/lib/csv";

/** GET ?status=inbox|spam → every submission of the current workspace's forms as one CSV, with a `form` column first. */
export const GET: APIRoute = ({ url, locals }) => {
  const status = url.searchParams.get("status") === "spam" ? "spam" : "inbox";
  const rows = forms(locals.workspace.id).flatMap((f) =>
    allSubmissions(f.key, status).map((s) => ({ id: s.id, createdAt: new Date(s.createdAt * 1000).toISOString(), data: { form: f.name, ...s.data }, files: s.files })),
  );
  rows.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const name = `${locals.workspace.name.replace(/[^\w-]+/g, "-").toLowerCase() || "workspace"}-${status}.csv`;
  return new Response(toCsv(rows), { headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="${name}"` } });
};
