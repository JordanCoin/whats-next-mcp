import type { Plugin } from "@opencode-ai/plugin";

/**
 * opencode turn-end backstop.
 *
 * IMPORTANT LIMITATION: opencode plugin events are OBSERVE-ONLY. Unlike Claude
 * Code's Stop hook or Cursor's `stop` hook, a plugin CANNOT force the model to
 * call a tool or re-enter the loop. So opencode's primary "what's next" path is
 * the universal layer: the `suggest_next` MCP tool plus the AGENTS.md rule
 * (opencode reads AGENTS.md natively), which together make the model raise an
 * interactive question itself.
 *
 * This plugin is only a hard backstop: when the session goes idle it fires a
 * desktop notification so the user is signalled even if the model stayed quiet.
 * The full ranked options come through the MCP tool / AGENTS.md, not here.
 */
export const WhatsNext: Plugin = async ({ $ }) => {
  const CLI = process.env.WHATS_NEXT_CLI ?? "whats-next";
  return {
    event: async ({ event }: { event: { type: string } }) => {
      if (event.type !== "session.idle") return;
      // Pull the top deterministic step from the shared CLI (offline, fast).
      const text = await $`${CLI} --json`.text().catch(() => "");
      let top = "Next steps are ready — ask me what's next.";
      try {
        const first = JSON.parse(text)[0];
        if (first?.action) top = first.action;
      } catch {
        /* keep the default */
      }
      // macOS notification (swap for `notify-send` on Linux).
      const script = `display notification ${JSON.stringify(top)} with title "what's next"`;
      await $`osascript -e ${script}`.catch(() => {});
    },
  };
};
