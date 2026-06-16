# Agent operating rule: never leave a dead end

This rule makes the "what's next" behavior work in any agent that reads an
instructions file, even one without a turn-end hook. It is the portable, soft
tier of `whats-next-mcp` — drop it into whatever rules file your host reads
(`AGENTS.md`, `CLAUDE.md`, `.cursor/rules/`, `GEMINI.md`, opencode instructions).

> **Claude Code note:** Claude Code reads `CLAUDE.md`, not `AGENTS.md`, by
> design. To use this file there, add a one-line import to your `CLAUDE.md`:
>
> ```markdown
> @AGENTS.md
> ```
>
> (or `ln -s AGENTS.md CLAUDE.md`). Cursor, opencode, and gstack read
> `AGENTS.md` natively, so no import is needed there.

---

## Rule

At the **end of every turn** — after you finish a step, or any time you would
otherwise stop, go quiet, or ask the user an open-ended "what now?" — you MUST
leave the user with concrete next steps. Never end a turn with no suggested
direction.

**Always present the next steps as an INTERACTIVE PICKER, not plain text.** Call
your multiple-choice / question tool (in Claude Code: `AskUserQuestion`; in
other hosts: the equivalent interactive prompt) so the user gets selectable
options inline. This is the whole point — never just print "pick a number".

**Getting the options:** if the `suggest_next` MCP tool is available, call it
(passing the current `goal` and a short `recent` summary) to generate them.
Otherwise produce 3–5 distinct steps yourself, ranked by impact, each with an
action (the option label) and a why + where-to-start (the option description).
Include at least one low-effort move.

Then call the picker with question "What should we do next?", header "Next
step", and one option per suggestion. The user can pick the auto-added "Other"
choice to type their own, or say "done".

When the user picks one, carry it out — then repeat this rule, so a fresh
interactive prompt is always available.

---

## Optional: prefer installed workflow skills as the options

If the host has a catalog of workflow skills or slash-commands available (for
example a [gstack](https://github.com/garrytan/gstack) install exposing
`/spec`, `/qa`, `/review`, `/ship`, `/land-and-deploy`, `/health`, `/retro`,
and friends), **prefer those as the picker's options** instead of generic
advice. The picker is the engine; the skills are the payload — a curated next
move beats "run the tests".

Map the current state to the right skill:

| Recent state | Suggested option |
|--------------|------------------|
| Vague or unstated goal | `/spec` — turn intent into an executable spec |
| Code written, untested | `/qa` — exercise it and fix what breaks |
| Tests/build failing | `/qa` or your debug skill — reproduce and isolate first |
| Diff ready to land | `/review`, then `/ship` or `/land-and-deploy` |
| Just shipped | `/retro`, `/health`, or a canary/monitor skill |

Rules of thumb: only offer skills that are actually installed; keep one
low-effort option; and still include a plain "Other / something else" path so
the user is never boxed into the catalog. When no skill fits the moment, fall
back to concrete hand-written steps as above. The skill arc
(spec → build → qa → review → ship → retro) is also a safety net — it stops you
trailing off *between* phases, e.g. after "ship" without offering "retro".
