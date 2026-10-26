import { describe, expect, it, mock } from "bun:test";
import { FactoryState, type Move } from "@shiptorio/shared";
import { starterLine } from "../src/engine";

mock.module("cloudflare:workers", () => ({ DurableObject: class {
  ctx: unknown; env: unknown;
  constructor(ctx: unknown, env: unknown) { this.ctx = ctx; this.env = env; }
} }));
const { Factory } = await import("../src/factory");

const plan: Move = { id: "plan-6", title: "Plan #6: Docs", why: "Get a plan first.", stage: "build", kind: "build", itemId: "gh-6", createdAt: 1,
  options: [{ id: "codex", label: "Plan with Codex", recommended: true, actions: [{ tool: "plan_runner_job", args: {}, reason: "plan" }] }, { id: "decline", label: "Later", recommended: false, actions: [] }] };

describe("applying the game master's call", () => {
  it("won't let a do-nothing pick replace a real next step, or show the why line for it", () => {
    const f = new Factory({ storage: {} } as never, {} as never) as unknown as { state: FactoryState; gm: unknown; applyGameMaster(d: Move[]): Move[] };
    f.state = FactoryState.parse({ repo: "r3dbars/testing", baseBranch: "main", districts: [], ...starterLine(), items: [], science: { red: 0, green: 0, grey: 0, blue: 0 }, trust: 0.5, tick: 0 });
    const key = JSON.stringify([undefined, undefined, ["plan-6"]]);
    f.gm = { key, call: { order: ["plan-6"], picks: { "plan-6": "decline" }, because: { "plan-6": "Docs can wait." }, reason: "x" } };
    const [m] = f.applyGameMaster([plan]);
    expect(m.options.find(o => o.recommended)?.id).toBe("codex");
    expect(m.because).toBeUndefined();
  });
});
