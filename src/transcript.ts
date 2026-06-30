/**
 * Transcript inspection helpers for the Stop hook.
 *
 * Kept separate from hook.ts (which runs `main()` on import) so the logic is
 * pure and unit-testable.
 */

import { readFileSync } from "node:fs";

/**
 * Only the recent tail matters: a background task we should wait on was launched
 * in the active stretch of the conversation. Bounding the window also means a
 * task that was killed and never produced a completion notification can't
 * suppress the picker forever — once its launch scrolls past the window we fire.
 */
const TAIL_WINDOW = 400;

/** Tools whose calls can run in the background and finish on a LATER turn. */
const BACKGROUND_TOOLS = new Set(["Agent", "Task", "Workflow"]);
/** A backgrounded Workflow's launch ack carries a "Task ID: …". */
const WORKFLOW_LAUNCH_RE = /Task ID[:\s]+([A-Za-z0-9_-]+)/;
/** Completion arrives as a `<task-notification>` user message. */
const TASK_ID_RE = /<task-id>\s*([A-Za-z0-9_-]+)\s*<\/task-id>/g;

function matchAll(re: RegExp, s: string): string[] {
  const ids: string[] = [];
  let m: RegExpExecArray | null;
  re.lastIndex = 0;
  while ((m = re.exec(s)) !== null) ids.push(m[1]);
  return ids;
}

function contentBlocks(entry: any): any[] {
  const msg = entry?.message ?? entry;
  const c = msg?.content;
  return Array.isArray(c) ? c : [];
}

/**
 * Is a background task (async Agent/Task, or a backgrounded Workflow) still
 * running? True when a launched task id has no matching `<task-notification>`
 * in the recent tail yet.
 *
 * A backgrounded task does NOT block the main loop: its tool_use returns an
 * immediate "launched" ack and the loop keeps going, so it can stop while the
 * task is still working. The completion is delivered LATER as a
 * `<task-notification>`. "Launched but not yet notified" is therefore exactly
 * "still cooking" — the moment to stay silent instead of re-prompting.
 *
 * Detection is deliberately tied to the *launching tool*, not to free text: a
 * Bash command that merely prints "Task ID: …" (e.g. dumping a transcript) must
 * not be mistaken for a real launch. Async agents are recognized by the
 * structured `toolUseResult.status` the host sets; Workflows by a `Task ID:` in
 * a tool_result whose tool_use is named `Workflow`; completions only by a real
 * `<task-notification>` user message (string content, not nested tool output).
 */
export function contentHasPendingBackgroundTask(content: string): boolean {
  const entries: any[] = [];
  for (const line of content.trim().split("\n").slice(-TAIL_WINDOW)) {
    try {
      entries.push(JSON.parse(line));
    } catch {
      /* skip malformed line */
    }
  }

  // Pass 1: map each background tool_use id to its tool name.
  const toolName = new Map<string, string>();
  for (const entry of entries) {
    for (const b of contentBlocks(entry)) {
      if (
        b?.type === "tool_use" &&
        typeof b.id === "string" &&
        BACKGROUND_TOOLS.has(b.name)
      ) {
        toolName.set(b.id, b.name);
      }
    }
  }

  // Pass 2: collect launched vs. completed task ids.
  const launched = new Set<string>();
  const completed = new Set<string>();
  for (const entry of entries) {
    // Async Agent/Task launch: structured ack the host sets on the entry.
    const tur = entry?.toolUseResult;
    if (
      tur &&
      typeof tur === "object" &&
      (tur.status === "async_launched" || tur.isAsync === true) &&
      typeof tur.agentId === "string"
    ) {
      launched.add(tur.agentId);
    }

    for (const b of contentBlocks(entry)) {
      // Workflow launch: only a tool_result tied to a Workflow tool_use counts.
      if (
        b?.type === "tool_result" &&
        toolName.get(b.tool_use_id) === "Workflow"
      ) {
        const txt =
          typeof b.content === "string" ? b.content : JSON.stringify(b.content);
        const m = WORKFLOW_LAUNCH_RE.exec(txt);
        if (m) launched.add(m[1]);
      }
    }

    // Completion: a real task-notification is a user message whose content is a
    // plain string. Nested tool output that happens to contain the tag is not.
    const c = (entry?.message ?? entry)?.content;
    if (typeof c === "string" && c.includes("<task-notification>")) {
      for (const id of matchAll(TASK_ID_RE, c)) completed.add(id);
    }
  }

  for (const id of launched) {
    if (!completed.has(id)) return true;
  }
  return false;
}

/** File-reading wrapper around {@link contentHasPendingBackgroundTask}. */
export function hasPendingBackgroundTask(transcriptPath?: string): boolean {
  if (!transcriptPath) return false;
  try {
    return contentHasPendingBackgroundTask(readFileSync(transcriptPath, "utf8"));
  } catch {
    // unreadable — treat as nothing pending so the picker still fires
    return false;
  }
}
