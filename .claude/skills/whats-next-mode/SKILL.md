---
name: whats-next-mode
description: Switch this machine's whats-next-mcp wiring between DEV (local ./dist build) and WILD (published global npm bins), toggling both the Claude Code Stop hook and the whats-next MCP server in one shot. Use when the user says "switch to dev/wild/local/prod whats-next", "use the local build", "use the published version", "what mode am I in", or wants to toggle between developing whats-next-mcp and using the released package.
---

# whats-next-mode

Toggle whats-next-mcp between two setups, both the **Stop hook** and the **MCP
server** at once, via `scripts/switch_mode.py`.

- **DEV** — hook + MCP run `node <repo>/dist/...`, so they reflect your latest
  `npm run build`. Use while developing whats-next-mcp itself.
- **WILD** — hook + MCP run the global `whats-next-*` bins from `npm install -g`.
  Repo-independent; the released version real users get.

## How to run it

Always start with `status` to see where things stand, then switch. Prefer
`--dry-run` first when the user is unsure.

```bash
python3 scripts/switch_mode.py status          # show current wiring
python3 scripts/switch_mode.py dev --build      # local build (rebuild first)
python3 scripts/switch_mode.py wild             # published global bins
python3 scripts/switch_mode.py dev --dry-run    # preview, change nothing
```

Run the command from the repo root. Report the output back to the user.

## Flags

| Flag | Effect |
|------|--------|
| `dev` / `wild` / `status` | mode (aliases: `local`→dev, `prod`/`npm`/`global`→wild) |
| `--build` | run `npm run build` first (dev only) so dist is fresh |
| `--gstack` / `--no-gstack` | gstack-skill picker vs generic (default: gstack on) |
| `--scope user\|local\|project` | MCP registration scope (default: local) |
| `--settings <path>` | which settings.json to edit (default: project `.claude/settings.json`) |
| `--no-hook` / `--no-mcp` | only touch one of the two |
| `--dry-run` | print the changes without applying them |

## After switching — IMPORTANT

The script edits `.claude/settings.json` and re-registers the MCP server, but
Claude Code caches both at session start. **Tell the user to run `/hooks` (or
restart) to reload.** Until they do, the running session keeps the old wiring.

## Notes

- `dev` mode reflects local code edits after each `npm run build`; `wild` mode
  only changes when you `npm publish` + `npm update -g`.
- The script never clobbers a malformed `settings.json` — it skips the hook edit
  and says so.
- It's idempotent: running the same mode twice is a no-op beyond rewriting the
  command string.
