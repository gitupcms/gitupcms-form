import { branding, brandLine } from "../../../lib/limits.ts";

/** A small standalone HTML page for people whose browser posted a form here (thank-you or error). */
const escape = (s: string) => s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

export const page = (title: string, message: string, status = 200, back?: string | null, body = "") => {
  const link = back && /^https?:\/\//.test(back) ? `<p><a href="${escape(back)}">← Back to ${escape(new URL(back).host)}</a></p>` : "";
  return new Response(
    `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="robots" content="noindex"><title>${escape(title)}</title>
<style>body{font:16px/1.5 system-ui,sans-serif;margin:0;min-height:100vh;display:grid;place-items:center;background:#fafafa;color:#111}main{max-width:28rem;padding:2rem;text-align:center}h1{font-size:1.4rem;margin:0 0 .5rem}p{color:#555}a{color:inherit}button{font:inherit;padding:.5rem 1rem;border-radius:.5rem;border:0;background:#dc2626;color:#fff;cursor:pointer}blockquote{text-align:left;background:#fff;border:1px solid #e5e5e5;border-radius:.5rem;padding:.75rem 1rem;margin:1rem 0;white-space:pre-wrap;color:#333}@media(prefers-color-scheme:dark){body{background:#111;color:#eee}p{color:#aaa}blockquote{background:#1a1a1a;border-color:#333;color:#ddd}}</style></head>
<body><main><h1>${escape(title)}</h1><p>${escape(message)}</p>${body}${link}${branding ? brandLine.html : ""}</main></body></html>`,
    { status, headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" } },
  );
};
