/**
 * Optional LLM-backed engine — the "second brain".
 *
 * When ANTHROPIC_API_KEY is present, we ask Claude to independently generate
 * ranked next steps from the context the agent passed in. This is valuable
 * because the suggestions aren't biased by the host model's own assumptions —
 * it's a genuinely separate perspective on "what's next".
 *
 * The @anthropic-ai/sdk is an optionalDependency, so we import it lazily and
 * fall back gracefully if it's missing or the call fails.
 */

import type { SuggestInput } from "./scaffold.js";
import { normalizeCount } from "./scaffold.js";

export interface Suggestion {
  action: string;
  why: string;
  effort: "S" | "M" | "L";
  startHere: string;
}

export function llmEnabled(): boolean {
  return Boolean(process.env.ANTHROPIC_API_KEY);
}

const MODEL = process.env.WHATS_NEXT_MODEL || "claude-sonnet-4-6";

/**
 * Ask Claude for next steps. Returns a list of suggestions, or null if the
 * SDK is unavailable / the call fails (caller then degrades to the scaffold
 * or the local fallback).
 */
export async function generateSuggestions(
  input: SuggestInput
): Promise<Suggestion[] | null> {
  const count = normalizeCount(input.count);
  let Anthropic: typeof import("@anthropic-ai/sdk").default;
  try {
    Anthropic = (await import("@anthropic-ai/sdk")).default;
  } catch {
    return null; // optional dependency not installed
  }

  const client = new Anthropic();
  const goal = input.goal ?? "(infer from the context below)";
  const recent = input.recent ?? "(no explicit recent-actions summary provided)";

  try {
    const message = await client.messages.create({
      model: MODEL,
      max_tokens: 1024,
      system:
        "You are a focused planning assistant. Given a goal and recent state, " +
        "you propose distinct, high-impact next steps. You reply ONLY with a " +
        "JSON array — no prose, no markdown fences.",
      messages: [
        {
          role: "user",
          content:
            `Goal: ${goal}\n` +
            `Recent: ${recent}\n\n` +
            `Produce ${count} distinct next steps ranked by impact. ` +
            `Include at least one low-effort ("S") option. ` +
            `Return a JSON array where each item is ` +
            `{"action": string, "why": string, "effort": "S"|"M"|"L", "startHere": string}.`,
        },
      ],
    });

    const text = message.content
      .map((b) => (b.type === "text" ? b.text : ""))
      .join("");

    return parseSuggestions(text);
  } catch {
    return null; // network / auth / rate-limit — degrade gracefully
  }
}

/**
 * Pull a JSON array out of the model's reply, tolerating stray prose and
 * markdown fences. We try, in order: the content of a ```fenced``` block, then
 * the whole string, then every `[`-anchored span from the last `]` inward.
 * Exported for direct testing — it's the most failure-prone parse in the code.
 */
export function parseSuggestions(text: string): Suggestion[] | null {
  for (const candidate of jsonCandidates(text)) {
    const result = coerce(candidate);
    if (result) return result;
  }
  return null;
}

/** Yield substrings that might be the JSON array, most-likely first. */
function* jsonCandidates(text: string): Generator<string> {
  const fence = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fence) yield fence[1];
  yield text;
  const end = text.lastIndexOf("]");
  if (end === -1) return;
  let start = text.indexOf("[");
  while (start !== -1 && start < end) {
    yield text.slice(start, end + 1);
    start = text.indexOf("[", start + 1);
  }
}

/** Parse one candidate string into validated suggestions, or null. */
function coerce(candidate: string): Suggestion[] | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(candidate.trim());
  } catch {
    return null;
  }
  if (!Array.isArray(parsed) || parsed.length === 0) return null;
  const out = parsed
    .filter((s) => s && typeof s.action === "string")
    .map((s) => ({
      action: String(s.action),
      why: String(s.why ?? ""),
      effort: (["S", "M", "L"].includes(s.effort) ? s.effort : "M") as
        | "S"
        | "M"
        | "L",
      startHere: String(s.startHere ?? ""),
    }));
  return out.length > 0 ? out : null;
}

/** Render structured suggestions into the same shape the scaffold produces. */
export function renderSuggestions(
  suggestions: Suggestion[],
  includeFooter = true
): string {
  const lines = ["# What's next", ""];
  suggestions.forEach((s, i) => {
    lines.push(`**${i + 1}. ${s.action}**  _(${s.effort})_`);
    if (s.why) lines.push(`   - Why now: ${s.why}`);
    if (s.startHere) lines.push(`   - Start here: ${s.startHere}`);
    lines.push("");
  });
  if (includeFooter) {
    lines.push(
      `> Pick a number to do it, tell me to refine the list, or say "done".`
    );
    lines.push("");
    lines.push(
      "After you finish the chosen step, call the `suggest_next` tool again with " +
        "the updated goal and what you just did, so a fresh list is always ready."
    );
  }
  return lines.join("\n");
}
