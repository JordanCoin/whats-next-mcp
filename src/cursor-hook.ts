#!/usr/bin/env node
/**
 * Cursor `stop` hook — the deterministic turn-end trigger for Cursor.
 *
 * Cursor's hooks are NOT observe-only: the `stop` hook reads a JSON payload on
 * stdin and may return {"followup_message": "..."} on stdout, which Cursor
 * auto-submits as the next user message — re-entering the agent loop. We use
 * that to inject the same "call your interactive question tool" instruction the
 * Claude Code hook uses, so Cursor also drives a picker instead of going quiet.
 *
 * Loop guard: the payload carries `loop_count` (how many times this hook has
 * already re-triggered this turn). We stop at 1 so we ask exactly once.
 *
 * Wire it up in .cursor/hooks.json (project) or ~/.cursor/hooks.json (global):
 *   {
 *     "version": 1,
 *     "hooks": {
 *       "stop": [
 *         { "command": "node /abs/path/whats-next-mcp/dist/cursor-hook.js",
 *           "loop_limit": 10 }
 *       ]
 *     }
 *   }
 */

import { fallbackSuggestions } from "./fallback.js";
import { buildPickerInstruction } from "./engine.js";

interface CursorStopPayload {
  status?: "completed" | "aborted" | "error";
  loop_count?: number;
}

function readStdin(): Promise<string> {
  return new Promise((resolve) => {
    let data = "";
    process.stdin.setEncoding("utf8");
    process.stdin.on("data", (chunk) => (data += chunk));
    process.stdin.on("end", () => resolve(data));
    setTimeout(() => resolve(data), 2000).unref();
  });
}

async function main() {
  const raw = await readStdin();
  let payload: CursorStopPayload = {};
  try {
    payload = JSON.parse(raw || "{}");
  } catch {
    process.stdout.write("{}"); // malformed — let the agent stop
    process.exit(0);
  }

  // Only nudge on a clean finish, and only once per turn.
  if (payload.status !== "completed" || (payload.loop_count ?? 0) >= 1) {
    process.stdout.write("{}");
    process.exit(0);
  }

  // Cursor's stop payload carries no transcript path, so seeds are generic.
  const seeds = fallbackSuggestions({});
  const out = { followup_message: buildPickerInstruction(seeds) };
  process.stdout.write(JSON.stringify(out));
  process.exit(0);
}

main().catch(() => {
  process.stdout.write("{}"); // never block the user on a hook error
  process.exit(0);
});
