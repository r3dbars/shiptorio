import { describe, expect, it, mock } from "bun:test";
import { FactoryState, type Item } from "@shiptorio/shared";
import { starterLine } from "../src/engine";
import { freshInspection, liveStations, migrateGauntlet, nextGate, parseVerdict, setStage, verifyFromDiff } from "../src/gauntlet";

mock.module("cloudflare:workers", () => ({ DurableObject: class {
  ctx: unknown; env: unknown;
  constructor(ctx: unknown, env: unknown) { this.ctx = ctx; this.env = env; }
} }));
const { Factory } = await import("../src/factory");

const head = "b".repeat(40);
const pr = (overrides: Partial<Item> = {}): Item => ({ id: "gh-1", kind: "bug", source: "github_issue", title: "Fix checkout", district: "/", state: "inspecting", attempts: 1, prNumber: 99, prUrl: "https://github.com/r3dbars/demo/pull/99", branch: "shiptorio/runner-1", machineId: "ci-1", inspection: freshInspection(head), updatedAt: 1, ...overrides });
const base = () => FactoryState.parse({ repo: "r3dbars/demo", baseBranch: "main", districts: [], ...starterLine(), items: [], science: { red: 0, green: 0, grey: 0, blue: 0 }, trust: 0.5, tick: 0 });

describe("gauntlet rules", () => {
  it("walks CI → verify → AI review → pad, moving the item station to station", () => {
    let item = setStage(pr(), "ci", "passed", "green");
    expect(item.machineId).toBe("verify-1");
    expect(nextGate(item)).toBe("verify");
    item = setStage(item, "verify", "passed", "test added");
    expect(nextGate(item)).toBe("ai");
    item = setStage(item, "ai", "passed", "looks right");
    expect(item.state).toBe("on_pad");
    expect(item.machineId).toBe("gate-1");
    expect(item.inspection?.state).toBe("passed");
    expect(nextGate(item)).toBeNull();
  });
  it("sends fails back with a scar tag that counts strikes", () => {
    const once = setStage(setStage(pr(), "ci", "passed", "green"), "ai", "rework", "Hides the error");
    expect(once.state).toBe("rejected");
    expect(once.scars?.[0]).toMatchObject({ station: "review", strike: 1, reason: "Hides the error" });
    const twice = setStage({ ...once, state: "inspecting" }, "ai", "rework", "Still hides it");
    expect(twice.scars?.at(-1)?.strike).toBe(2);
  });
  it("verify bay wants a test unless the change is docs only", () => {
    expect(verifyFromDiff(["web/src/cart.ts"], true).passed).toBe(false);
    expect(verifyFromDiff(["web/src/cart.ts", "web/src/cart.test.ts"], true)).toMatchObject({ passed: true });
    expect(verifyFromDiff(["server/src/a.ts", "server/test/a.test.ts"], false).passed).toBe(true);
    expect(verifyFromDiff(["docs/LOOP.md", "README.md"], false).passed).toBe(true);
    expect(verifyFromDiff([], true).passed).toBe(false);
  });
  it("reads a review verdict defensively", () => {
    expect(parseVerdict('```json\n{"verdict":"pass","reason":"Fixes the null","findings":["ok"]}\n```')).toEqual({ verdict: "pass", reason: "Fixes the null", findings: ["ok"] });
    expect(parseVerdict('{"verdict":"maybe"}').verdict).toBe("rework");
  });
  it("migrates the old single inspector to the four stations", () => {
    const s = base();
    s.machines = s.machines.filter((m) => !["ci-1", "verify-1", "review-1", "gate-1", "launch-pad"].includes(m.id)).concat([{ id: "inspector-1", type: "inspector", x: 3, y: 0, tier: 1, state: "idle" }, { id: "launch-pad", type: "launch_pad", x: 6, y: 0, tier: 1, state: "idle" }]);
    s.belts = [{ id: "belt-1", from: "ore-issues", to: "splitter-1" }, { id: "belt-3", from: "assembler-1", to: "inspector-1" }];
    expect(migrateGauntlet(s)).toBe(true);
    expect(s.machines.some((m) => m.id === "inspector-1")).toBe(false);
    expect(s.belts.map((b) => `${b.from}>${b.to}`)).toContain("review-1>gate-1");
    expect(migrateGauntlet(s)).toBe(false);
  });
  it("counts piles and catches per station", () => {
    const s = base();
    s.items = [setStage(pr(), "ci", "passed", "green"), setStage(pr({ id: "gh-2", prNumber: 100 }), "ci", "rework", "types: x")];
    const st = liveStations(s, 10);
    expect(st.map((x) => x.id)).toEqual(["ci-1", "verify-1", "review-1", "gate-1"]);
    expect(st.find((x) => x.id === "verify-1")?.wip).toBe(1);
    expect(st.find((x) => x.id === "ci-1")).toMatchObject({ wip: 1, caughtThisWeek: 1, passRate: 0.5 });
  });
});

describe("live gauntlet in the Factory", () => {
  it("runs verify and Spark review, offers the launch card, and merges on the player's tap", async () => {
    const keys = await crypto.subtle.generateKey({ name: "RSASSA-PKCS1-v1_5", modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: "SHA-256" }, true, ["sign", "verify"]);
    const pem = `-----BEGIN PRIVATE KEY-----\n${Buffer.from(await crypto.subtle.exportKey("pkcs8", keys.privateKey)).toString("base64")}\n-----END PRIVATE KEY-----`;
    const original = globalThis.fetch;
    const calls: string[] = [];
    let mergedWith: unknown = null;
    globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
      const url = String(input);
      calls.push(`${init?.method ?? "GET"} ${url.replace("https://api.github.com", "")}`);
      const json = (v: unknown) => Response.json(v);
      if (url.endsWith("/access_tokens")) return json({ token: "t" });
      if (url.includes("/pulls/99/files")) return json([{ filename: "web/src/cart.ts", status: "modified", patch: "-a\n+b" }, { filename: "web/src/cart.test.ts", status: "added", patch: "+test" }]);
      if (url.endsWith("/chat/completions")) return json({ choices: [{ message: { content: '{"verdict":"pass","reason":"Fixes the empty cart crash.","findings":[]}' } }] });
      if (url.endsWith("/issues/99/comments")) return json({ id: 1 });
      if (url.endsWith("/pulls/99/merge")) { mergedWith = JSON.parse(String(init?.body)); return json({ merged: true }); }
      if (url.endsWith("/pulls/99")) return json({ head: { sha: head }, merged: false });
      throw new Error(`unexpected ${url}`);
    }) as typeof fetch;
    try {
      const state = base();
      state.items = [setStage(pr(), "ci", "passed", "All checks passed")];
      const data = new Map<string, unknown>([["state", state], ["meta", { repo: "r3dbars/demo", installationId: 1 }]]);
      const events: { type: string; move?: { id: string; options: { id: string }[]; evidence?: unknown[] } }[] = [];
      let alarm: number | null = null;
      const storage = {
        async get(k: string) { return structuredClone(data.get(k)); },
        async put(k: string, v: unknown) { data.set(k, structuredClone(v)); },
        async delete(k: string) { return data.delete(k); },
        async list(o: { prefix: string; limit?: number }) { return new Map([...data.entries()].filter(([k]) => k.startsWith(o.prefix)).slice(0, o.limit)); },
        async getAlarm() { return alarm; },
        async setAlarm(v: number) { alarm = v; },
      };
      const ctx = { storage, blockConcurrencyWhile: <T>(fn: () => Promise<T>) => fn(), getWebSockets: () => [{ send: (raw: string) => events.push(JSON.parse(raw)) }] };
      const f = new Factory(ctx as never, { GITHUB_APP_ID: "1", GITHUB_APP_PRIVATE_KEY: pem, META_API_KEY: "k", DB: { prepare: () => ({ bind: () => ({ all: async () => ({ results: [] }), run: async () => ({ success: true }) }) }) } } as never);
      const saved = () => data.get("state") as FactoryState;

      await f.alarm(); // verify bay
      expect(saved().items[0].inspection?.stages.find((s) => s.gate === "verify")?.state).toBe("passed");
      alarm = null;
      await f.alarm(); // AI review, then the launch card
      expect(saved().items[0].state).toBe("on_pad");
      expect(calls).toContain("POST /repos/r3dbars/demo/issues/99/comments");
      const card = events.filter((e) => e.type === "move").at(-1)!.move!;
      expect(card.options.map((o) => o.id)).toEqual(["launch", "later"]);
      expect(card.evidence).toHaveLength(3);
      expect(saved().stations?.find((s) => s.id === "gate-1")?.wip).toBe(1);

      await f.webSocketMessage({} as never, JSON.stringify({ type: "choose_move", moveId: card.id, optionId: "launch" }));
      expect(mergedWith).toMatchObject({ merge_method: "squash", sha: head });
      expect(saved().items[0].state).toBe("launched");
      expect(saved().items[0].inspection?.humanApproved).toBe(true);
      expect(saved().science.red).toBe(1);
      expect(saved().move).toBeNull();
    } finally { globalThis.fetch = original; }
  });
});
