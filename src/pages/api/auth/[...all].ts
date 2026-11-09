import type { APIRoute } from "astro";
import { adminAuth } from "@/lib/admin";

export const ALL: APIRoute = ({ request }) => adminAuth.handler(request);
