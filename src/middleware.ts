import { defineMiddleware } from "astro:middleware";
import { adminOf, appOrigin } from "@/lib/admin";
import { apiKeyFor, workspaces } from "@/plugins/forms/lib/forms";

// Open to everyone: admin sign-in, and what sites post to (the form endpoint and the email's spam link).
const PUBLIC = ["/login", "/api/auth/", "/f/", "/_astro/", "/favicon"];

export const onRequest = defineMiddleware(async (ctx, next) => {
  const path = ctx.url.pathname;
  if (PUBLIC.some((p) => path === p || path.startsWith(p))) return next();
  // REST API and MCP: an API key instead of the session cookie, so no cross-site check (a cookie is never used).
  if (path.startsWith("/api/v1/") || path === "/mcp") {
    const key = ctx.request.headers.get("authorization")?.match(/^Bearer\s+(\S+)$/i)?.[1] ?? "";
    if (!apiKeyFor(key)) return Response.json({ error: "Send a valid API key as Authorization: Bearer gf_…" }, { status: 401, headers: { "WWW-Authenticate": "Bearer" } });
    return next();
  }
  // Everything else runs on the admin's session cookie: only this app's own pages may post to it.
  if (ctx.request.method !== "GET" && ctx.request.method !== "HEAD" && ctx.request.headers.get("origin") !== appOrigin)
    return Response.json({ error: "Cross-site request blocked." }, { status: 403 });
  const admin = await adminOf(ctx.request.headers);
  if (!admin) return path.startsWith("/api/") ? Response.json({ error: "Sign in first." }, { status: 401 }) : ctx.redirect("/login");
  ctx.locals.admin = admin;
  const all = workspaces();
  ctx.locals.workspace = all.find((w) => w.id === ctx.cookies.get("gf-workspace")?.value) ?? all[0];
  return next();
});
