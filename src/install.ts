import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";

type JsonObject = Record<string, unknown>;

export interface InstallOptions {
  dryRun?: boolean;
  packageSpec?: string;
  settingsPath?: string;
  scope?: "local" | "user" | "project";
  skipMcp?: boolean;
}

export interface ClaudeInstallResult {
  mcp: "added" | "skipped" | "failed";
  hook: "added" | "updated" | "unchanged" | "dry-run" | "skipped";
  settingsPath: string;
  messages: string[];
}

type Scope = NonNullable<InstallOptions["scope"]>;

const DEFAULT_PACKAGE = "whats-next-mcp@latest";
const DEFAULT_SCOPE: Scope = "user";

function isRecord(value: unknown): value is JsonObject {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * The settings file the Stop hook belongs in for each scope, following Claude
 * Code's conventions: User → ~/.claude/settings.json, Project →
 * .claude/settings.json, Local → .claude/settings.local.json. This keeps the
 * hook in the SAME scope as the MCP registration, so a `--scope project`
 * install doesn't silently enable the turn-end hook globally.
 */
export function settingsPathForScope(scope: Scope): string {
  switch (scope) {
    case "user":
      return join(homedir(), ".claude", "settings.json");
    case "project":
      return join(process.cwd(), ".claude", "settings.json");
    case "local":
      return join(process.cwd(), ".claude", "settings.local.json");
  }
}

function hookCommand(packageSpec = DEFAULT_PACKAGE): string {
  return `npx -y -p ${packageSpec} whats-next-hook`;
}

function mcpArgs(packageSpec = DEFAULT_PACKAGE, scope: Scope = DEFAULT_SCOPE): string[] {
  return ["mcp", "add", "--scope", scope, "whats-next", "--", "npx", "-y", packageSpec];
}

function looksLikeWhatsNextHook(command: string): boolean {
  return (
    command.includes("whats-next-hook") ||
    command.includes("whats-next-mcp/dist/hook.js") ||
    command.includes("whats-next-mcp\\dist\\hook.js")
  );
}

export function upsertClaudeStopHook(
  rawSettings: unknown,
  command = hookCommand()
): { settings: JsonObject; status: "added" | "updated" | "unchanged" } {
  const settings: JsonObject = isRecord(rawSettings) ? { ...rawSettings } : {};
  const hooks: JsonObject = isRecord(settings.hooks) ? { ...settings.hooks } : {};
  const stop = Array.isArray(hooks.Stop) ? [...hooks.Stop] : [];

  let status: "added" | "updated" | "unchanged" = "added";
  let found = false;

  const nextStop = stop.map((entry) => {
    if (!isRecord(entry) || !Array.isArray(entry.hooks)) return entry;

    const nextHooks = entry.hooks.map((hook) => {
      if (!isRecord(hook) || hook.type !== "command" || typeof hook.command !== "string") {
        return hook;
      }
      if (!looksLikeWhatsNextHook(hook.command)) return hook;

      found = true;
      if (hook.command === command) {
        status = status === "added" ? "unchanged" : status;
        return hook;
      }

      status = "updated";
      return { ...hook, command };
    });

    return { ...entry, hooks: nextHooks };
  });

  if (!found) {
    nextStop.push({
      hooks: [
        {
          type: "command",
          command,
        },
      ],
    });
  }

  hooks.Stop = nextStop;
  settings.hooks = hooks;

  return { settings, status };
}

/**
 * Parse settings-file content without throwing. Malformed JSON (or valid JSON
 * that isn't an object) is flagged rather than swallowed: unlike the read-only
 * hooks elsewhere, the installer WRITES the file back, so silently treating bad
 * JSON as `{}` would clobber a user's recoverable, hand-edited settings.
 */
export function parseSettingsContent(content: string): {
  value: JsonObject;
  malformed: boolean;
} {
  const trimmed = content.trim();
  if (!trimmed) return { value: {}, malformed: false };
  try {
    const parsed = JSON.parse(trimmed);
    if (!isRecord(parsed)) return { value: {}, malformed: true };
    return { value: parsed, malformed: false };
  } catch {
    return { value: {}, malformed: true };
  }
}

function readSettingsFile(path: string): {
  value: JsonObject;
  malformed: boolean;
} {
  if (!existsSync(path)) return { value: {}, malformed: false };
  return parseSettingsContent(readFileSync(path, "utf8"));
}

function writeJson(path: string, value: unknown): void {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, JSON.stringify(value, null, 2) + "\n");
}

function installMcpServer(options: { packageSpec: string; scope: Scope }) {
  const result = spawnSync("claude", mcpArgs(options.packageSpec, options.scope), {
    encoding: "utf8",
    stdio: "pipe",
  });

  if (result.error && "code" in result.error && result.error.code === "ENOENT") {
    return {
      status: "skipped" as const,
      message: "Claude Code CLI was not found, so MCP registration was skipped.",
    };
  }

  if (result.status === 0) {
    return {
      status: "added" as const,
      message: "Registered the whats-next MCP server in Claude Code.",
    };
  }

  const output = `${result.stderr || ""}${result.stdout || ""}`.trim();
  return {
    status: "failed" as const,
    message:
      "Claude MCP registration failed. Run this manually if needed: " +
      `claude ${mcpArgs(options.packageSpec, options.scope).join(" ")}` +
      (output ? `\n${output}` : ""),
  };
}

/**
 * Best-effort check for an existing `whats-next` MCP entry before we add one.
 * The old README registered the server at Claude Code's default (local) scope,
 * which OUTRANKS a user-scope install — so a user upgrading would otherwise keep
 * launching the stale local server. We can't reliably parse per-scope precedence
 * from `claude mcp list`, so we just detect prior existence and warn. Returns
 * false on any error (CLI missing, non-zero exit), i.e. never blocks the install.
 */
function hasExistingWhatsNextMcp(): boolean {
  const result = spawnSync("claude", ["mcp", "list"], {
    encoding: "utf8",
    stdio: "pipe",
  });
  if (result.error || result.status !== 0 || typeof result.stdout !== "string") {
    return false;
  }
  return /whats-next\b/.test(result.stdout);
}

export function installClaude(options: InstallOptions = {}): ClaudeInstallResult {
  const packageSpec = options.packageSpec ?? DEFAULT_PACKAGE;
  const scope = options.scope ?? DEFAULT_SCOPE;
  const settingsPath = options.settingsPath ?? settingsPathForScope(scope);
  const messages: string[] = [];

  let mcp: ClaudeInstallResult["mcp"] = "skipped";
  if (options.dryRun) {
    messages.push(`Would run: claude ${mcpArgs(packageSpec, scope).join(" ")}`);
  } else if (options.skipMcp) {
    messages.push("Skipped MCP registration.");
  } else {
    const preexisting = hasExistingWhatsNextMcp();
    const result = installMcpServer({ packageSpec, scope });
    mcp = result.status;
    messages.push(result.message);
    if (preexisting && result.status === "added") {
      messages.push(
        "Note: a 'whats-next' MCP entry already existed. If it was added at a " +
          "higher-precedence scope (local/project outranks user), Claude may " +
          "still launch the old one — inspect with `claude mcp list` and remove " +
          "stale entries with `claude mcp remove whats-next`."
      );
    }
  }

  const command = hookCommand(packageSpec);
  const { value: current, malformed } = readSettingsFile(settingsPath);

  // Don't overwrite a settings file we couldn't parse — that would destroy the
  // user's (recoverable) config. Tell them how to proceed instead.
  if (malformed) {
    messages.push(
      `Skipped the Stop hook: ${settingsPath} is not valid JSON. Fix it (or ` +
        `pass --settings <path>) and re-run, or add the hook manually:\n  ${command}`
    );
    return { mcp, hook: "skipped", settingsPath, messages };
  }

  const { settings, status } = upsertClaudeStopHook(current, command);

  if (options.dryRun) {
    messages.push(`Would add/update Claude Stop hook in ${settingsPath}: ${command}`);
    return { mcp, hook: "dry-run", settingsPath, messages };
  }

  // Nothing to change — don't rewrite the file (avoids reformatting it and
  // bumping its mtime for a no-op).
  if (status === "unchanged") {
    messages.push(`Claude Stop hook already present in ${settingsPath}.`);
    return { mcp, hook: status, settingsPath, messages };
  }

  writeJson(settingsPath, settings);
  messages.push(`${status === "updated" ? "Updated" : "Added"} Claude Stop hook in ${settingsPath}.`);

  return { mcp, hook: status, settingsPath, messages };
}

function usage(): string {
  return [
    "Usage:",
    "  whats-next-mcp install claude [options]",
    "",
    "Options:",
    "  --scope user|local|project   Install scope; also picks the hook settings",
    "                               file. local/project use ./.claude/ in the cwd",
    "                               (default: user).",
    "  --settings <path>            Override the hook settings file path.",
    "  --package <spec>             npm spec to install (default: whats-next-mcp@latest).",
    "  --skip-mcp                   Only add the hook; skip `claude mcp add`.",
    "  --dry-run                    Print what would change without writing.",
    "",
    "Examples:",
    "  npx -y whats-next-mcp@latest install claude",
    "  npx -y whats-next-mcp@latest install claude --dry-run",
    "  npx -y whats-next-mcp@latest install claude --scope project",
  ].join("\n");
}

function readOption(args: string[], name: string): string | undefined {
  const i = args.indexOf(name);
  if (i < 0) return undefined;
  const value = args[i + 1];
  return value && !value.startsWith("--") ? value : undefined;
}

export function runInstallCli(args: string[] = process.argv.slice(2)): void {
  // Accept --help/-h anywhere (e.g. `install --help`), not just as the first arg.
  if (args.includes("--help") || args.includes("-h")) {
    process.stdout.write(usage() + "\n");
    return;
  }

  const command = args[0];
  if (!command) {
    process.stdout.write(usage() + "\n");
    return;
  }

  if (command !== "install") {
    throw new Error(`Unknown command: ${command}\n\n${usage()}`);
  }

  const target = args[1] ?? "claude";
  if (target !== "claude") {
    throw new Error(`Unknown install target: ${target}\n\n${usage()}`);
  }

  const scope = readOption(args, "--scope");
  if (scope && scope !== "local" && scope !== "user" && scope !== "project") {
    throw new Error(`Invalid --scope value: ${scope}`);
  }

  const result = installClaude({
    dryRun: args.includes("--dry-run"),
    packageSpec: readOption(args, "--package") ?? DEFAULT_PACKAGE,
    settingsPath: readOption(args, "--settings"),
    scope: (scope as InstallOptions["scope"]) ?? DEFAULT_SCOPE,
    skipMcp: args.includes("--skip-mcp"),
  });

  process.stdout.write(result.messages.join("\n") + "\n");
  process.stdout.write("Done. Restart Claude Code if it was already running.\n");
}
