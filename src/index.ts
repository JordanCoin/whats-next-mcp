#!/usr/bin/env node
/**
 * whats-next-mcp
 *
 * An MCP server exposing a single recursive tool, `suggest_next`, that
 * guarantees the agent always has concrete suggestions for what to do next.
 *
 * Engine resolution (hybrid):
 *   1. If ANTHROPIC_API_KEY is set, ask Claude for an independent ranked list.
 *   2. Otherwise (or on failure), use deterministic fallback seeds.
 *
 * Either way the result is a picker instruction (see `composePickerInstruction`)
 * that drives the host's interactive question tool AND tells the agent to call
 * `suggest_next` again after acting — the recursion that keeps the "what's next"
 * well from ever running dry.
 */

import { createRequire } from "node:module";

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";

import { type SuggestInput } from "./scaffold.js";
import { composePickerInstruction } from "./engine.js";
import { runInstallCli } from "./install.js";

// Read the version from package.json at runtime so it never drifts from the
// published package. dist/index.js -> ../package.json resolves to the root.
const require = createRequire(import.meta.url);
const { version } = require("../package.json") as { version: string };

const server = new McpServer({
  name: "whats-next-mcp",
  version,
});

server.tool(
  "suggest_next",
  "Get ranked, concrete suggestions for what to do next in the current " +
    "context. Call this whenever you finish a step, feel stuck, or are about " +
    "to ask the user an open-ended 'what now?'. Always returns a non-empty " +
    "list and tells you to call it again after acting, so there is never a " +
    "dead end.",
  {
    goal: z
      .string()
      .optional()
      .describe("The user's current objective, if known."),
    recent: z
      .string()
      .optional()
      .describe("Short summary of recent actions or current state."),
    count: z
      .number()
      .optional()
      .describe(
        "How many suggestions to rank (3-8, default 5). The picker shows the " +
          "top 4 (the AskUserQuestion limit)."
      ),
  },
  async (args) => {
    const input: SuggestInput = {
      goal: args.goal,
      recent: args.recent,
      count: args.count,
    };

    return textResult(await composePickerInstruction(input));
  }
);

function textResult(text: string) {
  return { content: [{ type: "text" as const, text }] };
}

async function main() {
  if (process.argv[2] === "install" || process.argv[2] === "--help" || process.argv[2] === "-h") {
    runInstallCli(process.argv.slice(2));
    return;
  }

  const transport = new StdioServerTransport();
  await server.connect(transport);
  // stderr is safe for logs; stdout is reserved for the MCP protocol.
  console.error("whats-next-mcp running on stdio");
}

main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});
