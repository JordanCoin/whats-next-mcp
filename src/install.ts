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
  hook: "added" | "updated" | "unchanged" | "dry-run";
  settingsPath: string;
  messages: string[];
}

type Scope = NonNullable<InstallOptions["scope"]>;

const DEFAULT_PACKAGE = "whats-next-mcp@latest";
const DEFAULT_SCOPE: Scope = "user";

function isRecord(value: unknown): value is JsonObject {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function defaultClaudeSettingsPath(): string {
  return join(homedir(), ".claude", "settings.json");
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

function readJson(path: string): unknown {
  if (!existsSync(path)) return {};
  return JSON.parse(readFileSync(path, "utf8"));
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

export function installClaude(options: InstallOptions = {}): ClaudeInstallResult {
  const packageSpec = options.packageSpec ?? DEFAULT_PACKAGE;
  const scope = options.scope ?? DEFAULT_SCOPE;
  const settingsPath = options.settingsPath ?? defaultClaudeSettingsPath();
  const messages: string[] = [];

  let mcp: ClaudeInstallResult["mcp"] = "skipped";
  if (options.dryRun) {
    messages.push(`Would run: claude ${mcpArgs(packageSpec, scope).join(" ")}`);
  } else if (options.skipMcp) {
    messages.push("Skipped MCP registration.");
  } else {
    const result = installMcpServer({ packageSpec, scope });
    mcp = result.status;
    messages.push(result.message);
  }

  const command = hookCommand(packageSpec);
  const current = readJson(settingsPath);
  const { settings, status } = upsertClaudeStopHook(current, command);

  if (options.dryRun) {
    messages.push(`Would add/update Claude Stop hook in ${settingsPath}: ${command}`);
    return { mcp, hook: "dry-run", settingsPath, messages };
  }

  writeJson(settingsPath, settings);
  messages.push(`${status === "unchanged" ? "Kept" : status === "updated" ? "Updated" : "Added"} Claude Stop hook in ${settingsPath}.`);

  return { mcp, hook: status, settingsPath, messages };
}

function usage(): string {
  return [
    "Usage:",
    "  whats-next-mcp install claude [--scope user|local|project] [--dry-run]",
    "",
    "Examples:",
    "  npx -y whats-next-mcp@latest install claude",
    "  npx -y whats-next-mcp@latest install claude --dry-run",
  ].join("\n");
}

function readOption(args: string[], name: string): string | undefined {
  const i = args.indexOf(name);
  if (i < 0) return undefined;
  const value = args[i + 1];
  return value && !value.startsWith("--") ? value : undefined;
}

export function runInstallCli(args: string[] = process.argv.slice(2)): void {
  const command = args[0];
  if (!command || command === "--help" || command === "-h") {
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
