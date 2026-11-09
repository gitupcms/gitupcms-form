/** GET /f/<key>/altcha: a fresh proof-of-work puzzle for the Altcha widget on the form's site. */
import type { APIRoute } from "astro";
import { appOrigin } from "@/lib/admin";
import { formByKey, originAllowed } from "../lib/forms";
import { altchaChallenge } from "../lib/captcha";

export const GET: APIRoute = ({ params, request }) => {
  const form = formByKey(params.key ?? "");
  if (!form || form.config.captcha.provider !== "altcha") return Response.json({ error: "Not found." }, { status: 404 });
  const origin = request.headers.get("origin");
  const cors = origin && originAllowed(form, origin, appOrigin) ? { "Access-Control-Allow-Origin": origin, Vary: "Origin" } : ({} as Record<string, string>);
  return Response.json(altchaChallenge(form.key), { headers: { ...cors, "Cache-Control": "no-store" } });
};
