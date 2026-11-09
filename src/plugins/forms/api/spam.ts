/**
 * /f/spam?t=<token>: the "Mark as spam" link in notification emails. Opening it changes nothing (mail scanners
 * open links); the button on the page does.
 */
import type { APIRoute } from "astro";
import { formByKey, setStatus, submissionById } from "../lib/forms";
import { readSpamToken } from "../lib/sign";
import { page } from "../lib/page";

const escape = (s: string) => s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

const find = (url: URL) => {
  const subId = readSpamToken(url.searchParams.get("t") ?? "");
  const sub = subId ? submissionById(subId) : null;
  return sub ? { sub, form: formByKey(sub.formKey)! } : null;
};

export const GET: APIRoute = ({ url }) => {
  const found = find(url);
  if (!found) return page("Link expired", "This link is no longer valid. Open the submission in the inbox instead.", 404);
  const { sub, form } = found;
  if (sub.status === "spam") return page("Already in Spam", `This submission to ${form.name} is in Spam.`);
  const preview = Object.entries(sub.data)
    .slice(0, 4)
    .map(([k, v]) => `${k}: ${Array.isArray(v) ? v.join(", ") : v}`)
    .join("\n")
    .slice(0, 600);
  return page(
    "Mark as spam?",
    `This submission to ${form.name} moves to Spam. Nothing else is sent for it.`,
    200,
    null,
    `<blockquote>${escape(preview)}</blockquote><form method="post"><button>Mark as spam</button></form>`,
  );
};

export const POST: APIRoute = ({ url }) => {
  const found = find(url);
  if (!found) return page("Link expired", "This link is no longer valid. Open the submission in the inbox instead.", 404);
  setStatus(found.sub.id, "spam");
  return page("Marked as spam", `The submission to ${found.form.name} is now in Spam.`);
};
