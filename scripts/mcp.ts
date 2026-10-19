import { McpServer } from "@modelcontextprotocol/server";
import { StdioServerTransport } from "@modelcontextprotocol/server/stdio";
import { MCP_TOOLS } from "../src/lib/mcp/tools.ts";
import { describeError } from "../src/lib/api.ts";

/**
 * The dashboard, as something the Claude app can ask questions of.
 *
 * ── How it runs ─────────────────────────────────────────────────────────────
 * On Asher's laptop, as a process the Claude app starts and talks to over its
 * own stdin and stdout. Not a website: nothing is listening on a port, nothing
 * is reachable from the internet, and there is no second copy of the
 * credentials — it reads the same .env.local the dev server does.
 *
 * ── Why local rather than a hosted connector ────────────────────────────────
 * The launch list says "connected to the Claude app as a custom connector",
 * which means a hosted server at a URL. That route needs OAuth: the Claude
 * desktop app's custom-connector screen walks you through an OAuth sign-in and
 * has no field for a plain token. Standing up an OAuth authorisation server —
 * for one user, in front of his own data — is a large piece of
 * security-sensitive machinery to get right, and it would be the only part of
 * this project where a mistake exposes everything at once.
 *
 * Local stdio needs none of it. The cost is that it only works on the laptop,
 * not from a phone. Flagged to Asher 2026-10-05 as a departure from the
 * written plan; the tools themselves are transport-agnostic, so the hosted
 * route is a second entry point beside this one rather than a rewrite.
 *
 * ── Read-only ───────────────────────────────────────────────────────────────
 * Every tool reads. Nothing here can change a row. Writes were deliberately
 * left for later so the first version cannot damage anything while it is
 * being judged — see src/lib/mcp/tools.ts.
 *
 * ── stdout is the wire ──────────────────────────────────────────────────────
 * The protocol runs over stdout, so a stray console.log corrupts it and the
 * connection dies with no useful error. Everything diagnostic goes to stderr,
 * which the Claude app shows in its MCP logs.
 */

const server = new McpServer({
  name: "lanework",
  version: "1.0.0",
});

for (const definition of MCP_TOOLS) {
  server.registerTool(
    definition.name,
    {
      description: definition.description,
      inputSchema: definition.inputSchema,
      // Declared read-only so a client can show these as safe to run without
      // asking, and so the claim is written down somewhere the code enforces.
      annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false },
    },
    async (input: unknown) => {
      try {
        return { content: [{ type: "text" as const, text: await definition.run(input) }] };
      } catch (err) {
        /*
          A failed tool is reported as a tool result, not thrown. Throwing here
          tears down the connection for every later question too, and the model
          is perfectly able to say "I couldn't read your applications" if it is
          told so — which is more use than the app silently losing the server.
        */
        /*
          describeError, not String(err): a Supabase failure arrives as a plain
          object with a `message`, and String() turns that into
          "[object Object]" — which is what this printed on 2026-10-05 for a
          malformed id, and what the capture bar printed on 2026-09-16 before
          the same helper was written for it.
        */
        const message = describeError(err);
        console.error(`[mcp] ${definition.name} failed: ${message}`);
        return {
          content: [{ type: "text" as const, text: `That lookup failed: ${message}` }],
          isError: true,
        };
      }
    },
  );
}

async function main() {
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    console.error(
      "[mcp] Supabase is not configured. This must be started with the project's " +
        "environment loaded — see the command in package.json under \"mcp\".",
    );
    process.exit(1);
  }

  await server.connect(new StdioServerTransport());
  console.error(`[mcp] lanework ready — ${MCP_TOOLS.length} tools, read-only.`);
}

main().catch((err) => {
  console.error("[mcp] fatal:", err);
  process.exit(1);
});
