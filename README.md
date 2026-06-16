# whats-next-mcp

[![CI](https://github.com/JordanCoin/whats-next-mcp/actions/workflows/ci.yml/badge.svg)](https://github.com/JordanCoin/whats-next-mcp/actions/workflows/ci.yml)
[![npm version](https://img.shields.io/npm/v/whats-next-mcp.svg)](https://www.npmjs.com/package/whats-next-mcp)
[![license: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)

An [MCP](https://modelcontextprotocol.io) server that guarantees an agent
**always has concrete suggestions for what to do next** — a recursive
"never a dead end" companion for Claude Code, opencode, Cursor, Zed, and any
MCP host.

It exposes one tool, `suggest_next`. The agent calls it whenever it finishes a
step, feels stuck, or is about to ask you an open-ended "what now?". The tool
returns an instruction that drives an **interactive picker** (Claude Code's
`AskUserQuestion`, or any host's equivalent) so the next steps are *selectable*,
not plain text — **and it tells the agent to call `suggest_next` again after
acting**, so the well never runs dry. The tool and both turn-end hooks (Claude
Code, Cursor) all drive the same picker; the CLI emits the same suggestions as
text for hosts that render them their own way.

## Two parts: the engine and the trigger

A plain MCP tool only runs when the host model *chooses* to call it — that's a
hope, not a guarantee. So this package ships two things:

1. **`suggest_next` (MCP tool)** — the engine. Call it on demand from any MCP
   host.
2. **A Claude Code `Stop` hook** — the trigger. It fires the same engine the
   instant the agent finishes a turn and injects the suggestions, so the user
   **always** sees what's next regardless of whether the model called the tool.
   A loop guard (`stop_hook_active`) makes it fire exactly once per turn.

## How the engine works

`suggest_next` is **hybrid**:

1. **LLM-backed (if `ANTHROPIC_API_KEY` is set):** asks Claude for an
   independent, ranked list of next steps — a genuine second opinion not biased
   by the host model's own assumptions — then renders it as a picker.
2. **Deterministic floor (always):** with no key, the tool returns guaranteed
   non-empty seed suggestions as a picker instruction. No network, no key,
   works offline.

Either way the tool's result is a "prompt-as-tool" instruction: in MCP a tool
result is fed straight back into the host model's context, so a tool can do
useful work simply by returning a well-crafted instruction — here, "render
these as an interactive picker, then call `suggest_next` again after acting."
The host model does the rendering, on demand.

## Quick install

```bash
npx -y whats-next-mcp@latest install claude
```

That one command:

- registers the `whats-next` MCP server in Claude Code
- adds the Claude Code `Stop` hook, so the picker appears at turn-end
- uses `npx`, so there is nothing to clone or build
- works with no API key

Restart Claude Code if it was already open.

Want to preview what it will change?

```bash
npx -y whats-next-mcp@latest install claude --dry-run
```

## Manual setup

Use this if you want to wire things yourself or install into a project instead
of your user-level Claude Code config.

### Claude Code MCP server

```bash
claude mcp add --scope user whats-next -- npx -y whats-next-mcp@latest
```

### Claude Code turn-end hook

Add to `~/.claude/settings.json` (or a project `.claude/settings.json`):

```json
{
  "hooks": {
    "Stop": [
      {
        "hooks": [
          {
            "type": "command",
            "command": "npx -y -p whats-next-mcp@latest whats-next-hook"
          }
        ]
      }
    ]
  }
}
```

Now every time the agent finishes, it presents ranked next steps before going
quiet — you're never left without a direction. The hook uses deterministic
suggestions, so no Anthropic API call is made at turn-end.

### Other MCP hosts

Add to the host's MCP config:

```json
{
  "mcpServers": {
    "whats-next": {
      "command": "npx",
      "args": ["-y", "whats-next-mcp@latest"],
      "env": { "ANTHROPIC_API_KEY": "sk-... (optional)" }
    }
  }
}
```

### CLI-only use

You can also ask for deterministic next-step suggestions from any shell:

```bash
npx -y -p whats-next-mcp@latest whats-next --goal "ship the parser"
```

## Develop from source

```bash
git clone https://github.com/JordanCoin/whats-next-mcp.git
cd whats-next-mcp
npm install
npm run build
```

Then point a host at the local build. Use an **absolute** path — a user-scoped
server is reused from every project, so a relative `./dist/index.js` would
resolve against whatever directory Claude launches in:

```bash
claude mcp add --scope user whats-next-local -- node "$(pwd)/dist/index.js"
```

## Environment

| Variable            | Purpose                                              |
| ------------------- | ---------------------------------------------------- |
| `ANTHROPIC_API_KEY` | Optional. Enables the LLM-backed "second brain".     |
| `WHATS_NEXT_MODEL`  | Optional. Override the model (default `claude-sonnet-4-6`). |

## The `suggest_next` tool

| Param    | Type     | Description                                  |
| -------- | -------- | -------------------------------------------- |
| `goal`   | string?  | The user's current objective, if known.      |
| `recent` | string?  | Short summary of recent actions / state.     |
| `count`  | number?  | How many suggestions (3–8, default 5).       |

## License

MIT
