import { test } from "node:test";
import assert from "node:assert/strict";

import { contentHasPendingBackgroundTask } from "../dist/transcript.js";

/** An async-agent launch entry: structured ack carries the agentId. */
function asyncLaunch(agentId) {
  return JSON.stringify({
    type: "user",
    toolUseResult: { isAsync: true, status: "async_launched", agentId },
    message: {
      role: "user",
      content: [
        {
          type: "tool_result",
          tool_use_id: "toolu_" + agentId,
          content: `Async agent launched successfully.\nagentId: ${agentId}`,
        },
      ],
    },
  });
}

/**
 * A backgrounded Workflow = a Workflow tool_use followed by its tool_result ack
 * carrying a "Task ID:". Returns the two JSONL lines.
 */
function workflowLaunch(taskId, useId = "toolu_wf") {
  const use = JSON.stringify({
    type: "assistant",
    message: {
      role: "assistant",
      content: [{ type: "tool_use", id: useId, name: "Workflow", input: {} }],
    },
  });
  const res = JSON.stringify({
    type: "user",
    message: {
      role: "user",
      content: [
        {
          type: "tool_result",
          tool_use_id: useId,
          content: `Workflow launched in background. Task ID: ${taskId}\nSummary: stuff`,
        },
      ],
    },
  });
  return use + "\n" + res;
}

/** A Bash tool_result that merely prints "Task ID: …" (the poisoning case). */
function bashPrints(taskId, useId = "toolu_bash") {
  const use = JSON.stringify({
    type: "assistant",
    message: {
      role: "assistant",
      content: [{ type: "tool_use", id: useId, name: "Bash", input: {} }],
    },
  });
  const res = JSON.stringify({
    type: "user",
    message: {
      role: "user",
      content: [
        {
          type: "tool_result",
          tool_use_id: useId,
          content: `Workflow launched in background. Task ID: ${taskId}\n<task-id>${taskId}</task-id>`,
        },
      ],
    },
  });
  return use + "\n" + res;
}

/** The completion notification the host injects when a background task finishes. */
function taskNotification(taskId) {
  return JSON.stringify({
    type: "user",
    message: {
      role: "user",
      content: `<task-notification>\n<task-id>${taskId}</task-id>\n<output>done</output>\n</task-notification>`,
    },
  });
}

const assistantText = (t) =>
  JSON.stringify({ type: "assistant", message: { role: "assistant", content: [{ type: "text", text: t }] } });

test("no background tools → nothing pending", () => {
  const t = [assistantText("hello"), assistantText("done")].join("\n");
  assert.equal(contentHasPendingBackgroundTask(t), false);
});

test("async agent launched with no notification → pending", () => {
  const t = [assistantText("scanning"), asyncLaunch("abc123")].join("\n");
  assert.equal(contentHasPendingBackgroundTask(t), true);
});

test("async agent launched then notified → not pending", () => {
  const t = [
    asyncLaunch("abc123"),
    assistantText("waiting"),
    taskNotification("abc123"),
    assistantText("got results"),
  ].join("\n");
  assert.equal(contentHasPendingBackgroundTask(t), false);
});

test("backgrounded workflow with no notification → pending", () => {
  const t = [assistantText("reviewing"), workflowLaunch("w7nybqgcf")].join("\n");
  assert.equal(contentHasPendingBackgroundTask(t), true);
});

test("backgrounded workflow then notified → not pending", () => {
  const t = [workflowLaunch("w7nybqgcf"), taskNotification("w7nybqgcf")].join("\n");
  assert.equal(contentHasPendingBackgroundTask(t), false);
});

test("one task done but another still cooking → pending", () => {
  const t = [
    asyncLaunch("done1"),
    taskNotification("done1"),
    workflowLaunch("cooking2"),
  ].join("\n");
  assert.equal(contentHasPendingBackgroundTask(t), true);
});

test("a Bash result that merely prints 'Task ID:' is NOT a launch (no false suppress)", () => {
  const t = [assistantText("debugging"), bashPrints("w7nybqgcf")].join("\n");
  assert.equal(contentHasPendingBackgroundTask(t), false);
});

test("a stale launch beyond the tail window does not suppress forever", () => {
  const filler = Array.from({ length: 450 }, (_, i) => assistantText(`step ${i}`));
  const t = [asyncLaunch("old"), ...filler].join("\n");
  assert.equal(contentHasPendingBackgroundTask(t), false);
});

test("malformed lines are skipped without throwing", () => {
  const t = ["{ not json", asyncLaunch("abc123")].join("\n");
  assert.equal(contentHasPendingBackgroundTask(t), true);
});
