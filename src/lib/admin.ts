/**
 * Sign-in for the Gitupcms Forms admin: email + password, and GitHub when GITHUB_CLIENT_ID / GITHUB_CLIENT_SECRET are set.
 * The first account created becomes an admin; after that only invited emails can sign up (lib/team.ts), and GitHub
 * signs in an existing admin when the GitHub-verified email is the same. Form senders never sign in.
 */
import { betterAuth, type BetterAuthOptions } from "better-auth";
import { getMigrations } from "better-auth/db/migration";
import { db } from "./db";
import { invited, useInvite } from "./team";

const env = (name: string) => process.env[name] ?? import.meta.env?.[name];
const github = env("GITHUB_CLIENT_ID") && env("GITHUB_CLIENT_SECRET") ? { clientId: env("GITHUB_CLIENT_ID")!, clientSecret: env("GITHUB_CLIENT_SECRET")! } : undefined;

export const hasAdmin = () => !!db.prepare('SELECT 1 FROM "user" LIMIT 1').get();
export const githubEnabled = !!github;

/** This app's public address (BETTER_AUTH_URL), e.g. https://forms.example.com. */
export const appOrigin = new URL(env("BETTER_AUTH_URL") || "http://localhost:4321").origin;

const options = {
  baseURL: appOrigin,
  secret: env("BETTER_AUTH_SECRET"),
  database: db,
  emailAndPassword: { enabled: true, minPasswordLength: 10 },
  socialProviders: github ? { github } : {},
  // Behind a reverse proxy (TRUST_PROXY=1) the sign-in rate limit counts per visitor IP instead of one shared bucket.
  advanced: { cookiePrefix: "gitupcms-forms", ...(env("TRUST_PROXY") === "1" ? { ipAddress: { ipAddressHeaders: ["x-forwarded-for"] } } : {}) },
  onAPIError: { errorURL: "/login" },
  databaseHooks: {
    user: {
      create: {
        before: async (user) => (!hasAdmin() || invited(user.email) ? undefined : false),
        after: async (user) => useInvite(user.email),
      },
    },
  },
} satisfies BetterAuthOptions;

await (await getMigrations(options)).runMigrations();

export const adminAuth = betterAuth(options);

/** The signed-in admin, else null. */
export const adminOf = async (headers: Headers) => (await adminAuth.api.getSession({ headers }).catch(() => null))?.user ?? null;
