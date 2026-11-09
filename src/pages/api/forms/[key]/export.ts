import type { APIRoute } from "astro";
import { allSubmissions, formByKey } from "@/plugins/forms/lib/forms";
import { toCsv } from "@/plugins/forms/lib/csv";

/** GET ?status=inbox|spam → every submission of the form as CSV, one column per field name. */
export const GET: APIRoute = ({ params, url }) => {
  const form = formByKey(params.key ?? "");
  if (!form) return new Response("Form not found.", { status: 404 });
  const status = url.searchParams.get("status") === "spam" ? "spam" : "inbox";
  const csv = toCsv(allSubmissions(form.key, status).map((s) => ({ id: s.id, createdAt: new Date(s.createdAt * 1000).toISOString(), data: s.data, files: s.files })));
  const name = `${form.name.replace(/[^\w-]+/g, "-").toLowerCase() || "form"}-${status}.csv`;
  return new Response(csv, { headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="${name}"` } });
};
