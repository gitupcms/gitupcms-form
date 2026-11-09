/** GET /f/<key>/embed.js: draws a builder form on any page with `<div data-gitupcms-form="<key>">`. */
import type { APIRoute } from "astro";
import { appOrigin } from "@/lib/admin";
import { formByKey } from "../lib/forms";
import { embedScript } from "../lib/builder";

export const GET: APIRoute = ({ params }) => {
  const form = formByKey(params.key ?? "");
  const b = form?.config.builder;
  if (!form || !b?.enabled || !form.config.active) return new Response("/* Gitupcms Forms: this form is not published. */", { status: 404, headers: { "Content-Type": "text/javascript" } });
  const c = form.config.captcha;
  const js = embedScript(form.key, `${appOrigin}/f/${form.key}`, b, { provider: c.provider, siteKey: c.siteKey, challengeUrl: `${appOrigin}/f/${form.key}/altcha` });
  return new Response(js, { headers: { "Content-Type": "text/javascript; charset=utf-8", "Cache-Control": "public, max-age=60", "Access-Control-Allow-Origin": "*" } });
};
