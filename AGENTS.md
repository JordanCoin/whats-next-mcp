# Agent operating rule: never leave a dead end

This rule makes the "what's next" behavior work in any agent that reads an
instructions file, even one without a turn-end hook. It is the portable, soft
tier of `whats-next-mcp` — drop it into whatever rules file your host reads
(`AGENTS.md`, `CLAUDE.md`, `.cursor/rules/`, `GEMINI.md`, opencode instructions).

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
