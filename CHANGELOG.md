# Changelog

All notable changes to this project are documented here.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- **gstack mode** (`--gstack` flag or `WHATS_NEXT_GSTACK=1`): the picker's
  options become gstack workflow skills (`/spec`, `/qa`, `/review`, `/ship`,
  `/retro`) mapped to the current state, instead of generic advice. Honored by
  the MCP tool, both turn-end hooks, and the CLI.

## [0.1.2] — 2026-06-16

### Added

- Added `npx -y whats-next-mcp@latest install claude` for one-command Claude
  Code setup.
- Added tests for safely merging the Claude Code `Stop` hook without removing
  existing hooks.

### Changed

- Reworked the README around the npm install path, with manual/source setup as
  fallback documentation.
- `install claude` now writes the Stop hook to the settings file matching
  `--scope` (user → `~/.claude/settings.json`, project → `.claude/settings.json`,
  local → `.claude/settings.local.json`) instead of always the user file.

### Fixed

- The installer no longer aborts (or overwrites) when the target
  `settings.json` contains invalid JSON — it skips the hook and explains how to
  proceed.
- `install --help` (help flag in any position) now prints usage.
- Installer CLI errors render a clean message and exit non-zero instead of a
  `Fatal:` stack trace.
- Warn when a `whats-next` MCP entry already exists, since an old local/project
  registration outranks a new user-scope install.
- The installed Stop hook now sets a 60s `timeout`, so a slow/cold `npx` fetch
  can't block turn-end for the 600s default.
- The user-scope hook path honors `CLAUDE_CONFIG_DIR` for isolated configs.
- `install` exits non-zero when MCP registration fails or the hook is skipped,
  instead of always reporting success.
- Value-taking flags (`--scope`, `--settings`, `--package`) now error on a
  missing value instead of silently falling back to defaults.
- The installer no longer rewrites `settings.json` when the hook is already
  present, and warns about untracked `.claude/settings.local.json` for
  `--scope local`.

## [0.1.1] — 2026-06-16

### Changed

- Synced the npm package description with the GitHub repository — now mentions
  Cursor and the interactive-picker behavior. Metadata-only; no code changes.

## [0.1.0] — 2026-06-15

Initial release.

### Added

- **`suggest_next` MCP tool** — returns ranked, concrete next steps and drives
  an interactive picker (`AskUserQuestion`), then instructs the agent to call
  it again after acting so the suggestions never run dry.
- **Hybrid engine** — an optional LLM "second brain" (with `ANTHROPIC_API_KEY`)
  on top of a deterministic, offline **"never empty"** fallback floor.
- **Turn-end triggers** — a Claude Code `Stop` hook and a Cursor `stop` hook
  that fire the picker automatically, even when the model never calls the tool.
- **Universal CLI primitive** (`whats-next`) for any host that can shell out on
  turn-end, plus a portable `AGENTS.md` soft rule.
- **Test suite** — 19 tests covering the never-empty guarantee, picker
  dedup/cap/escaping, and tolerant JSON parsing.
- **CI** — GitHub Actions running build + tests on Node 18, 20, and 22.

[Unreleased]: https://github.com/JordanCoin/whats-next-mcp/compare/v0.1.2...HEAD
[0.1.2]: https://github.com/JordanCoin/whats-next-mcp/compare/v0.1.1...v0.1.2
[0.1.1]: https://github.com/JordanCoin/whats-next-mcp/compare/v0.1.0...v0.1.1
[0.1.0]: https://github.com/JordanCoin/whats-next-mcp/releases/tag/v0.1.0
