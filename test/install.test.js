import { test } from "node:test";
import assert from "node:assert/strict";

import { upsertClaudeStopHook } from "../dist/install.js";

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
