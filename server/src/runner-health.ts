import type { Move } from "../../shared/src/model";
import type { RunnerJob } from "./runner-job";
export type AuthHarness = Extract<RunnerJob["harness"], "codex" | "claude_code" | "muse_code">;
export const AUTH_HARNESSES: readonly AuthHarness[] = ["codex", "claude_code", "muse_code"];
export function runnerAuthMove(h: AuthHarness, now = Date.now()): Move {
  const label = h === "codex" ? "Codex" : h === "muse_code" ? "Muse Code" : "Claude Code";
  const command = `shiptorio-runner login ${h === "codex" ? "codex" : h === "muse_code" ? "muse" : "claude"}`;
  return { id: `runner-auth:${h}`, title: `Sign in to ${label} again`,
    why: `Your local ${label} sign-in is unavailable or expired. On your computer run ${command}. Approved builds stay saved while their lease is valid.`,
    stage: "resources", kind: "unblock", focus: `power-${h}`, createdAt: now,
    plan: [command, "Keep the runner watching. This card clears after it detects your restored sign-in."],
    options: [{ id: "later", label: "I'll sign in on my computer", recommended: true, actions: [] }] };
}
