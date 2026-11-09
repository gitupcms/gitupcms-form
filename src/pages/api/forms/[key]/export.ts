import type { APIRoute } from "astro";
import { db } from "@/lib/db";
import { formByKey } from "@/plugins/forms/lib/forms";
import { toCsv } from "@/plugins/forms/lib/csv";

/** GET ?status=inbox|spam → every submission of the form as CSV, one column per field name. */
export const GET: APIRoute = ({ params, url }) => {
  const form = formByKey(params.key ?? "");
  if (!form) return new Response("Form not found.", { status: 404 });
  const status = url.searchParams.get("status") === "spam" ? "spam" : "inbox";
  const rows = db.prepare("SELECT id, data, files, created_at FROM submission WHERE form_key = ? AND status = ? ORDER BY created_at").all(form.key, status) as { id: string; data: string; files: string; created_at: number }[];
  const csv = toCsv(rows.map((r) => ({ id: r.id, createdAt: new Date(r.created_at * 1000).toISOString(), data: JSON.parse(r.data), files: JSON.parse(r.files) })));
  const name = `${form.name.replace(/[^\w-]+/g, "-").toLowerCase() || "form"}-${status}.csv`;
  return new Response(csv, { headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="${name}"` } });
};
