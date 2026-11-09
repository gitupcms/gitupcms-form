import type { APIRoute } from "astro";
import { HttpError } from "@/lib/http";
import { tool, TOOLS } from "@/plugins/forms/lib/api";

/**
 * MCP server over Streamable HTTP, JSON replies only (no SSE stream; every tool answers at once).
 * The middleware has already checked the Bearer key.
 */
const VERSIONS = ["2025-11-25", "2025-06-18", "2025-03-26"];

const handle = async (msg: any) => {
  const { id, method, params } = msg ?? {};
  const ok = (result: unknown) => ({ jsonrpc: "2.0", id, result });
  const fail = (code: number, message: string) => ({ jsonrpc: "2.0", id: id ?? null, error: { code, message } });
  if (msg?.jsonrpc !== "2.0" || typeof method !== "string") return fail(-32600, "Invalid request");
  if (id === undefined) return null; // a notification, e.g. notifications/initialized
  switch (method) {
    case "initialize":
      return ok({
        protocolVersion: VERSIONS.includes(params?.protocolVersion) ? params.protocolVersion : VERSIONS[0],
        capabilities: { tools: {} },
        serverInfo: { name: "gitupcms-forms", version: "0.1.0" },
        instructions: "Read and sort the submissions of this Gitupcms Forms server. Start with list_forms.",
      });
    case "ping":
      return ok({});
    case "tools/list":
      return ok({ tools: TOOLS.map(({ name, description, inputSchema }) => ({ name, description, inputSchema })) });
    case "tools/call": {
      const t = tool(String(params?.name ?? ""));
      if (!t) return fail(-32602, `Unknown tool: ${params?.name}`);
      try {
        const out = await t.run(params?.arguments ?? {});
        return ok({ content: [{ type: "text", text: JSON.stringify(out, null, 2) }], structuredContent: Array.isArray(out) ? { items: out } : out });
      } catch (e: any) {
        if (!(e instanceof HttpError)) console.error(e);
        return ok({ content: [{ type: "text", text: e instanceof HttpError ? e.message : "Something went wrong." }], isError: true });
      }
    }
    default:
      return fail(-32601, `Method not found: ${method}`);
  }
};

export const POST: APIRoute = async ({ request }) => {
  const body = await request.json().catch(() => undefined);
  if (body === undefined) return Response.json({ jsonrpc: "2.0", id: null, error: { code: -32700, message: "Parse error" } }, { status: 400 });
  const replies = (await Promise.all([body].flat().map(handle))).filter(Boolean);
  if (!replies.length) return new Response(null, { status: 202 });
  return Response.json(Array.isArray(body) ? replies : replies[0]);
};

// No server-to-client stream: clients fall back to plain POSTs.
export const GET: APIRoute = () => new Response("Method Not Allowed", { status: 405, headers: { Allow: "POST" } });
export const DELETE: APIRoute = () => new Response(null, { status: 405, headers: { Allow: "POST" } });
