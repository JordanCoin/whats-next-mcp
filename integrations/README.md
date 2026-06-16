# Integrations — making "what's next" work in each terminal agent

Two layers everywhere:

- **Universal (soft):** the `suggest_next` MCP tool + `AGENTS.md` rule. Works in
  any MCP-capable host that reads an instructions file. Puts an interactive
  question in the conversation — *if the model complies*.
- **Per-host trigger (hard):** a turn-end hook that fires the picker no matter
  what. Only possible where the host exposes a turn-end event.

## Coverage

| Host | Universal layer | Hard turn-end trigger | Drives an interactive picker? |
|------|-----------------|------------------------|-------------------------------|
| **Claude Code** | MCP + AGENTS.md | `Stop` hook → `decision: block` | ✅ forces `AskUserQuestion` |
| **Cursor** (CLI/IDE) | MCP + AGENTS.md / `.cursor/rules` | `stop` hook → `followup_message` | ✅ re-injects a turn that asks |
| **opencode** | MCP + AGENTS.md (native) | `session.idle` plugin (observe-only) | ⚠️ soft only + desktop-notification backstop |
| **Codex / Gemini / Amp / others** | MCP + AGENTS.md | none exposed | ⚠️ soft only |

The honest limit: a host with no turn-end event, or an observe-only one
(opencode), cannot be *forced* to open the picker. There the AGENTS.md rule is
the best achievable guarantee.

## Setup

### Claude Code
Add the `Stop` hook to `.claude/settings.json` (see repo root README). Forces
`AskUserQuestion` every turn-end.

### Cursor
Copy `cursor/hooks.json` to `.cursor/hooks.json` (project) or `~/.cursor/hooks.json`
(global). It runs `dist/cursor-hook.js` on the `stop` event and returns a
`followup_message` instructing the agent to open its question tool.
Optionally register the MCP server in `.cursor/mcp.json`.

### opencode
1. Copy `opencode/opencode.json` to your project (or merge its `mcp` block) to
   register the MCP server.
2. Copy `opencode/plugin/whats-next.ts` to `.opencode/plugin/` (project) or
   `~/.config/opencode/plugin/` (global) for the idle-notification backstop.
3. opencode reads `AGENTS.md` natively — keep it in the project root.

### Everything else
Place `AGENTS.md` (repo root) where the host reads it (`AGENTS.md`, `CLAUDE.md`,
`GEMINI.md`, etc.) and register the MCP server with that host's MCP config.
