#!/usr/bin/env python3
"""Switch whats-next-mcp between DEV and WILD setups in one shot.

DEV  = your local build: the Stop hook and MCP server run `node <repo>/dist/...`,
       so they reflect whatever you just `npm run build`-ed. Use while developing.
WILD = the published global package: hook/MCP run the `whats-next-*` bins from
       `npm install -g`. Repo-independent; what real users get.

It toggles two things together:
  1. the Claude Code Stop hook `command` in .claude/settings.json
  2. the `whats-next` MCP server registration (via the `claude` CLI)

Usage:
  python3 scripts/switch_mode.py dev           # local dist/ build
  python3 scripts/switch_mode.py wild          # published global bins
  python3 scripts/switch_mode.py wild --no-gstack
  python3 scripts/switch_mode.py dev --build    # npm run build first
  python3 scripts/switch_mode.py wild --scope user
  python3 scripts/switch_mode.py status         # show current wiring
  python3 scripts/switch_mode.py dev --dry-run  # preview, change nothing

After switching, run `/hooks` in Claude Code (or restart) to reload.
"""
from __future__ import annotations

import argparse
import json
import shutil
import subprocess
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parent.parent
DEFAULT_SETTINGS = REPO_ROOT / ".claude" / "settings.json"
MCP_NAME = "whats-next"

MODE_ALIASES = {
    "dev": "dev", "local": "dev",
    "wild": "wild", "prod": "wild", "npm": "wild", "global": "wild",
    "status": "status",
}


def hook_command(mode: str, gstack: bool) -> str:
    base = f"node {REPO_ROOT / 'dist' / 'hook.js'}" if mode == "dev" else "whats-next-hook"
    return f"WHATS_NEXT_GSTACK=1 {base}" if gstack else base


def mcp_command(mode: str) -> list[str]:
    if mode == "dev":
        return ["node", str(REPO_ROOT / "dist" / "index.js")]
    return ["whats-next-mcp"]


def looks_like_whats_next(cmd: str) -> bool:
    return (
        "whats-next-hook" in cmd
        or "whats-next-mcp" in cmd
        or "/dist/hook.js" in cmd
    )


def update_hook(settings_path: Path, command: str, dry_run: bool) -> None:
    data = {}
    if settings_path.exists():
        try:
            data = json.loads(settings_path.read_text() or "{}")
        except json.JSONDecodeError:
            print(f"  hook: {settings_path} is not valid JSON — skipping (fix it first)")
            return
    hooks = data.get("hooks") if isinstance(data.get("hooks"), dict) else {}
    stop = hooks.get("Stop") if isinstance(hooks.get("Stop"), list) else []

    found = False
    for entry in stop:
        if not isinstance(entry, dict) or not isinstance(entry.get("hooks"), list):
            continue
        for h in entry["hooks"]:
            if (
                isinstance(h, dict)
                and h.get("type") == "command"
                and isinstance(h.get("command"), str)
                and looks_like_whats_next(h["command"])
            ):
                print(f"  hook: {h['command']}\n     -> {command}")
                if not dry_run:
                    h["command"] = command
                found = True

    if not found:
        print(f"  hook: (added) -> {command}")
        stop.append({"hooks": [{"type": "command", "command": command}]})

    hooks["Stop"] = stop
    data["hooks"] = hooks
    if not dry_run:
        settings_path.parent.mkdir(parents=True, exist_ok=True)
        settings_path.write_text(json.dumps(data, indent=2) + "\n")


def update_mcp(mode: str, scope: str, gstack: bool, dry_run: bool) -> None:
    if not shutil.which("claude"):
        print("  mcp: `claude` CLI not found — skipping MCP registration")
        return
    remove = ["claude", "mcp", "remove", MCP_NAME]
    # Name MUST come before -e: `claude mcp add`'s -e flag is variadic and will
    # otherwise swallow the server name as a second env var. Keep -e right
    # before the `--` command separator so it only collects the env entry.
    add = ["claude", "mcp", "add", MCP_NAME, "--scope", scope]
    if gstack:
        add += ["-e", "WHATS_NEXT_GSTACK=1"]
    add += ["--", *mcp_command(mode)]

    print(f"  mcp: {' '.join(add)}")
    if dry_run:
        return
    subprocess.run(remove, capture_output=True, text=True)  # best-effort
    result = subprocess.run(add, capture_output=True, text=True)
    if result.returncode != 0:
        print("  mcp: FAILED\n" + (result.stderr or result.stdout).strip())
    else:
        print("  mcp: registered")


def show_status(settings_path: Path) -> None:
    print("whats-next-mcp wiring")
    cmd = None
    if settings_path.exists():
        try:
            data = json.loads(settings_path.read_text() or "{}")
            for entry in data.get("hooks", {}).get("Stop", []):
                for h in entry.get("hooks", []) if isinstance(entry, dict) else []:
                    if isinstance(h, dict) and looks_like_whats_next(str(h.get("command", ""))):
                        cmd = h["command"]
        except json.JSONDecodeError:
            cmd = "(settings.json is invalid JSON)"
    if cmd:
        mode = "dev" if "/dist/hook.js" in cmd else "wild"
        gstack = "on" if "WHATS_NEXT_GSTACK=1" in cmd else "off"
        print(f"  hook : {cmd}")
        print(f"         mode={mode}  gstack={gstack}  ({settings_path})")
    else:
        print(f"  hook : (no whats-next hook in {settings_path})")

    if shutil.which("claude"):
        result = subprocess.run(["claude", "mcp", "list"], capture_output=True, text=True)
        line = next((l for l in result.stdout.splitlines() if MCP_NAME in l), None)
        print(f"  mcp  : {line.strip() if line else '(not registered)'}")
    else:
        print("  mcp  : `claude` CLI not found")


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Switch whats-next-mcp between DEV (local build) and WILD (published global).",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog=__doc__,
    )
    parser.add_argument("mode", choices=sorted(MODE_ALIASES), help="dev | wild | status (+ aliases local/prod/npm/global)")
    parser.add_argument("--gstack", dest="gstack", action="store_true", default=True, help="enable gstack mode (default)")
    parser.add_argument("--no-gstack", dest="gstack", action="store_false", help="generic suggestions instead of gstack skills")
    parser.add_argument("--scope", choices=["user", "local", "project"], default="local", help="MCP registration scope (default: local)")
    parser.add_argument("--settings", type=Path, default=DEFAULT_SETTINGS, help="settings.json to edit (default: project .claude/settings.json)")
    parser.add_argument("--no-hook", action="store_true", help="don't touch the Stop hook")
    parser.add_argument("--no-mcp", action="store_true", help="don't touch the MCP registration")
    parser.add_argument("--build", action="store_true", help="run `npm run build` first (dev mode)")
    parser.add_argument("--dry-run", action="store_true", help="print changes without applying")
    args = parser.parse_args()

    mode = MODE_ALIASES[args.mode]
    if mode == "status":
        show_status(args.settings)
        return

    suffix = " [dry-run]" if args.dry_run else ""
    print(f"Switching to {mode.upper()} (gstack {'on' if args.gstack else 'off'}, scope {args.scope}){suffix}:")

    if mode == "dev" and args.build and not args.dry_run:
        print("  build: npm run build")
        subprocess.run(["npm", "run", "build"], cwd=REPO_ROOT)

    if not args.no_hook:
        update_hook(args.settings, hook_command(mode, args.gstack), args.dry_run)
    if not args.no_mcp:
        update_mcp(mode, args.scope, args.gstack, args.dry_run)

    print("\nNext: run `/hooks` in Claude Code (or restart) to reload the hook + MCP config.")


if __name__ == "__main__":
    main()
