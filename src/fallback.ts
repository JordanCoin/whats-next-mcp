/**
 * The "never empty" guarantee.
 *
 * Everything else can fail: no API key, the LLM call times out, the host
 * model is having a bad day. This module is the floor — a deterministic set
 * of next steps computed with zero dependencies and zero network, so the
 * tool's output ALWAYS contains concrete suggestions. This is what literally
 * delivers the promise: "never leave you with no idea what's next."
 *
 * These seeds are returned alongside the prompt scaffold, giving the user
 * real options immediately while the host model expands on them.
 */

import type { SuggestInput } from "./scaffold.js";
import type { Suggestion } from "./llm.js";

/** Universally-useful steps that apply to almost any coding session. */
export const BASE_SEEDS: Suggestion[] = [
  {
    action: "Clarify the immediate goal in one sentence",
    why: "A sharp goal makes every other choice obvious and prevents drift.",
    effort: "S",
    startHere: "Write the goal at the top of your notes or a TODO comment.",
  },
  {
    action: "Run the tests / build to confirm a known-good baseline",
    why: "Knowing what currently passes scopes the next change safely.",
    effort: "S",
    startHere: "Run your project's test or build command.",
  },
  {
    action: "Write down the smallest next change that moves toward the goal",
    why: "Small, reversible steps keep momentum and make review easy.",
    effort: "M",
    startHere: "Pick the one file most central to the goal and open it.",
  },
];

/**
 * Produce a guaranteed-non-empty list of next steps from the (possibly empty)
 * input. Starts from BASE_SEEDS and lightly tailors them to the context with
 * cheap, dependency-free string matching.
 */
export function fallbackSuggestions(input: SuggestInput): Suggestion[] {
  const recent = (input.recent ?? "").toLowerCase();
  const hasGoal = Boolean(input.goal && input.goal.trim());

  // Start from a copy of the universal seeds; the first seed is goal-clarifying.
  const seeds: Suggestion[] = [...BASE_SEEDS];

  // No stated goal -> sharpen the existing goal seed into an urgent ask
  // (replace, don't add, so we never produce two goal items).
  if (!hasGoal) {
    seeds[0] = {
      action: "State the immediate goal in one sentence",
      why: "Nothing else can be prioritized until the target is explicit.",
      effort: "S",
      startHere: "Answer: what should be true that isn't true yet?",
    };
  }

  // Something is broken -> lead with debugging. Cheap string matching can't do
  // real NLP, but we suppress the two most common false positives: an explicit
  // "no errors"-style phrase, and a "fixed/resolved" signal that says the
  // breakage is already handled.
  const broken = /\b(fail|failing|failed|error|errors|bug|bugs|broken|crash|crashed|exception)\b/.test(recent);
  const noFailNoun = /\b(no|zero|without)\s+\w*\s*(fail(?:ure)?s?|errors?|bugs?|crash(?:es)?)\b/.test(recent);
  const fixedSignal = /\b(fixed|resolved|all (?:green|passing)|no longer (?:fail|error|crash))\b/.test(recent);
  if (broken && !noFailNoun && !fixedSignal) {
    seeds.unshift({
      action: "Reproduce and isolate the failure before anything else",
      why: "An unresolved failure invalidates every downstream step.",
      effort: "S",
      startHere: "Re-run the failing command and read the first error, not the last.",
    });
  }

  // Green tests -> capture the progress.
  if (/\b(pass|passing|passed|green|works|working)\b/.test(recent)) {
    seeds.push({
      action: "Commit the working state now",
      why: "A green checkpoint makes the next change safe to attempt and undo.",
      effort: "S",
      startHere: 'git add -A && git commit -m "checkpoint: <what works>"',
    });
  }

  return seeds;
}
