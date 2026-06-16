# whats-next-mcp

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

## Install

```bash
npm install
npm run build
```

## Configure your MCP host

### Claude Code

```bash
claude mcp add whats-next -- node /absolute/path/to/whats-next-mcp/dist/index.js
```

Or, once published to npm:

```bash
claude mcp add whats-next -- npx -y whats-next-mcp
```

### Claude Code — the turn-end guarantee (Stop hook)

Add to `~/.claude/settings.json` (or a project `.claude/settings.json`):

```json
{
  "hooks": {
    "Stop": [
      {
        "hooks": [
          {
            "type": "command",
            "command": "node /absolute/path/to/whats-next-mcp/dist/hook.js"
          }
        ]
      }
    ]
  }
}
```

Now every time the agent finishes, it presents ranked next steps before going
quiet — you're never left without a direction. The hook is deterministic and
offline (no API call), so it doesn't slow down turn-end.

### opencode / other hosts

Add to the host's MCP config:

```json
{
  "mcpServers": {
    "whats-next": {
      "command": "node",
      "args": ["/absolute/path/to/whats-next-mcp/dist/index.js"],
      "env": { "ANTHROPIC_API_KEY": "sk-... (optional)" }
    }
  }
}
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
