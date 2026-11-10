import type { APIRoute } from "astro";
import { formByKey } from "@/plugins/forms/lib/forms";
import { viewCsv } from "@/plugins/forms/lib/csv";

/** GET ?view=&q=&days=&order= (the inbox's filters; old ?status=spam works) → the form's matching submissions as CSV. */
export const GET: APIRoute = ({ params, url }) => {
  const form = formByKey(params.key ?? "");
  if (!form) return new Response("Form not found.", { status: 404 });
  return viewCsv(form.key, url.searchParams, form.name);
};
