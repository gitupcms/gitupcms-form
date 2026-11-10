import type { APIRoute } from "astro";
import { forms } from "@/plugins/forms/lib/forms";
import { viewCsv } from "@/plugins/forms/lib/csv";

/** GET ?form=&view=&q=&days=&order= → the shared inbox view as CSV: the workspace's forms (or one), with a `form` column. */
export const GET: APIRoute = ({ url, locals }) => {
  const mine = forms(locals.workspace.id);
  const one = mine.find((f) => f.key === url.searchParams.get("form"));
  return viewCsv(one ? one.key : mine.map((f) => f.key), url.searchParams, one?.name ?? locals.workspace.name, new Map(mine.map((f) => [f.key, f.name])));
};
