#!/usr/bin/env node
/**
 * Claude Code `Stop` hook — the deterministic trigger.
 *
 * A Stop hook runs the instant the agent finishes its turn. By returning
 * {"decision":"block","reason": <suggestions>} we refuse that stop and feed the
 * suggestions back into the model, which then presents them to the user. This
 * is what makes "never a dead end" a guarantee instead of a hope: it does not
 * depend on the model deciding to call the `suggest_next` tool.
 *
 * Loop guard: we want the picker to fire EVERY time control genuinely returns
 * to the user — a fresh prompt, or right after they answered a previous picker
 * (the picker waits for human input, so a loop through it can't run away). We
 * only suppress the pathological case: the model ignoring the instruction and
 * producing prose with no human gate. That is bounded by a per-session counter
 * (HARD_CAP) that resets the moment a human re-engages.
 *
 * Set WHATS_NEXT_DEBUG=1 to append each decision to
 * $TMPDIR/whats-next-hook.log for diagnosis.
 *
 * Wire it up in ~/.claude/settings.json:
 *   {
 *     "hooks": {
 *       "Stop": [
 *         { "hooks": [ { "type": "command",
 *           "command": "node /abs/path/whats-next-mcp/dist/hook.js" } ] }
 *       ]
 *     }
 *   }
 */

import { readFileSync, writeFileSync, appendFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { fallbackSuggestions } from "./fallback.js";
import { buildPickerInstruction } from "./engine.js";

interface StopPayload {
  stop_hook_active?: boolean;
  transcript_path?: string;
  session_id?: string;
}

/** Max consecutive fires with NO human gate before we let the turn stop. */
const HARD_CAP = 25;

function counterPath(sessionId?: string): string {
  const id = (sessionId || "default").replace(/[^a-zA-Z0-9_-]/g, "_");
  return join(tmpdir(), `whats-next-hook-${id}.count`);
}

function getCount(p: string): number {
  try {
    return parseInt(readFileSync(p, "utf8"), 10) || 0;
  } catch {
    return 0;
  }
}

function setCount(p: string, n: number): void {
  try {
    writeFileSync(p, String(n));
  } catch {
    /* tmp not writable — fall back to firing once */
  }
}

function debug(msg: string): void {
  if (!process.env.WHATS_NEXT_DEBUG) return;
  try {
    appendFileSync(join(tmpdir(), "whats-next-hook.log"), msg + "\n");
  } catch {
    /* ignore */
  }
}

/**
 * Did the user actually answer the most recent picker? A bare "AskUserQuestion
 * appears in the tail" test resets the runaway counter too eagerly: a picker
 * call lingers in the window for several stops, so a model rambling in prose
 * after one answered picker would never trip the cap. We require a genuine
 * human gate — a USER entry appearing AFTER the last assistant picker — which
 * is precisely "the user responded to it".
 */
function recentlyAnsweredPicker(transcriptPath?: string): boolean {
  if (!transcriptPath) return false;
  try {
    const lines = readFileSync(transcriptPath, "utf8").trim().split("\n");
    let lastPickerIdx = -1;
    const roles: string[] = [];
    lines.slice(-12).forEach((line, i) => {
      let entry: any;
      try {
        entry = JSON.parse(line);
      } catch {
        roles[i] = "";
        return;
      }
      const msg = entry?.message ?? entry;
      roles[i] = msg?.role ?? "";
      if (
        msg?.role === "assistant" &&
        Array.isArray(msg.content) &&
        msg.content.some(
          (b: any) => b?.type === "tool_use" && b?.name === "AskUserQuestion"
        )
      ) {
        lastPickerIdx = i;
      }
    });
    if (lastPickerIdx === -1) return false;
    // A user entry after the picker means the human engaged with it.
    return roles.slice(lastPickerIdx + 1).includes("user");
  } catch {
    /* unreadable — treat as not gated */
  }
  return false;
}

function readStdin(): Promise<string> {
  return new Promise((resolve) => {
    let data = "";
    process.stdin.setEncoding("utf8");
    process.stdin.on("data", (chunk) => (data += chunk));
    process.stdin.on("end", () => resolve(data));
    // If nothing is piped in, don't hang forever.
    setTimeout(() => resolve(data), 2000).unref();
  });
}

/**
 * Best-effort: pull the agent's last assistant text out of the transcript so
 * the seed suggestions can react to it (failing tests, etc.). Any problem just
 * yields undefined — the engine still produces generic seeds.
 */
function extractRecent(transcriptPath?: string): string | undefined {
  if (!transcriptPath) return undefined;
  try {
    const lines = readFileSync(transcriptPath, "utf8").trim().split("\n");
    let userFallback: string | undefined;
    for (let i = lines.length - 1; i >= 0; i--) {
      let entry: any;
      try {
        entry = JSON.parse(lines[i]);
      } catch {
        continue;
      }
      const msg = entry?.message ?? entry;
      if (msg?.role !== "assistant" && msg?.role !== "user") continue;
      const content = msg.content;
      const text =
        typeof content === "string"
          ? content
          : Array.isArray(content)
            ? content
                .map((b: any) => (b?.type === "text" ? b.text : ""))
                .join(" ")
            : "";
      if (!text.trim()) continue;
      // Prefer the agent's last meaningful text; if its final turn was a bare
      // tool call (e.g. the picker), remember the latest user text and use it
      // only if no assistant text turns up.
      if (msg.role === "assistant") return text.trim().slice(0, 600);
      if (userFallback === undefined) userFallback = text.trim().slice(0, 600);
    }
    return userFallback;
  } catch {
    // file missing / unreadable — fine, fall through
  }
  return undefined;
}

async function main() {
  const raw = await readStdin();
  let payload: StopPayload = {};
  try {
    payload = JSON.parse(raw || "{}");
  } catch {
    // malformed payload — fail open by allowing the stop
    process.exit(0);
  }

  // The user genuinely re-engaged if this is a fresh prompt OR they just
  // answered a picker. Either way, reset the runaway counter and fire.
  const humanGated =
    !payload.stop_hook_active ||
    recentlyAnsweredPicker(payload.transcript_path);

  const cp = counterPath(payload.session_id);
  const count = humanGated ? 0 : getCount(cp) + 1;
  setCount(cp, count);

  if (count > HARD_CAP) {
    // Model is ignoring the picker and rambling — let it stop to avoid a
    // runaway. A fresh user message will reset and re-enable the picker.
    debug(`allow-stop cap=${count} session=${payload.session_id ?? "?"}`);
    process.exit(0);
  }

  debug(`FIRE gated=${humanGated} count=${count} session=${payload.session_id ?? "?"}`);

  const recent = extractRecent(payload.transcript_path);
  const seeds = fallbackSuggestions({ recent });

  const out = {
    decision: "block",
    reason: buildPickerInstruction(seeds),
  };
  process.stdout.write(JSON.stringify(out));
  process.exit(0);
}

main().catch(() => process.exit(0)); // never block the user on a hook error
