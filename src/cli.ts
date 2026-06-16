#!/usr/bin/env node
/**
 * Universal CLI primitive.
 *
 * Prints deterministic, offline next-step suggestions to stdout. Any host that
 * can run a shell command on turn-end (opencode plugins, git-style hooks, tmux,
 * shell prompts, CI) can shell out to this and surface the result however it
 * likes. The MCP tool and the Claude Code hook share the same engine, so output
 * is consistent everywhere.
 *
 * Usage:
 *   whats-next                       # generic seeds + scaffold
 *   whats-next --goal "ship parser"  # tailored to a goal
 *   whats-next --recent "tests fail" # reacts to recent state
 *   whats-next --json                # machine-readable seeds only
 */

import { composeDeterministic } from "./engine.js";
import { fallbackSuggestions } from "./fallback.js";

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(name);
  if (i < 0) return undefined;
  const next = process.argv[i + 1];
  // Don't swallow the following flag as this one's value (e.g. `--goal --json`).
  return next && !next.startsWith("--") ? next : undefined;
}

const input = { goal: arg("--goal"), recent: arg("--recent") };

if (process.argv.includes("--json")) {
  process.stdout.write(JSON.stringify(fallbackSuggestions(input), null, 2) + "\n");
} else {
  process.stdout.write(composeDeterministic(input) + "\n");
}
