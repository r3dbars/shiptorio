import { describe, expect, it } from "bun:test";
import type { Move } from "@shiptorio/shared";
import { allowedTap } from "../src/autopilot";
import { reworkMove } from "../src/gauntlet";

const card = (tool: string, args: Record<string, unknown> = {}, extra: Partial<Move> = {}): Move => ({
  id: "m1", title: "t", why: "w", createdAt: 0, ...extra,
  options: [{ id: "go", label: "Go", recommended: true, actions: [{ tool, args, reason: "r" }] }, { id: "later", label: "Later", recommended: false, actions: [] }],
});

describe("autopilot allowlist", () => {
  it("taps plan, approve, launch and permit cards", () => {
    for (const c of [card("plan_runner_job", { harness: "codex" }), card("approve_runner_job", { jobId: "j" }), card("request_merge", { pr: 3 }), card("set_autonomy", { district: "docs", permit: true })])
      expect(allowedTap(c)).toEqual({ optionId: "go", why: expect.any(String) });
  });
  it("never launches a locked card or overrules a failed station", () => {
    expect(allowedTap(card("request_merge", { pr: 3 }, { locked: true }))).toHaveProperty("skip");
    expect(allowedTap(card("request_merge", { pr: 3, overrule: true }))).toHaveProperty("skip");
  });
  it("leaves research, sources, dismissals and permit revokes to the human", () => {
    for (const c of [card("research", { tech: "lint" }), card("connect_source", { kind: "claude" }), card("set_autonomy", { district: "docs", permit: false })])
      expect(allowedTap(c)).toHaveProperty("skip");
  });
  it("sends a scarred PR back to the rework belt, not overrule", () => {
    const move = reworkMove({ id: "gh-1", title: "x", prNumber: 4, scars: [{ station: "verify", strike: 1 }] } as any);
    expect(allowedTap(move)).toEqual({ optionId: "rework-codex", why: "plan_runner_job" });
  });
});
