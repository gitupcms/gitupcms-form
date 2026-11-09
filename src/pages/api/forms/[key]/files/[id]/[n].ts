import type { APIRoute } from "astro";
import { createReadStream, existsSync } from "node:fs";
import { Readable } from "node:stream";
import { filePath, submissionById } from "@/plugins/forms/lib/forms";

/** An uploaded file, always as a download: a visitor's HTML or SVG must never run on this admin's origin. */
export const GET: APIRoute = ({ params }) => {
  const sub = submissionById(params.id ?? "");
  const n = Number(params.n);
  const info = sub && sub.formKey === params.key ? sub.files[n] : undefined;
  const path = info ? filePath(sub!.id, n) : "";
  if (!info || !existsSync(path)) return new Response("File not found.", { status: 404 });
  return new Response(Readable.toWeb(createReadStream(path)) as ReadableStream, {
    headers: {
      "Content-Type": "application/octet-stream",
      "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(info.name)}`,
      "Content-Length": String(info.size),
      "X-Content-Type-Options": "nosniff",
    },
  });
};
