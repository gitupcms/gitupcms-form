import { defineConfig } from "astro/config";
import node from "@astrojs/node";
import tailwindcss from "@tailwindcss/vite";
import forms from "./src/plugins/forms/index.ts";

export default defineConfig({
  output: "server",
  adapter: node({ mode: "standalone" }),
  // The endpoint and the spam link; the admin pages live in src/pages.
  integrations: [forms()],
  // Other sites' forms post here, which Astro's same-origin check would refuse; the admin API checks Origin itself (middleware.ts).
  security: { checkOrigin: false },
  vite: {
    plugins: [tailwindcss()],
    ssr: { external: ["better-sqlite3"] },
  },
});
