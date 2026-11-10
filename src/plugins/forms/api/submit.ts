/**
 * POST /f/<key>: where a site's form posts. A browser form gets a redirect (or our thank-you page);
 * a script that sends `Accept: application/json` gets JSON. Spam is answered like a normal post, so bots learn nothing.
 */
import type { APIRoute } from "astro";
import { appOrigin } from "@/lib/admin";
import { HttpError } from "@/lib/http";
import { LIMITS } from "@/lib/limits";
import { countSend, deleteSubmission, formByKey, HARD_LIMIT, originAllowed, saveSubmission, type Form } from "../lib/forms";
import { monthUsage } from "../lib/stats";
import { parseSubmission } from "../lib/parse";
import { deliver } from "../lib/deliver";
import { page } from "../lib/page";
import { checkCaptcha } from "../lib/captcha";

const env = (name: string) => process.env[name] ?? import.meta.env?.[name];

const originOf = (request: Request) => {
  const origin = request.headers.get("origin");
  if (origin && origin !== "null") return origin;
  try {
    return new URL(request.headers.get("referer") ?? "").origin;
  } catch {
    return null;
  }
};

const cors = (form: Form | null, origin: string | null): Record<string, string> =>
  form && origin && originAllowed(form, origin, appOrigin) ? { "Access-Control-Allow-Origin": origin, Vary: "Origin" } : {};

const wantsJson = (request: Request) => /application\/json/.test(request.headers.get("accept") ?? "") || /application\/json/.test(request.headers.get("content-type") ?? "");

/** `_redirect` only to the posting site itself (no open redirect); the form's own setting wins. */
const redirectTo = (form: Form, asked: string, origin: string | null) => {
  if (form.redirect) return form.redirect;
  if (!asked) return null;
  try {
    const url = new URL(asked, origin ?? undefined);
    if (origin && url.origin === new URL(origin).origin) return url.href;
  } catch {}
  return null;
};

export const OPTIONS: APIRoute = ({ params, request }) => {
  const headers = cors(formByKey(params.key ?? ""), originOf(request));
  return new Response(null, { status: 204, headers: { ...headers, "Access-Control-Allow-Methods": "POST", "Access-Control-Allow-Headers": "Content-Type, Accept", "Access-Control-Max-Age": "86400" } });
};

export const GET: APIRoute = ({ params }) => {
  const form = formByKey(params.key ?? "");
  return page(form ? "This is a form endpoint" : "Form not found", form ? "Point an HTML form's action here with method=\"POST\"." : "Check the address in your form's action.", form ? 200 : 404);
};

export const POST: APIRoute = async ({ params, request, clientAddress }) => {
  const form = formByKey(params.key ?? "");
  const origin = originOf(request);
  const json = wantsJson(request);
  const headers = cors(form, origin);
  const fail = (status: number, message: string) =>
    json ? Response.json({ ok: false, error: message }, { status, headers }) : page("The form was not sent", message, status, origin);
  try {
    if (!form) throw new HttpError("This form does not exist. Check the address in its action.", 404);
    if (!form.config.active) throw new HttpError("This form is not accepting submissions right now.", 403);
    if (!originAllowed(form, origin, appOrigin)) throw new HttpError(`This form does not accept posts from ${origin ? new URL(origin).host : "unknown sites"}.`, 403);
    const ip = (env("TRUST_PROXY") === "1" && request.headers.get("x-forwarded-for")?.split(",")[0].trim()) || clientAddress || "";
    const recentFromIp = countSend(form.key, ip);
    if (recentFromIp >= HARD_LIMIT) throw new HttpError("Too many submissions. Try again in a few minutes.", 429);
    if (LIMITS.submissions && monthUsage() >= LIMITS.submissions) throw new HttpError("This form has reached its monthly limit. Try again next month.", 429);
    const parsed = await parseSubmission(request);
    // The honeypot catches bots without a CAPTCHA round-trip; they get the usual answer and land in Spam.
    if (!parsed.options.honeypot) {
      const captchaError = await checkCaptcha(form.config.captcha, form.key, parsed.options.captcha, ip);
      if (captchaError) throw new HttpError(captchaError, 400);
    }
    // For Analytics only: the visitor's country as the proxy (Cloudflare, Vercel) sends it; never the IP.
    const country = env("TRUST_PROXY") === "1" ? (request.headers.get("cf-ipcountry") ?? request.headers.get("x-vercel-ip-country") ?? "").toUpperCase() : "";
    const sub = await saveSubmission(form, parsed, { ip, origin: origin ?? "", recentFromIp, country: /^[A-Z]{2}$/.test(country) && country !== "XX" ? country : "" });
    // A form that does not store submissions keeps them only until they are sent on.
    const drop = () => form.config.archive || deleteSubmission(sub.id);
    if (sub.status === "inbox") deliver(form, sub).catch((e) => console.error("Delivery failed:", e)).finally(drop);
    else drop();
    if (json) return Response.json({ ok: true, id: sub.id }, { headers });
    const to = redirectTo(form, parsed.options.redirect, origin);
    return to ? new Response(null, { status: 303, headers: { Location: to } }) : page("Thank you!", "Your message was sent.", 200, origin);
  } catch (error: any) {
    if (error instanceof HttpError) return fail(error.status, error.message);
    console.error(error);
    return fail(500, "Something went wrong. Please try again.");
  }
};
