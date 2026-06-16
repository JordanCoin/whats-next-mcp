# Changelog

All notable changes to this project are documented here.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

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

[Unreleased]: https://github.com/JordanCoin/whats-next-mcp/compare/v0.1.0...HEAD
[0.1.0]: https://github.com/JordanCoin/whats-next-mcp/releases/tag/v0.1.0
