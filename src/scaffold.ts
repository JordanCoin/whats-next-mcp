/**
 * The prompt-as-tool engine.
 *
 * In MCP, a tool's return value is injected straight back into the host
 * model's context. So a tool can "do work" purely by returning a carefully
 * worded instruction that steers what the model does next. No LLM call, no
 * network, no API key — the host model (Claude, or whatever opencode runs)
 * does the thinking, on demand.
 *
 * This module builds that instruction. The last paragraph is what makes the
 * loop recursive: it tells the agent to call `suggest_next` again after it
 * acts, so the user is never left without a next move.
 */

export interface SuggestInput {
  /** The user's current objective, if known. */
  goal?: string;
  /** A short summary of recent actions / current state. */
  recent?: string;
  /** How many suggestions to produce (default 5). */
  count?: number;
}

const DEFAULT_COUNT = 5;

/** Clamp the requested count into a sane range so prompts stay focused. */
export function normalizeCount(count?: number): number {
  if (!count || Number.isNaN(count)) return DEFAULT_COUNT;
  return Math.min(Math.max(Math.trunc(count), 3), 8);
}

export function buildScaffold(input: SuggestInput): string {
  const count = normalizeCount(input.count);
  const goalLine = input.goal
    ? `The user's current goal: ${input.goal}`
    : `The user has not stated an explicit goal — infer it from the conversation so far.`;
  const recentLine = input.recent
    ? `Recent actions / state: ${input.recent}`
    : `Consider everything that has happened in this session so far as the context.`;

  return [
    `# What's next`,
    ``,
    goalLine,
    recentLine,
    ``,
    `Reflect on where things stand, then propose **${count} concrete next steps**.`,
    `For each one, give:`,
    `1. **Action** — a short imperative ("Add tests for the parser").`,
    `2. **Why now** — what it unblocks or de-risks at this moment.`,
    `3. **Effort** — S / M / L.`,
    `4. **Start here** — the exact first command, file, or function to touch.`,
    ``,
    `Rules:`,
    `- Rank by impact, most valuable first.`,
    `- Make them genuinely distinct (not five flavors of the same task).`,
    `- Include at least one cheap "S" step so there's always a low-friction option.`,
    `- Prefer steps grounded in the actual context over generic advice.`,
    ``,
    `Then present them as an **interactive picker**, not plain text: call your`,
    `multiple-choice question tool (e.g. \`AskUserQuestion\`) with question`,
    `"What should we do next?", header "Next step", and one option per suggestion`,
    `(label = the action, description = why + where to start). The user can pick`,
    `the auto-added "Other" choice to type their own, or say "done".`,
    ``,
    `When the user picks one, carry it out — and **after you finish, call the`,
    `\`suggest_next\` tool again** with the updated goal and what you just did.`,
    `That keeps a fresh interactive prompt available so the user is never stuck.`,
  ].join("\n");
}
