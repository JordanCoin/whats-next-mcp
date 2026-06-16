import { test } from "node:test";
import assert from "node:assert/strict";

import { fallbackSuggestions, BASE_SEEDS } from "../dist/fallback.js";

test("always returns a non-empty list — the core guarantee", () => {
  for (const input of [
    {},
    { goal: "" },
    { recent: "" },
    { goal: "ship", recent: "did stuff" },
  ]) {
    const seeds = fallbackSuggestions(input);
    assert.ok(Array.isArray(seeds) && seeds.length > 0, JSON.stringify(input));
    for (const s of seeds) {
      assert.equal(typeof s.action, "string");
      assert.ok(s.action.length > 0);
      assert.ok(["S", "M", "L"].includes(s.effort));
    }
  }
});

test("no goal -> urgent goal-stating step, and never two goal items", () => {
  const seeds = fallbackSuggestions({});
  assert.match(seeds[0].action, /state the immediate goal/i);
  const stating = seeds.filter((s) => /\b(state|clarify) the immediate goal/i.test(s.action));
  assert.equal(stating.length, 1);
});

test("with a goal -> keeps the gentler clarify-goal seed", () => {
  const seeds = fallbackSuggestions({ goal: "ship the parser" });
  assert.match(seeds[0].action, /clarify the immediate goal/i);
});

test("failure words lead with debugging", () => {
  const seeds = fallbackSuggestions({ recent: "the build is failing" });
  assert.match(seeds[0].action, /reproduce and isolate the failure/i);
});

test("negation suppresses the false-positive debugging lead", () => {
  for (const recent of ["no errors", "zero failures", "fixed the bug", "all green now"]) {
    const seeds = fallbackSuggestions({ recent });
    assert.doesNotMatch(seeds[0].action, /reproduce and isolate/i, recent);
  }
});

test("passing words append a commit checkpoint", () => {
  const seeds = fallbackSuggestions({ recent: "all tests passing" });
  assert.ok(seeds.some((s) => /commit the working state/i.test(s.action)));
});

test("BASE_SEEDS are stable and well-formed", () => {
  assert.equal(BASE_SEEDS.length, 3);
});
