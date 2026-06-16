/**
 * Shared suggestion engine, used by both the MCP tool (`index.ts`) and the
 * Stop hook (`hook.ts`). Keeping it in one place means the on-demand tool and
 * the guaranteed turn-end trigger always produce the same kind of output.
 */

import { buildScaffold, type SuggestInput } from "./scaffold.js";
import {
  generateSuggestions,
  llmEnabled,
  renderSuggestions,
  type Suggestion,
} from "./llm.js";
import { fallbackSuggestions } from "./fallback.js";

/** Escape a field before embedding it in a `label: "..."` line. */
function escapeField(text: string): string {
  return text.replace(/\\/g, "\\\\").replace(/"/g, '\\"').replace(/\s+/g, " ").trim();
}

export interface PickerOptions {
  /**
   * When true, append an instruction to call the `suggest_next` tool again
   * after acting. Used by the MCP tool path, where recursion is the model's
   * job. Hooks leave this false because the hook itself re-fires next turn.
   */
  recurseViaTool?: boolean;
}

/**
 * Build the instruction that drives a host's interactive question tool
 * (Claude Code `AskUserQuestion`, or any equivalent picker). This text is fed
 * to the MODEL — it commands the model to render selectable options rather than
 * printing plain text. Shared by every turn-end adapter so behavior is uniform.
 *
 * Dedupes by action and caps at 4 (the AskUserQuestion option limit). Fields
 * are escaped, so it is safe to feed LLM-generated suggestions, not just the
 * static fallback seeds.
 */
export function buildPickerInstruction(
  seeds: Suggestion[],
  opts: PickerOptions = {}
): string {
  const seen = new Set<string>();
  const picked: Suggestion[] = [];
  for (const s of seeds) {
    const key = s.action.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    picked.push(s);
    if (picked.length === 4) break;
  }

  const options = picked
    .map((s, i) => {
      const desc = s.startHere
        ? `${s.why} Start: ${s.startHere}`
        : s.why;
      return `${i + 1}. label: "${escapeField(s.action)}"\n   description: "${escapeField(desc)}"`;
    })
    .join("\n");

  const lastLine = opts.recurseViaTool
    ? "After they choose, carry it out — then call the `suggest_next` tool again with the updated goal and what you just did, so a fresh list is always ready."
    : "After they choose, carry that step out. This recurs each turn, so there is never a dead end.";

  return [
    "Do not end your turn yet — the user must never be left without a clear way forward.",
    "",
    "Call your interactive question/picker tool now (in Claude Code: **AskUserQuestion**). Use:",
    '- question: "What should we do next?"',
    '- header: "Next step"',
    "- options (use each as a { label, description }):",
    options,
    "",
    'The user can pick the auto-added "Other" choice to type their own, or say done.',
    lastLine,
  ].join("\n");
}

/**
 * Deterministic, zero-network suggestions: context-aware seed steps plus the
 * prompt scaffold that steers the host model to expand them. Fast enough to
 * run on every turn-end inside a hook.
 */
export function composeDeterministic(input: SuggestInput): string {
  const seeds = fallbackSuggestions(input);
  return (
    renderSuggestions(seeds, /* includeFooter */ false) +
    "\n\n---\n\n" +
    buildScaffold(input)
  );
}

/**
 * Hybrid PICKER instruction for the on-demand MCP tool. Like the hooks, the
 * tool must drive an interactive picker (per AGENTS.md) rather than printing a
 * plain list — so every surface behaves identically. If an API key is set we
 * use the LLM "second brain" for sharper options; otherwise we fall back to the
 * deterministic seeds. Either way the output is a picker instruction that also
 * tells the model to call `suggest_next` again after acting.
 */
export async function composePickerInstruction(
  input: SuggestInput
): Promise<string> {
  if (llmEnabled()) {
    const suggestions = await generateSuggestions(input);
    if (suggestions && suggestions.length > 0) {
      return buildPickerInstruction(suggestions, { recurseViaTool: true });
    }
  }
  return buildPickerInstruction(fallbackSuggestions(input), {
    recurseViaTool: true,
  });
}
