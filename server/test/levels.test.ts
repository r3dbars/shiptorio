import { credentialEnv } from "./credential-fixture";
import { authorizedSocket, browserEnv, membershipCache } from "./browser-fixture";
import { describe, expect, it, mock } from "bun:test";
import { FactoryState, type Item } from "@shiptorio/shared";
import { starterLine } from "../src/engine";
import { freshInspection, setStage } from "../src/gauntlet";
import { autonomyView, emptyBook, recordShip, setPermit, type PermitBook } from "../src/permits";
import { BUILD_SHIPS, escape, FLOOR_SHIPS, grantLevel, levelMove, levelReady, lowerLevel, nextStep, snoozeLevel } from "../src/levels";
import { flagKey } from "../src/flags";

mock.module("cloudflare:workers", () => ({ DurableObject: class {
  ctx: unknown; env: unknown;
  constructor(ctx: unknown, env: unknown) { this.ctx = ctx; this.env = env; }
} }));
const { Factory } = await import("../src/factory");

const head = "d".repeat(40);
const DAY = 24 * 60 * 60 * 1000;
const passed = (overrides: Partial<Item> = {}): Item => {
  let item: Item = { id: "gh-7", kind: "cleanup", source: "github_issue", title: "Fix the setup doc", district: "docs", lane: "docs", state: "inspecting", attempts: 1, prNumber: 77, branch: "shiptorio/runner-7", machineId: "ci-1", inspection: freshInspection(head), updatedAt: 1, ...overrides };
  for (const gate of ["ci", "verify", "ai"] as const) item = setStage(item, gate, "passed", "ok");
  return item;
};
const ship = (book: PermitBook, n: number, o: Partial<Item> = {}) => { for (let i = 0; i < n; i++) book = recordShip(book, passed(o), false); return book; };

describe("autonomy level rules", () => {
  it("Floor is earned from clean ships; scarred ships don't count", () => {
    let book = ship(emptyBook(), FLOOR_SHIPS - 1);
    book = recordShip(book, { ...passed(), scars: [{ station: "ci", reason: "red", strike: 1, at: 1 }] }, false);
    expect(nextStep(book)).toMatchObject({ level: "floor", have: FLOOR_SHIPS - 1, need: FLOOR_SHIPS, ready: false });
    expect(levelReady(book)).toBeUndefined();
    book = ship(book, 1);
    expect(levelReady(book)).toBe("floor");
    expect(grantLevel(book, "build")).toBeNull(); // only the next level
    expect(grantLevel(book, "floor")?.ladder?.level).toBe("floor");
  });

  it("Build needs clean ships plus a launch permit; Lights out needs a clean week and permits on most lanes", () => {
    const t0 = 1_000_000;
    let book = grantLevel(ship(emptyBook(), BUILD_SHIPS), "floor", t0)!;
    expect(levelReady(book, t0)).toBeUndefined(); // no permit yet
    expect(nextStep(book, t0)?.label).toContain("launch permit");
    book = setPermit(book, "docs", true);
    expect(levelReady(book, t0)).toBe("build");
    book = grantLevel(book, "build", t0)!;
    book = ship(book, 2, { lane: "web" });
    expect(levelReady(book, t0 + 8 * DAY)).toBeUndefined(); // web has no permit: 1 of 2 lanes isn't "most" (needs 2)
    book = setPermit(book, "web", true);
    expect(levelReady(book, t0 + 6 * DAY)).toBeUndefined(); // not a week yet
    expect(levelReady(book, t0 + 7 * DAY)).toBe("lights_out");
    expect(nextStep(grantLevel(book, "lights_out", t0 + 7 * DAY)!, t0 + 7 * DAY)).toBeNull();
  });

  it("an escaped defect drops back to Advisor and the count starts over", () => {
    const book = grantLevel(ship(emptyBook(), FLOOR_SHIPS), "floor")!;
    const { book: after, dropped } = escape(book);
    expect(dropped).toBe("floor");
    expect(after.ladder).toMatchObject({ level: "advisor", clean: 0 });
    expect(levelReady(after)).toBeUndefined();
    expect(escape(after).dropped).toBeNull();
  });

  it("the player can turn it down but never up; not yet waits 3 clean ships", () => {
    const book = grantLevel(ship(emptyBook(), FLOOR_SHIPS), "floor")!;
    expect(lowerLevel(book, "build")).toBeNull();
    expect(lowerLevel(book, "advisor")?.ladder?.level).toBe("advisor");
    const snoozed = snoozeLevel(ship(emptyBook(), FLOOR_SHIPS));
    expect(levelReady(ship(snoozed, 2))).toBeUndefined();
    expect(levelReady(ship(snoozed, 3))).toBe("floor");
  });

  it("the HUD only sees levels with the flag on", () => {
    const book = grantLevel(ship(emptyBook(), FLOOR_SHIPS), "floor")!;
    expect(autonomyView(book)).toMatchObject({ level: "advisor", next: null });
    expect(autonomyView(book, true)).toMatchObject({ level: "floor", next: { level: "build", need: BUILD_SHIPS } });
  });

  it("the level card never asks to merge anything", () => {
    const move = levelMove(ship(emptyBook(), FLOOR_SHIPS), "floor");
    const tools = move.options.flatMap((o) => o.actions.map((a) => a.tool));
    expect(tools).toEqual(["set_autonomy"]);
    expect(move.plan?.join(" ")).toContain("No code changes until you approve the plan");
  });
});

describe("autonomy levels in the Factory", () => {
  const setup = (flag: boolean) => {
    const state = FactoryState.parse({ repo: "r3dbars/demo", baseBranch: "main", districts: [], ...starterLine(), items: [], science: { red: 0, green: 0, grey: 0, blue: 0 }, trust: 0.5, tick: 0 });
    const data = new Map<string, unknown>([["state", state], ["meta", { repo: "r3dbars/demo", installationId: 1 }], ["permits", ship(emptyBook(), FLOOR_SHIPS, { lane: undefined })]]);
    const events: { type: string; level?: string }[] = [];
    let alarm: number | null = null;
    const storage = {
      async get(k: string) { return structuredClone(data.get(k)); },
      async put(k: string, v: unknown) { data.set(k, structuredClone(v)); },
      async delete(k: string) { return data.delete(k); },
      async list(o: { prefix: string; limit?: number }) { return new Map([...data.entries()].filter(([k]) => k.startsWith(o.prefix)).slice(0, o.limit)); },
      async transaction<T>(fn: (tx: unknown) => Promise<T>): Promise<T> { return fn(storage); },
      async getAlarm() { return alarm; },
      async setAlarm(v: number) { alarm = v; },
    };
    const cache = { ...membershipCache, get: async (key: string) => (key === flagKey("autonomy") ? (flag ? "true" : null) : membershipCache.get(key)) };
    const ctx = { storage, blockConcurrencyWhile: <T>(fn: () => Promise<T>) => fn(), getWebSockets: () => [authorizedSocket((raw: string) => events.push(JSON.parse(raw)))] };
    const f = new Factory(ctx as never, credentialEnv({ ...browserEnv, CACHE: cache, DB: { prepare: () => ({ bind: () => ({ first: async () => ({ token_version: 0, status: "active", installation_id: 1, id: 1, login: "test-player", user_id: 1, calls: 1, tokens: 100, next_at: Date.now(), failures: 0, enabled: 1, runs_daily: 20, count: 1 }), all: async () => ({ results: [] }), run: async () => ({ success: true }) }) }) } }) as never);
    return { f, data, events, saved: () => data.get("state") as FactoryState };
  };

  it("flag off: no level card, the HUD stays at Advisor", async () => {
    const { f, saved } = setup(false);
    await f.alarm();
    expect(saved().move?.options[0]?.actions[0]?.args.level).toBeUndefined();
    expect(saved().autonomy).toMatchObject({ level: "advisor", next: null });
  });

  it("flag on: the earned level becomes a card, Allow unlocks it, the player can turn it back down", async () => {
    const { f, saved, events } = setup(true);
    await f.alarm();
    const card = saved().move!;
    expect(card.kind).toBe("automate");
    expect(card.options[0].actions[0].args.level).toBe("floor");
    await f.webSocketMessage(authorizedSocket(), JSON.stringify({ type: "choose_move", moveId: card.id, optionId: "allow" }));
    expect(saved().autonomy).toMatchObject({ level: "floor", next: { level: "build" } });
    expect(events.some((e) => e.type === "autonomy_unlocked" && e.level === "floor")).toBe(true);
    await f.webSocketMessage(authorizedSocket(), JSON.stringify({ type: "set_autonomy", level: "lights_out" }));
    expect(saved().autonomy?.level).toBe("floor"); // never up from settings
    await f.webSocketMessage(authorizedSocket(), JSON.stringify({ type: "set_autonomy", level: "advisor" }));
    expect(saved().autonomy?.level).toBe("advisor");
  });
});
