import type { APIRoute } from "astro";
import { readUpload, submissionById } from "@/plugins/forms/lib/forms";

/** An uploaded file, always as a download: a visitor's HTML or SVG must never run on this admin's origin. */
export const GET: APIRoute = ({ params }) => {
  const sub = submissionById(params.id ?? "");
  const n = Number(params.n);
  const info = sub && sub.formKey === params.key ? sub.files[n] : undefined;
  const bytes = info ? readUpload(sub!.id, n) : null;
  if (!info || !bytes) return new Response("File not found.", { status: 404 });
  return new Response(bytes, {
    headers: {
      "Content-Type": "application/octet-stream",
      "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(info.name)}`,
      "X-Content-Type-Options": "nosniff",
    },
  });
};
