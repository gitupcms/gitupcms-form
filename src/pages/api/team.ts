import type { APIRoute } from "astro";
import { appOrigin } from "@/lib/admin";
import { sendEmail } from "@/lib/email";
import { admins, EMAIL, invite, removeAdmin, revoke } from "@/lib/team";

/** { action: "invite", email } | { action: "revoke", token } | { action: "remove", id } */
export const POST: APIRoute = async ({ request, locals }) => {
  const body = await request.json().catch(() => ({}));
  const fail = (error: string, status = 400) => Response.json({ error }, { status });
  if (body.action === "invite") {
    const email = String(body.email ?? "").trim().toLowerCase();
    if (!EMAIL.test(email)) return fail("Enter an email address.");
    if (admins().some((a) => a.email.toLowerCase() === email)) return fail(`${email} is already an admin.`, 409);
    const link = `${appOrigin}/login?invite=${invite(email)}`;
    let emailed = true;
    await sendEmail({ to: email, subject: "You're invited to Gitupcms Forms", text: `${locals.admin.name} invited you to manage the forms on ${appOrigin}.\n\nCreate your account (the link works for 7 days):\n${link}` }).catch((e) => {
      console.error(e);
      emailed = false;
    });
    return Response.json({ data: { link, emailed: emailed && !!(process.env.SMTP_URL ?? import.meta.env.SMTP_URL) } });
  }
  if (body.action === "revoke") return (revoke(String(body.token ?? "")), Response.json({ data: { ok: true } }));
  if (body.action === "remove") {
    if (body.id === locals.admin.id) return fail("You can't remove yourself.");
    return removeAdmin(String(body.id ?? "")) ? Response.json({ data: { ok: true } }) : fail("No such admin.", 404);
  }
  return fail("Unknown action.");
};
