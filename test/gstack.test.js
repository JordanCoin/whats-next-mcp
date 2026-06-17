import { test } from "node:test";
import assert from "node:assert/strict";

import { gstackSuggestions, gstackEnabled } from "../dist/gstack.js";
import { seedSuggestions } from "../dist/engine.js";

function actions(seeds) {
  return seeds.map((s) => s.action.toLowerCase());
}

test("gstackEnabled reflects WHATS_NEXT_GSTACK", () => {
  const prev = process.env.WHATS_NEXT_GSTACK;
  try {
    delete process.env.WHATS_NEXT_GSTACK;
    assert.equal(gstackEnabled(), false);
    process.env.WHATS_NEXT_GSTACK = "1";
    assert.equal(gstackEnabled(), true);
    process.env.WHATS_NEXT_GSTACK = "0";
    assert.equal(gstackEnabled(), false);
    process.env.WHATS_NEXT_GSTACK = "false";
    assert.equal(gstackEnabled(), false);
  } finally {
    if (prev === undefined) delete process.env.WHATS_NEXT_GSTACK;
    else process.env.WHATS_NEXT_GSTACK = prev;
  }
});

test("gstack suggestions are always non-empty and well-formed", () => {
  for (const input of [{}, { goal: "ship" }, { recent: "tests pass" }]) {
    const seeds = gstackSuggestions(input);
    assert.ok(seeds.length > 0);
    for (const s of seeds) {
      assert.ok(s.action.length > 0);
      assert.ok(["S", "M", "L"].includes(s.effort));
      assert.match(s.startHere, /Run \//); // points at a slash-command
    }
  }
});

test("no goal -> offers /spec", () => {
  const a = actions(gstackSuggestions({}));
  assert.ok(a.some((x) => x.includes("/spec")));
});

test("failing state -> leads with a /qa fix", () => {
  const seeds = gstackSuggestions({ recent: "the build is failing" });
  assert.match(seeds[0].action, /\/qa/);
  assert.match(seeds[0].action.toLowerCase(), /fix/);
});

test("green state -> offers /ship and /retro", () => {
  const a = actions(gstackSuggestions({ recent: "all tests passing, shipped" }));
  assert.ok(a.some((x) => x.includes("/ship")));
  assert.ok(a.some((x) => x.includes("/retro")));
});

test("core build moves (/qa, /review) are always present", () => {
  const a = actions(gstackSuggestions({ goal: "x", recent: "building" }));
  assert.ok(a.some((x) => x.includes("/qa")));
  assert.ok(a.some((x) => x.includes("/review")));
});

test("no duplicate actions", () => {
  const a = actions(gstackSuggestions({ recent: "failing build" }));
  assert.equal(new Set(a).size, a.length);
});

// Regression: gstack failing-state offered /qa twice — once as the "reproduce
// and fix" lead, once as the core "QA the change" move (different labels, same
// command). Found by /qa on 2026-06-17. Dedup must key on the slash-command.
test("no duplicate slash-commands (failing state offered /qa twice)", () => {
  for (const recent of ["build failing", "tests passing shipped", ""]) {
    const cmds = gstackSuggestions({ recent })
      .map((s) => s.startHere.match(/\/[\w-]+/)?.[0])
      .filter(Boolean);
    assert.equal(new Set(cmds).size, cmds.length, `dup command for recent="${recent}"`);
  }
});

test("seedSuggestions switches sources with WHATS_NEXT_GSTACK", () => {
  const prev = process.env.WHATS_NEXT_GSTACK;
  try {
    delete process.env.WHATS_NEXT_GSTACK;
    const generic = seedSuggestions({});
    // Generic seeds don't point at slash-commands.
    assert.ok(!generic.some((s) => /Run \//.test(s.startHere)));

    process.env.WHATS_NEXT_GSTACK = "1";
    const gstack = seedSuggestions({});
    assert.ok(gstack.some((s) => /Run \/spec/.test(s.startHere)));
  } finally {
    if (prev === undefined) delete process.env.WHATS_NEXT_GSTACK;
    else process.env.WHATS_NEXT_GSTACK = prev;
  }
});
