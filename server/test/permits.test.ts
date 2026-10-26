import { describe, expect, it, mock } from "bun:test";
import { FactoryState, type Item } from "@shiptorio/shared";
import { starterLine } from "../src/engine";
import { freshInspection, setStage } from "../src/gauntlet";
import { autonomyView, emptyBook, laneOf, mayAutoLaunch, permitMove, permitReady, recordRework, recordShip, setPermit, snooze, type PermitBook } from "../src/permits";

mock.module("cloudflare:workers", () => ({ DurableObject: class {
  ctx: unknown; env: unknown;
  constructor(ctx: unknown, env: unknown) { this.ctx = ctx; this.env = env; }
} }));
const { Factory } = await import("../src/factory");

const head = "c".repeat(40);
const passed = (overrides: Partial<Item> = {}): Item => {
  let item: Item = { id: "gh-7", kind: "cleanup", source: "github_issue", title: "Fix the setup doc", district: "docs", lane: "docs", state: "inspecting", attempts: 1, prNumber: 77, prUrl: "https://github.com/r3dbars/demo/pull/77", branch: "shiptorio/runner-7", machineId: "ci-1", inspection: freshInspection(head), updatedAt: 1, ...overrides };
  for (const gate of ["ci", "verify", "ai"] as const) item = setStage(item, gate, "passed", "ok");
  return item;
};
const shipClean = (book: PermitBook, n: number) => { for (let i = 0; i < n; i++) book = recordShip(book, passed(), false); return book; };

describe("permit rules", () => {
  it("puts a PR in a lane: docs, one folder, or none", () => {
    expect(laneOf(["docs/LOOP.md", "README.md"])).toBe("docs");
    expect(laneOf(["web/src/a.ts", "web/src/a.test.ts"])).toBe("web");
    expect(laneOf(["web/src/a.ts", "server/src/b.ts"])).toBeNull();
    expect(laneOf(["package.json"])).toBeNull();
    expect(laneOf([])).toBeNull();
  });
  it("offers a permit after 5 clean docs ships, and asks again 3 later on not yet", () => {
    let book = shipClean(emptyBook(), 4);
    expect(permitReady(book)).toBeUndefined();
    book = shipClean(book, 1);
    expect(permitReady(book)?.lane).toBe("docs");
    const card = permitMove(permitReady(book)!);
    expect(card.title).toBe("5 docs PRs shipped clean, zero rework. Let docs ship on their own?");
    expect(card.options[0]).toMatchObject({ id: "allow", recommended: true });
    expect(card.kind).toBe("automate");
    book = snooze(book, "docs");
    expect(permitReady(shipClean(book, 2))).toBeUndefined();
    expect(permitReady(shipClean(book, 3))?.lane).toBe("docs");
  });
  it("code folders need a longer streak", () => {
    const web = (book: PermitBook, n: number) => { for (let i = 0; i < n; i++) book = recordShip(book, passed({ lane: "web" }), false); return book; };
    expect(permitReady(web(emptyBook(), 9))).toBeUndefined();
    expect(permitReady(web(emptyBook(), 10))?.lane).toBe("web");
  });
  it("a scarred ship doesn't count and resets the streak", () => {
    let book = shipClean(emptyBook(), 3);
    book = recordShip(book, { ...passed(), scars: [{ station: "ci", reason: "x", strike: 1 }] }, false);
    expect(book.lanes.docs.streak).toBe(0);
  });
  it("rework revokes the permit; only permitted clean PRs auto-launch", () => {
    let book = setPermit(shipClean(emptyBook(), 5), "docs", true);
    expect(mayAutoLaunch(book, passed())).toBe(true);
    expect(mayAutoLaunch(book, passed({ lane: "web" }))).toBe(false);
    expect(mayAutoLaunch(book, passed({ lane: undefined }))).toBe(false);
    const { book: after, revoked } = recordRework(book, "docs");
    expect(revoked).toBe(true);
    expect(mayAutoLaunch(after, passed())).toBe(false);
    expect(after.lanes.docs.streak).toBe(0);
  });
  it("counts automated share for the HUD", () => {
    let book = setPermit(shipClean(emptyBook(), 5), "docs", true);
    book = recordShip(book, passed(), true);
    const view = autonomyView(book);
    expect(view.launches).toBe(6);
    expect(view.automated).toBeCloseTo(1 / 6);
    expect(view.districts[0]).toMatchObject({ district: "docs", permit: true, risk: "low" });
  });
});

describe("permits in the Factory", () => {
  it("offers the permit, auto-launches the next clean docs PR, and revokes on rework", async () => {
    const keys = await crypto.subtle.generateKey({ name: "RSASSA-PKCS1-v1_5", modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: "SHA-256" }, true, ["sign", "verify"]);
    const pem = `-----BEGIN PRIVATE KEY-----\n${Buffer.from(await crypto.subtle.exportKey("pkcs8", keys.privateKey)).toString("base64")}\n-----END PRIVATE KEY-----`;
    const original = globalThis.fetch;
    const merged: string[] = [];
    globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
      const url = String(input);
      if (url.endsWith("/access_tokens")) return Response.json({ token: "t" });
      if (url.endsWith("/files?per_page=100")) return Response.json([{ filename: "docs/SETUP.md", status: "modified", patch: "+x" }]);
      if (url.endsWith("/chat/completions")) return Response.json({ choices: [{ message: { content: '{"verdict":"rework","reason":"The steps are wrong.","findings":[]}' } }] });
      if (url.endsWith("/comments")) return Response.json({ id: 1 });
      const m = url.match(/\/pulls\/(\d+)(\/merge)?$/);
      if (m?.[2]) { merged.push(m[1]); return Response.json({ merged: true }); }
      if (m) return Response.json({ head: { sha: head }, merged: false });
      throw new Error(`unexpected ${url}`);
    }) as typeof fetch;
    try {
      const state = FactoryState.parse({ repo: "r3dbars/demo", baseBranch: "main", districts: [], ...starterLine(), items: [], science: { red: 0, green: 0, grey: 0, blue: 0 }, trust: 0.5, tick: 0 });
      const data = new Map<string, unknown>([["state", state], ["meta", { repo: "r3dbars/demo", installationId: 1 }], ["permits", shipClean(emptyBook(), 5)]]);
      const events: { type: string; district?: string; move?: { id: string; kind?: string; options: { id: string }[] } }[] = [];
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
      const f = new Factory(ctx as never, { GITHUB_APP_ID: "1", GITHUB_APP_PRIVATE_KEY: pem, DB: { prepare: () => ({ bind: () => ({ all: async () => ({ results: [] }), run: async () => ({ success: true }) }) }) } } as never);
      const saved = () => data.get("state") as FactoryState;

      await f.alarm(); // nothing waiting, so the permit card comes up
      const card = saved().move!;
      expect(card.kind).toBe("automate");
      await f.webSocketMessage({} as never, JSON.stringify({ type: "choose_move", moveId: card.id, optionId: "allow" }));
      expect(saved().autonomy?.districts.find((d) => d.district === "docs")?.permit).toBe(true);
      expect(events.some((e) => e.type === "autonomy_unlocked" && e.district === "docs")).toBe(true);

      // a clean docs PR on the pad launches on its own, no card
      data.set("state", { ...saved(), items: [passed()] });
      const g = new Factory(ctx as never, { GITHUB_APP_ID: "1", GITHUB_APP_PRIVATE_KEY: pem, DB: { prepare: () => ({ bind: () => ({ all: async () => ({ results: [] }), run: async () => ({ success: true }) }) }) } } as never);
      alarm = null;
      await g.alarm();
      expect(merged).toEqual(["77"]);
      expect(saved().items[0].state).toBe("launched");
      expect(saved().items[0].inspection?.humanApproved).toBe(false);
      expect(saved().autonomy).toMatchObject({ launches: 6, ranAlone: 1 });
      expect(saved().move?.kind).not.toBe("ship");

      // AI review sends a docs PR back: the permit is gone, and the next clean one waits for the player
      let review: Item = { ...passed({ id: "gh-8", prNumber: 78, lane: undefined }) };
      review = { ...review, state: "inspecting", machineId: "review-1", inspection: { ...review.inspection!, state: "pending", stages: review.inspection!.stages.map((st) => (st.gate === "ai" ? { ...st, state: "pending" as const } : st)) } };
      data.set("state", { ...saved(), items: [review], move: null });
      const h = new Factory(ctx as never, { GITHUB_APP_ID: "1", GITHUB_APP_PRIVATE_KEY: pem, META_API_KEY: "k", DB: { prepare: () => ({ bind: () => ({ all: async () => ({ results: [] }), run: async () => ({ success: true }) }) }) } } as never);
      alarm = null;
      await h.alarm();
      expect(saved().items[0].state).toBe("rejected");
      expect(saved().items[0].lane).toBe("docs");
      expect(saved().autonomy?.districts.find((d) => d.district === "docs")).toMatchObject({ permit: false, score: 0 });
      expect(events.filter((e) => e.type === "autonomy_unlocked").length).toBe(2);

      data.set("state", { ...saved(), items: [passed({ id: "gh-9", prNumber: 79 })], move: null });
      const k = new Factory(ctx as never, { GITHUB_APP_ID: "1", GITHUB_APP_PRIVATE_KEY: pem, DB: { prepare: () => ({ bind: () => ({ all: async () => ({ results: [] }), run: async () => ({ success: true }) }) }) } } as never);
      alarm = null;
      await k.alarm();
      expect(merged).toEqual(["77"]);
      expect(saved().move?.options.map((o) => o.id)).toEqual(["launch", "later"]);
    } finally { globalThis.fetch = original; }
  });
});
