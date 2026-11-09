import { defineMiddleware } from "astro:middleware";
import { adminOf, appOrigin } from "@/lib/admin";

// Open to everyone: admin sign-in, and what sites post to (the form endpoint and the email's spam link).
const PUBLIC = ["/login", "/api/auth/", "/f/", "/_astro/", "/favicon"];

export const onRequest = defineMiddleware(async (ctx, next) => {
  const path = ctx.url.pathname;
  if (PUBLIC.some((p) => path === p || path.startsWith(p))) return next();
  // Everything else runs on the admin's session cookie: only this app's own pages may post to it.
  if (ctx.request.method !== "GET" && ctx.request.method !== "HEAD" && ctx.request.headers.get("origin") !== appOrigin)
    return Response.json({ error: "Cross-site request blocked." }, { status: 403 });
  const admin = await adminOf(ctx.request.headers);
  if (!admin) return path.startsWith("/api/") ? Response.json({ error: "Sign in first." }, { status: 401 }) : ctx.redirect("/login");
  ctx.locals.admin = admin;
  return next();
});
