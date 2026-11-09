/** Signed "mark as spam" links for notification emails: tied to one submission, valid for 7 days. */
import { createHash, createHmac, timingSafeEqual } from "node:crypto";

const key = () => {
  const secret = process.env.BETTER_AUTH_SECRET ?? import.meta.env?.BETTER_AUTH_SECRET;
  if (!secret) throw new Error("BETTER_AUTH_SECRET is required.");
  return createHash("sha256").update(`gitupcms-forms:spam-link:${secret}`).digest();
};
const mac = (payload: string) => createHmac("sha256", key()).update(payload).digest("base64url");

export const spamToken = (subId: string, nowMs = Date.now()) => {
  const payload = `${subId}.${Math.floor(nowMs / 1000) + 7 * 86400}`;
  return `${payload}.${mac(payload)}`;
};

/** The submission id in a valid, unexpired token, else null. */
export const readSpamToken = (token: string, nowMs = Date.now()) => {
  const [subId, exp, sig] = token.split(".");
  if (!subId || !exp || !sig || Number(exp) * 1000 < nowMs) return null;
  const want = Buffer.from(mac(`${subId}.${exp}`));
  const got = Buffer.from(sig);
  return got.length === want.length && timingSafeEqual(got, want) ? subId : null;
};
