import { test } from "node:test";
import assert from "node:assert/strict";

import { parseSuggestions } from "../dist/llm.js";

const VALID = JSON.stringify([
  { action: "Do a thing", why: "because", effort: "S", startHere: "here" },
]);

test("parses a clean JSON array", () => {
  const out = parseSuggestions(VALID);
  assert.equal(out.length, 1);
  assert.equal(out[0].action, "Do a thing");
});

test("tolerates ```json fences```", () => {
  const out = parseSuggestions("```json\n" + VALID + "\n```");
  assert.equal(out.length, 1);
});

test("tolerates prose with brackets before the array", () => {
  const out = parseSuggestions("Here are the steps [ranked]:\n" + VALID);
  assert.equal(out.length, 1);
  assert.equal(out[0].action, "Do a thing");
});

test("fills defaults and clamps a bad effort to M", () => {
  const out = parseSuggestions('[{"action":"X","effort":"Z"}]');
  assert.equal(out[0].why, "");
  assert.equal(out[0].startHere, "");
  assert.equal(out[0].effort, "M");
});

test("drops items without a string action", () => {
  const out = parseSuggestions('[{"why":"no action"},{"action":"keep"}]');
  assert.equal(out.length, 1);
  assert.equal(out[0].action, "keep");
});

test("returns null on garbage, empty array, or no array", () => {
  assert.equal(parseSuggestions("not json at all"), null);
  assert.equal(parseSuggestions("[]"), null);
  assert.equal(parseSuggestions('{"action":"obj not array"}'), null);
});
