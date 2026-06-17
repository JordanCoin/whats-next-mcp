/**
 * gstack mode — the "engine + payload" combo.
 *
 * whats-next is a control loop that guarantees a picker at every turn-end; on
 * its own it offers generic moves ("run the tests"). When the host has a
 * workflow-skill catalog like gstack (https://github.com/garrytan/gstack)
 * installed, the *better* picker option is a real skill. This module maps the
 * same cheap state signals `fallback.ts` already detects onto gstack's skill
 * arc (spec → build → qa → review → ship → retro), so the never-a-dead-end loop
 * becomes a gstack launchpad.
 *
 * Enabled by the WHATS_NEXT_GSTACK env var (any non-empty value) or the CLI
 * `--gstack` flag. Like the rest of the engine it is deterministic and offline.
 */

import type { SuggestInput } from "./scaffold.js";
import type { Suggestion } from "./llm.js";

/** Is gstack mode turned on for this process? */
export function gstackEnabled(): boolean {
  const v = process.env.WHATS_NEXT_GSTACK;
  return Boolean(v && v !== "0" && v.toLowerCase() !== "false");
}

/** Build a gstack skill suggestion whose "start here" is the slash-command. */
function skill(
  action: string,
  why: string,
  effort: Suggestion["effort"],
  command: string
): Suggestion {
  return { action, why, effort, startHere: `Run ${command}.` };
}

/**
 * gstack-flavored next steps, ranked by what the current state calls for. Always
 * non-empty (the core build-phase moves are unconditional), and deduped by
 * action so a state-specific lead doesn't repeat a core move.
 */
export function gstackSuggestions(input: SuggestInput): Suggestion[] {
  const recent = (input.recent ?? "").toLowerCase();
  const hasGoal = Boolean(input.goal && input.goal.trim());

  // Same signals fallback.ts uses, so the two modes agree on "what's going on".
  const broken = /\b(fail|failing|failed|error|errors|bug|bugs|broken|crash|crashed|exception)\b/.test(recent);
  const noFailNoun = /\b(no|zero|without)\s+\w*\s*(fail(?:ure)?s?|errors?|bugs?|crash(?:es)?)\b/.test(recent);
  const fixedSignal = /\b(fixed|resolved|all (?:green|passing)|no longer (?:fail|error|crash))\b/.test(recent);
  const failing = broken && !noFailNoun && !fixedSignal;
  const green = /\b(pass|passing|passed|green|works|working|done|shipped|merged|landed)\b/.test(recent);

  const seeds: Suggestion[] = [];

  // Phase-appropriate lead.
  if (failing) {
    seeds.push(
      skill(
        "Reproduce and fix the failure with /qa",
        "An unresolved failure invalidates every downstream step.",
        "S",
        "/qa"
      )
    );
  }
  if (!hasGoal) {
    seeds.push(
      skill(
        "Turn the intent into a spec with /spec",
        "A precise, executable spec makes every later step obvious.",
        "M",
        "/spec"
      )
    );
  }

  // Core build-phase moves — always offered so the picker is never empty.
  seeds.push(
    skill(
      "QA the change with /qa",
      "Exercise the affected pages and routes before they reach review.",
      "M",
      "/qa"
    ),
    skill(
      "Review the diff with /review",
      "Catch bugs and simplifications before landing.",
      "M",
      "/review"
    )
  );

  // Past the finish line — keep the arc from trailing off after "it works".
  if (green) {
    seeds.push(
      skill(
        "Land and deploy with /ship",
        "A green checkpoint is the moment to land and ship safely.",
        "M",
        "/ship"
      ),
      skill(
        "Close the loop with /retro and /health",
        "Capture learnings and confirm production health after shipping.",
        "S",
        "/retro"
      )
    );
  }

  // Dedupe by action (defensive — the core moves are distinct from the leads).
  const seen = new Set<string>();
  return seeds.filter((s) => {
    const key = s.action.toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
