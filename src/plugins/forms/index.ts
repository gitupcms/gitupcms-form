/**
 * Gitupcms Forms: a backend for plain HTML forms. This integration adds the public routes (the endpoint and the
 * "mark as spam" link); the admin pages live in the host app.
 */
import type { AstroIntegration } from "astro";

const ROUTES: [pattern: string, file: string][] = [
  ["/f/spam", "./api/spam.ts"],
  ["/f/[key]", "./api/submit.ts"],
];

export default (): AstroIntegration => ({
  name: "gitupcms-forms",
  hooks: {
    "astro:config:setup": ({ injectRoute }) => {
      for (const [pattern, file] of ROUTES) injectRoute({ pattern, entrypoint: new URL(file, import.meta.url), prerender: false });
    },
  },
});
