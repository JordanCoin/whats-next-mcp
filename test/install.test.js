import { test } from "node:test";
import assert from "node:assert/strict";
import { homedir, tmpdir } from "node:os";
import { join, sep } from "node:path";
import { mkdtempSync, writeFileSync, readFileSync } from "node:fs";

import {
  upsertClaudeStopHook,
  settingsPathForScope,
  parseSettingsContent,
  installClaude,
} from "../dist/install.js";

test("adds the Claude Stop hook to empty settings", () => {
  const { settings, status } = upsertClaudeStopHook({}, "whats-next-hook");

  assert.equal(status, "added");
  assert.deepEqual(settings, {
    hooks: {
      Stop: [
        {
          hooks: [
            {
              type: "command",
              command: "whats-next-hook",
            },
          ],
        },
      ],
    },
  });
});

test("preserves unrelated Claude hooks", () => {
  const existing = {
    hooks: {
      Stop: [
        {
          matcher: "*",
          hooks: [{ type: "command", command: "echo already-here" }],
        },
      ],
    },
  };

  const { settings, status } = upsertClaudeStopHook(existing, "whats-next-hook");
  const stop = settings.hooks.Stop;

  assert.equal(status, "added");
  assert.equal(stop.length, 2);
  assert.deepEqual(stop[0], existing.hooks.Stop[0]);
});

test("updates an existing whats-next hook instead of duplicating it", () => {
  const existing = {
    hooks: {
      Stop: [
        {
          hooks: [
            {
              type: "command",
              command: "node /tmp/whats-next-mcp/dist/hook.js",
            },
          ],
        },
      ],
    },
  };

  const { settings, status } = upsertClaudeStopHook(existing, "npx -y -p whats-next-mcp@latest whats-next-hook");
  const stop = settings.hooks.Stop;

  assert.equal(status, "updated");
  assert.equal(stop.length, 1);
  assert.equal(stop[0].hooks[0].command, "npx -y -p whats-next-mcp@latest whats-next-hook");
});

test("leaves an identical whats-next hook unchanged", () => {
  const existing = {
    hooks: {
      Stop: [
        {
          hooks: [
            {
              type: "command",
              command: "npx -y -p whats-next-mcp@latest whats-next-hook",
            },
          ],
        },
      ],
    },
  };

  const { settings, status } = upsertClaudeStopHook(existing, "npx -y -p whats-next-mcp@latest whats-next-hook");

  assert.equal(status, "unchanged");
  assert.deepEqual(settings, existing);
});

test("settingsPathForScope maps each scope to the right file", () => {
  assert.equal(
    settingsPathForScope("user"),
    join(homedir(), ".claude", "settings.json")
  );
  assert.equal(
    settingsPathForScope("project"),
    join(process.cwd(), ".claude", "settings.json")
  );
  assert.equal(
    settingsPathForScope("local"),
    join(process.cwd(), ".claude", "settings.local.json")
  );
  // project/local stay in the working tree, not the home dir.
  assert.ok(!settingsPathForScope("project").startsWith(homedir() + sep + ".claude"));
});

test("parseSettingsContent flags malformed JSON without throwing", () => {
  assert.deepEqual(parseSettingsContent("{ not json"), { value: {}, malformed: true });
  assert.deepEqual(parseSettingsContent("[]"), { value: {}, malformed: true }); // not an object
  assert.deepEqual(parseSettingsContent('"a string"'), { value: {}, malformed: true });
});

test("parseSettingsContent accepts empty and valid object content", () => {
  assert.deepEqual(parseSettingsContent(""), { value: {}, malformed: false });
  assert.deepEqual(parseSettingsContent("   \n"), { value: {}, malformed: false });
  assert.deepEqual(parseSettingsContent('{"hooks":{}}'), {
    value: { hooks: {} },
    malformed: false,
  });
});

test("installClaude leaves the settings file untouched when the hook is unchanged", () => {
  const dir = mkdtempSync(join(tmpdir(), "wn-install-"));
  const path = join(dir, "settings.json");
  // Seed with the hook already present, but with different formatting (extra
  // whitespace) so a needless rewrite would be detectable.
  const command = "npx -y -p whats-next-mcp@latest whats-next-hook";
  const seeded = upsertClaudeStopHook({}, command).settings;
  const original = JSON.stringify(seeded, null, 4) + "\n\n";
  writeFileSync(path, original);

  const result = installClaude({ skipMcp: true, settingsPath: path });

  assert.equal(result.hook, "unchanged");
  // Byte-for-byte identical — not reformatted.
  assert.equal(readFileSync(path, "utf8"), original);
});
