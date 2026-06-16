import { test } from "node:test";
import assert from "node:assert/strict";

import { buildPickerInstruction } from "../dist/engine.js";
import { normalizeCount } from "../dist/scaffold.js";

const s = (action, extra = {}) => ({
  action,
  why: "why",
  effort: "S",
  startHere: "start",
  ...extra,
});

test("normalizeCount clamps into 3..8 and defaults to 5", () => {
  assert.equal(normalizeCount(undefined), 5);
  assert.equal(normalizeCount(0), 5);
  assert.equal(normalizeCount(1), 3);
  assert.equal(normalizeCount(99), 8);
  assert.equal(normalizeCount(4.9), 4);
  assert.equal(normalizeCount(NaN), 5);
});

test("picker dedupes by action and caps at 4 options", () => {
  const seeds = [s("A"), s("a"), s("B"), s("C"), s("D"), s("E")];
  const out = buildPickerInstruction(seeds);
  // "A" and "a" collapse; cap at 4 -> options A,B,C,D, not E.
  assert.match(out, /1\. label: "A"/);
  assert.match(out, /4\. label: "D"/);
  assert.doesNotMatch(out, /label: "E"/);
});

test("picker escapes embedded quotes so LLM output can't break the format", () => {
  const out = buildPickerInstruction([s('Say "hi"', { why: 'a "quoted" why' })]);
  assert.match(out, /label: "Say \\"hi\\""/);
  assert.doesNotMatch(out, /label: "Say "hi""/);
});

test("default picker recurs via the hook (no suggest_next instruction)", () => {
  const out = buildPickerInstruction([s("A")]);
  assert.match(out, /recurs each turn/i);
  assert.doesNotMatch(out, /suggest_next/);
});

test("recurseViaTool picker tells the model to call suggest_next again", () => {
  const out = buildPickerInstruction([s("A")], { recurseViaTool: true });
  assert.match(out, /call the `suggest_next` tool again/);
});

test("omits the Start clause when there is no startHere", () => {
  const out = buildPickerInstruction([s("A", { startHere: "" })]);
  assert.doesNotMatch(out, /Start:/);
});
