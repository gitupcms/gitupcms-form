/**
 * Limits for a hosted (cloud) server, all off by default: a self-hosted server has none and no branding.
 * MONTHLY_SUBMISSION_LIMIT: submissions (not spam) per calendar month across every form; past it, posts are refused.
 * MAX_FORMS: how many forms can exist. BRANDING=1: a small "Sent with Gitupcms Forms" line on thank-you pages and emails.
 */
import { BRAND } from "./brand.ts";

const env = (name: string) => process.env[name] ?? import.meta.env?.[name];
const num = (name: string) => Math.max(0, Math.floor(Number(env(name))) || 0);

export const LIMITS = { submissions: num("MONTHLY_SUBMISSION_LIMIT"), forms: num("MAX_FORMS") };
export const branding = env("BRANDING") === "1";
export const brandLine = { text: `Sent with ${BRAND.name} (${BRAND.url})`, html: `<p style="color:#999;font-size:12px">Sent with <a href="${BRAND.url}" style="color:#999">${BRAND.name}</a></p>` };
