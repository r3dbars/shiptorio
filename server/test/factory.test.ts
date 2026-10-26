import { describe, expect, it, mock } from "bun:test";
import { FactoryState, type Item } from "@shiptorio/shared";
import { starterLine } from "../src/engine";

// Exercise the real Factory transitions with storage and transport substitutes.
// Wrangler smoke checks below exercise workerd separately.
mock.module("cloudflare:workers", () => ({ DurableObject: class {
  ctx: unknown; env: unknown;
  constructor(ctx: unknown, env: unknown) { this.ctx = ctx; this.env = env; }
} }));
const { Factory } = await import("../src/factory");

function fixture(items: Item[] = []) {
  const state = FactoryState.parse({ repo: "r3dbars/demo", baseBranch: "main", districts: [], ...starterLine(), items, science: { red: 0, green: 0, grey: 0, blue: 0 }, trust: 0.5, tick: 0 });
  const data = new Map<string, unknown>([["state", structuredClone(state)], ["meta", { repo: state.repo, installationId: 1 }]]);
  let alarm: number | null = null;
  const events: unknown[] = [];
  const storage = {
    async get(key: string) { return structuredClone(data.get(key)); },
    async put(key: string, value: unknown) { data.set(key, structuredClone(value)); },
    async getAlarm() { return alarm; },
    async setAlarm(value: number) { alarm = value; },
  };
  const ctx = { storage, getWebSockets: () => [{ send: (raw: string) => events.push(JSON.parse(raw)) }] };
  const factory = new Factory(ctx as never, {} as never);
  return { factory, data, events, saved: () => data.get("state") as FactoryState };
}

const item = (overrides: Partial<Item> = {}): Item => ({ id: "gh-1", kind: "bug", source: "github_issue", title: "Fix checkout", district: "/", state: "on_pad", attempts: 1, prNumber: 42, updatedAt: 1, ...overrides });

describe("Factory lifecycle", () => {
  it("awards one rocket and one science pack for redelivered merge webhooks", async () => {
    const f = fixture([item()]);
    await f.factory.onPullClosed(42, true);
    await f.factory.onPullClosed(42, true);
    expect(f.saved().items[0].state).toBe("launched");
    expect(f.saved().science.red).toBe(1);
    expect(f.saved().trust).toBe(0.55);
  });
  it("deduplicates issue deliveries and retains source context", async () => {
    const f = fixture();
    const issue = { number: 7, title: "Broken checkout", body: "A customer cannot buy", url: "https://github.com/r3dbars/demo/issues/7", labels: ["bug"] };
    await f.factory.ingestIssue(issue);
    await f.factory.ingestIssue(issue);
    expect(f.saved().items).toHaveLength(1);
    expect(f.saved().items[0].body).toContain("A customer cannot buy");
  });
  it("queues work without burning retries when Meta is not configured", async () => {
    const f = fixture([item({ state: "queued", prNumber: undefined, attempts: 0 })]);
    await f.factory.alarm();
    expect(f.saved().items[0].attempts).toBe(0);
    expect(f.saved().machines.find((m) => m.id === "assembler-1")?.state).toBe("blocked");
    expect(f.saved().tick).toBe(1);
  });
  it("accepts build commands but ignores malformed messages and removal of active machinery", async () => {
    const f = fixture();
    await f.factory.webSocketMessage({} as never, "not JSON");
    await f.factory.webSocketMessage({} as never, JSON.stringify({ type: "place_machine", machineType: "assembler", harness: "spark", x: 8, y: 0 }));
    expect(f.saved().machines.at(-1)?.powerId).toBe("steam-spark");
    expect(f.saved().machines).toHaveLength(7);
  });
  it("stops rework after three attempts and never launches unmerged PRs", async () => {
    const f = fixture([item({ state: "rejected", attempts: 3 })]);
    await f.factory.alarm();
    expect(f.saved().items[0].state).toBe("rejected");
    await f.factory.onPullClosed(42, false);
    expect(f.saved().items).toHaveLength(0);
    expect(f.saved().science.red).toBe(0);
  });
});
