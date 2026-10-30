import { credentialEnv } from "./credential-fixture";
import { authorizedDB, permitsCache } from "./browser-fixture";
import { expect, it, mock } from "bun:test";
import { generateKeyPairSync } from "node:crypto";
import { FactoryState, type Item } from "@shiptorio/shared";
import { starterLine } from "../src/engine";
import { freshInspection, reworkMove, setStage } from "../src/gauntlet";
import { emptyBook, setPermit } from "../src/permits";
import { RateLimitError } from "../src/rate-limit";
import { authorizedSocket, browserEnv } from "./browser-fixture";
mock.module("cloudflare:workers", () => ({ DurableObject: class { constructor(public ctx: unknown, public env: unknown) {} } }));
const { Factory } = await import("../src/factory");
const head = "a".repeat(40);
const { privateKey } = generateKeyPairSync("rsa", { modulusLength: 2048, privateKeyEncoding: { type: "pkcs8", format: "pem" }, publicKeyEncoding: { type: "spki", format: "pem" } });
type Mode = "passed" | "pending" | "failed" | "unavailable";
async function fixture(run: (f: { factory: InstanceType<typeof Factory>; data: Map<string, unknown>; saved: () => FactoryState; mode: (next: Mode) => void; currentHead: (sha: string) => void; files: (names: string[], changeHead?: boolean) => void; merges: () => number; launch: () => Promise<void>; autoLaunch: () => Promise<void>; duringFiles: (fn: () => Promise<void>) => void; station: () => Promise<void>; putItem: (item: Item) => Promise<void>; mergeState: (state: string | null) => void }) => Promise<void>) {
  let mode: Mode = "passed", current = head, merges = 0;
  let mergeState: string | null = "clean";
  let names = ["docs/README.md"], changeDuringFiles = false;
  let duringFiles: (() => Promise<void>) | undefined;
  const original = globalThis.fetch;
  globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = String(input);
    if (url.endsWith("/access_tokens")) return Response.json({ token: "fake-token" });
    if (url.endsWith("/pulls/99")) return Response.json({ base: { ref: "main", sha: "base" }, head: { sha: current }, state: "open", draft: false, mergeable: true, mergeable_state: mergeState, merged: false });
    if (url.includes("/pulls/99/files?")) {
      const hook = duringFiles; duringFiles = undefined; if (hook) await hook();
      if (changeDuringFiles) current = "b".repeat(40);
      return Response.json(names.map(filename => ({ filename, status: "modified", patch: "+safe" })));
    }
    if (url.endsWith("/pulls/99/merge")) { merges++; return Response.json({ merged: true }); }
    if (url.includes("/check-runs?")) return Response.json({ total_count: 1, check_runs: [{ name: "CI", app: { id: 15368 }, head_sha: new URL(url).pathname.split("/").at(-2), status: mode === "pending" ? "in_progress" : "completed", conclusion: mode === "failed" ? "failure" : "success" }] });
    if (url.includes("/status?")) return mode === "unavailable" ? new Response("forbidden", { status: 403 }) : Response.json({ total_count: 0, statuses: [] });
    throw new Error(`Unexpected request ${init?.method ?? "GET"} ${url}`);
  }) as typeof fetch;
  try {
    let item: Item = { id: "gh-1", kind: "bug", source: "github_issue", title: "Fix guard", district: "docs", lane: "docs", state: "inspecting", attempts: 1, branch: "shiptorio/runner-00000000-0000-4000-8000-000000000001", prNumber: 99, updatedAt: 1, inspection: freshInspection(head) };
    for (const gate of ["ci", "verify", "ai"] as const) item = setStage(item, gate, "passed", "passed");
    const state = FactoryState.parse({ repo: "owner/repo", baseBranch: "main", districts: [], ...starterLine(), items: [item], science: { red: 0, green: 0, grey: 0, blue: 0 }, trust: 0.5, tick: 0 });
    const data = new Map<string, unknown>([["githubAccessCheckedAt", Date.now()], ["state", state], ["meta", { repo: state.repo, installationId: 1 }]]);
    const storage = { async transaction<T>(fn: (tx: { get(key: string): Promise<unknown>; put(key: string, value: unknown): Promise<void> }) => Promise<T>): Promise<T> { return fn(storage); }, get: async (k: string) => structuredClone(data.get(k)), put: async (k: string, v: unknown) => { data.set(k, structuredClone(v)); }, delete: async (k: string) => data.delete(k), list: async (o: { prefix: string }) => new Map([...data].filter(([k]) => k.startsWith(o.prefix))), getAlarm: async () => null, setAlarm: async () => {} };
    const env = { ...browserEnv, CACHE: permitsCache, GITHUB_APP_ID: "1", GITHUB_APP_PRIVATE_KEY: privateKey, DB: { prepare: () => ({ bind: () => ({ first: async () => ({ installation_id: 1, id: 1, login: "test-player", user_id: 1, calls: 1, tokens: 100, next_at: Date.now(), failures: 0, enabled:1, runs_daily:20, count:1 }), all: async () => ({ results: [] }), run: async () => ({ meta: { changes: 1 } }) }) }) } };
    const factory = new Factory({ storage, blockConcurrencyWhile: (fn: () => unknown) => fn(), getWebSockets: () => [] } as never, credentialEnv({ ...env, DB: authorizedDB(env.DB), CACHE: permitsCache }) as never);

    const saved = () => data.get("state") as FactoryState;
    const launch = async () => {
      await factory.alarm();
      const card = saved().deck!.find(m => m.options.some(o => o.id === "launch"))!;
      expect(card).toBeDefined();
      await factory.webSocketMessage(authorizedSocket(undefined, "owner/repo"), JSON.stringify({ type: "choose_move", moveId: card.id, optionId: "launch" }));
    };
    const autoLaunch = async () => {
      data.set("permits", setPermit(emptyBook(), "docs", true));
      await factory.exportState();
      await (factory as unknown as { launch(item: Item, by: "autonomy", approvedHead: string): Promise<void> }).launch((factory as unknown as { state: FactoryState }).state.items[0], "autonomy", saved().items[0].inspection!.headSha);
    };
    await run({ mergeState: state => { mergeState = state; }, factory, data, saved, mode: next => { mode = next; }, currentHead: sha => { current = sha; }, files: (next, change = false) => { names = next; changeDuringFiles = change; }, merges: () => merges, launch, autoLaunch, duringFiles: fn => { duringFiles = fn; }, station: () => (factory as unknown as { runGauntlet(): Promise<void> }).runGauntlet(), putItem: async item => { await factory.exportState(); await (factory as unknown as { patch(p: { items: Item[] }): Promise<void> }).patch({ items: [item] }); } });
  } finally { globalThis.fetch = original; }
}

it("a queued same-head rerun removes launch readiness without recording rework", async () => {
  await fixture(async f => {
    f.mode("pending");
    await f.factory.enqueueGitHub("rerun", "check_run", { action: "in_progress", repository: { full_name: "owner/repo" }, installation: { id: 1 }, check_run: { head_sha: head, pull_requests: [{ number: 99 }] } });
    await f.factory.alarm();
    expect(f.saved().items[0].state).toBe("inspecting");
    expect(f.saved().items[0].inspection?.stages[0].state).toBe("pending");
    expect(f.saved().items[0].scars).toBeUndefined();
    expect(f.merges()).toBe(0);
  });
});
it("same-head failure revokes an earned permit even after every gate had passed", async () => {
  await fixture(async f => {
    f.data.set("permits", setPermit(emptyBook(), "docs", true));
    f.mode("failed");
    await f.factory.onCheckSuite([99], false, "failed rerun", head);
    expect(f.saved().items[0].state).toBe("rejected");
    expect(f.saved().items[0].scars).toHaveLength(1);
    expect(f.saved().autonomy?.districts[0].permit).toBe(false);
    expect(f.merges()).toBe(0);
  });
});
it("stale events cannot reset readiness for the actual current head", async () => {
  await fixture(async f => {
    await f.factory.onCheckSuite([99], false, "old event", "b".repeat(40));
    expect(f.saved().items[0].state).toBe("on_pad");
    expect(f.saved().items[0].inspection?.headSha).toBe(head);
  });
});
it("merge refresh blocks pending, failed and unavailable checks without a webhook", async () => {
  for (const mode of ["pending", "failed", "unavailable"] as const) await fixture(async f => {
    f.mode(mode);
    await f.launch();
    expect(f.merges()).toBe(0);
    expect(f.saved().items[0].state).toBe(mode === "failed" ? "rejected" : mode === "pending" ? "inspecting" : "on_pad");
  });
});
it("a changed head returns to CI instead of consuming an old launch approval", async () => {
  await fixture(async f => {
    f.currentHead("b".repeat(40));
    await f.factory.exportState();
    await (f.factory as unknown as { launch(item: Item, by: "player", approvedHead: string): Promise<void> }).launch((f.factory as unknown as { state: FactoryState }).state.items[0], "player", head);
    expect(f.merges()).toBe(0);
    expect(f.saved().items[0].state).toBe("inspecting");
    expect(f.saved().items[0].inspection?.headSha).toBe("b".repeat(40));
  });
});

it("a historical docs permit cannot launch code or cross-lane changes", async () => {
  for (const files of [["src/fix.ts"], ["docs/README.md", "src/fix.ts"]]) await fixture(async f => {
    f.files(files);
    await f.autoLaunch();
    expect(f.merges()).toBe(0);
    expect(f.saved().items[0].lane).not.toBe("docs");
    expect(f.data.has("autoLaunch:gh-1")).toBe(false);
  });
});

it("automatic launch requires a stable current diff and still permits unchanged docs", async () => {
  await fixture(async f => {
    f.files(["docs/README.md"], true);
    await f.autoLaunch();
    expect(f.merges()).toBe(0);
  });
  await fixture(async f => {
    await f.autoLaunch();
    expect(f.merges()).toBe(1);
  });
});


it("a same-head CI rerun cannot reuse an in-flight station result", async () => {
  await fixture(async f => {
    await f.putItem(setStage({ ...f.saved().items[0], state: "inspecting", inspection: freshInspection(head) }, "ci", "passed", "green"));
    f.duringFiles(async () => {
      // Simulate the replacement inspection produced by a pending→green same-head rerun.
      // Do not nest GitHub calls inside its serialized fetch queue.
      await f.putItem(setStage({ ...f.saved().items[0], state: "inspecting", inspection: freshInspection(head) }, "ci", "passed", "rerun green"));
    });
    await f.station();
    expect(f.saved().items[0].inspection?.stages.find(s => s.gate === "verify")?.state).toBe("pending");
    expect(f.saved().items[0].state).toBe("inspecting");
    expect(f.merges()).toBe(0);
  });
});
it("a force-push while station files load cannot stamp proof on the previous head", async () => {
  await fixture(async f => {
    await f.putItem(setStage({ ...f.saved().items[0], state: "inspecting", inspection: freshInspection(head) }, "ci", "passed", "green"));
    f.files(["docs/README.md"], true);
    await f.station();
    expect(f.saved().items[0].inspection?.stages.find(s => s.gate === "verify")?.state).toBe("pending");
    expect(f.merges()).toBe(0);
  });
});
it("reconciliation without an event SHA restarts checks on a changed head", async () => {
  await fixture(async f => {
    f.currentHead("b".repeat(40));
    await f.factory.onCheckSuite([99], true, "refresh");
    expect(f.saved().items[0].inspection?.headSha).toBe("b".repeat(40));
    expect(f.saved().items[0].inspection?.stages.find(s => s.gate === "verify")?.state).toBe("pending");
    expect(f.saved().items[0].state).toBe("inspecting");
  });
});

it("a persisted passed flag without every station receipt cannot offer Launch", async () => {
  await fixture(async f => {
    const item = f.saved().items[0];
    item.inspection!.stages = item.inspection!.stages.filter(stage => stage.gate !== "verify");
    await f.putItem(item);
    await f.factory.alarm();
    expect(f.saved().deck?.some(move => move.itemId === item.id && move.options.some(option => option.id === "launch"))).toBe(false);
    expect(f.merges()).toBe(0);
  });
});

it("GitHub behind or blocked policy cannot offer an unlocked Launch despite every reported check passing", async () => {
  for (const state of ["behind", "blocked", "unknown", "dirty", "draft", "unstable", "has_hooks", "future-state", null]) await fixture(async f => {
    f.mergeState(state);
    await f.factory.alarm();
    const card = f.saved().deck?.find(m => m.itemId === "gh-1" && m.stage === "pad");
    expect(card).toBeDefined();
    expect(card!.options.some(o => o.actions.some(a => a.tool === "request_merge"))).toBe(false);
    expect(f.saved().items[0].inspection?.state).toBe("passed");
    expect(f.merges()).toBe(0);
  });
});

it("a carried Launch is removed on a GitHub hold and returns when the same proven head is clean", async () => {
  await fixture(async f => {
    await f.factory.alarm();
    expect(f.saved().deck?.some(m => m.options.some(o => o.id === "launch"))).toBe(true);
    f.mergeState("blocked");
    f.data.delete("gauntletReadiness:gh-1"); // the readiness poll interval elapsed
    await f.factory.alarm();
    expect(f.saved().deck?.some(m => m.options.some(o => o.id === "launch"))).toBe(false);
    expect(f.saved().items[0].inspection?.state).toBe("passed");
    f.mergeState("clean");
    f.data.delete("gauntletReadiness:gh-1");
    await f.factory.alarm();
    expect(f.saved().deck?.some(m => m.options.some(o => o.id === "launch"))).toBe(true);
  });
});
it("the tick re-asks GitHub about an on-pad PR at most every poll interval, and waits out a rate limit", async () => {
  await fixture(async f => {
    const original = globalThis.fetch;
    let polls = 0, limited = false;
    globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
      if (String(input).endsWith("/pulls/99")) { polls++; if (limited) throw new RateLimitError(Date.now() + 600_000); }
      return original(input, init);
    }) as typeof fetch;
    try {
      await f.factory.alarm();
      await f.factory.alarm();
      await f.factory.alarm();
      expect(polls).toBe(1);
      const poll = f.data.get("gauntletReadiness:gh-1") as { head: string; nextAt: number };
      expect(poll.head).toBe(head);
      expect(poll.nextAt).toBeGreaterThan(Date.now() + 20_000);
      // A new head is a different question and is asked at once.
      f.data.set("gauntletReadiness:gh-1", { ...poll, head: "c".repeat(40) });
      await f.factory.alarm();
      expect(polls).toBe(2);
      // A rate limit holds the next poll until GitHub's deadline; a webhook does not cut it short.
      f.data.delete("gauntletReadiness:gh-1");
      limited = true;
      await f.factory.alarm();
      const held = f.data.get("gauntletReadiness:gh-1") as { nextAt: number; limited: boolean };
      expect(held.limited).toBe(true);
      expect(held.nextAt).toBeGreaterThan(Date.now() + 500_000);
      await (f.factory as unknown as { refreshReadinessPolls(): Promise<void> }).refreshReadinessPolls();
      expect(f.data.has("gauntletReadiness:gh-1")).toBe(true);
    } finally { globalThis.fetch = original; }
  });
});
it("a GitHub hold after the card offer blocks the final merge without erasing station proof", async () => {
  await fixture(async f => {
    await f.factory.alarm();
    const card = f.saved().deck!.find(m => m.options.some(o => o.id === "launch"))!;
    f.mergeState("behind");
    await f.factory.webSocketMessage(authorizedSocket(undefined, "owner/repo"), JSON.stringify({ type: "choose_move", moveId: card.id, optionId: "launch" }));
    expect(f.merges()).toBe(0);
    expect(f.saved().items[0].inspection?.state).toBe("passed");
  });
});


it("the player approval is saved before the launch is published", async () => {
  await fixture(async f => {
    const close = f.factory.onPullClosed.bind(f.factory);
    f.factory.onPullClosed = async (...args: Parameters<typeof close>) => {
      expect(f.saved().items[0].inspection?.humanApproved).toBe(true);
      expect(f.saved().items[0].inspection?.stages.find(s => s.gate === "human")?.state).toBe("passed");
      return close(...args);
    };
    await f.launch();
    expect(f.saved().items[0].state).toBe("launched");
    expect(f.merges()).toBe(1);
  });
});


type MergeFixture = Parameters<Parameters<typeof fixture>[0]>[0];
async function offerOverrule(f: MergeFixture) {
  await f.putItem(setStage(f.saved().items[0], "ai", "rework", "Review requires a change"));
  await (f.factory as unknown as { offerGauntletMove(): Promise<void> }).offerGauntletMove();
  const card = f.saved().deck!.find(m => m.options.some(o => o.id === "overrule"))!;
  expect(card).toBeDefined();
  return card;
}
async function chooseOverrule(f: MergeFixture, id: string) {
  await f.factory.webSocketMessage(authorizedSocket(undefined, "owner/repo"), JSON.stringify({ type: "choose_move", moveId: id, optionId: "overrule" }));
}

it("an overrule cannot approve a head pushed after its card was offered", async () => {
  await fixture(async f => {
    const card = await offerOverrule(f);
    f.currentHead("b".repeat(40));
    await chooseOverrule(f, card.id);
    expect(f.merges()).toBe(0);
    expect(f.saved().items[0].inspection?.headSha).toBe("b".repeat(40));
    expect(f.saved().items[0].state).toBe("inspecting");
  });
});

it("an unchanged overrule remains explicit and obeys GitHub merge policy", async () => {
  for (const policy of ["clean", "behind", "blocked"]) await fixture(async f => {
    const card = await offerOverrule(f);
    f.mergeState(policy);
    const fetchBefore = globalThis.fetch;
    let submittedHead: unknown;
    globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
      if (String(input).endsWith("/merge")) submittedHead = JSON.parse(String(init?.body)).sha;
      return fetchBefore(input, init);
    }) as typeof fetch;
    await chooseOverrule(f, card.id);
    expect(f.merges()).toBe(policy === "clean" ? 1 : 0);
    expect(submittedHead).toBe(policy === "clean" ? head : undefined);
  });
});

it("an overrule cannot reuse a replaced inspection during readiness", async () => {
  for (const replacementHead of [head, "b".repeat(40)]) await fixture(async f => {
    const card = await offerOverrule(f);
    const fetchBefore = globalThis.fetch;
    let reads = 0;
    globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
      if (String(input).endsWith("/pulls/99") && ++reads === 2) {
        await f.putItem(setStage({ ...f.saved().items[0], inspection: freshInspection(replacementHead) }, "ai", "rework", "New review"));
      }
      return fetchBefore(input, init);
    }) as typeof fetch;
    await chooseOverrule(f, card.id);
    expect(reads).toBeGreaterThanOrEqual(2);
    expect(f.merges()).toBe(0);
    expect(f.saved().items[0].inspection?.headSha).toBe(replacementHead);
  });
});

it("publishing a stale review card never upgrades its merge authority to the new head", async () => {
  await fixture(async f => {
    const rejected = setStage(f.saved().items[0], "ai", "rework", "Old review");
    const card = reworkMove(rejected);
    const newer = setStage({ ...rejected, inspection: freshInspection("b".repeat(40)) }, "ai", "rework", "New review");
    await f.putItem(newer);
    await (f.factory as unknown as { publishDecision(move: typeof card): Promise<void> }).publishDecision(card);
    expect(f.saved().deck?.some(m => m.id === card.id)).toBe(false);
    expect(f.merges()).toBe(0);
  });
});


it("an old selected card cannot overwrite an already newer local inspection", async () => {
  await fixture(async f => {
    const card = await offerOverrule(f);
    const newer = setStage({ ...f.saved().items[0], inspection: freshInspection("b".repeat(40)) }, "ai", "rework", "New review");
    await f.putItem(newer);
    // A socket handler may have selected this card before awaiting other work.
    const handler = f.factory as unknown as { state: FactoryState; chooseGauntletMove(id: string, option: string): Promise<boolean> };
    handler.state.move = card;
    await handler.chooseGauntletMove(card.id, "overrule");
    expect(f.merges()).toBe(0);
    expect(f.saved().items[0].inspection).toEqual(newer.inspection);
  });
});

it("merge execution rejects missing, malformed or mismatched stored approval targets", async () => {
  for (const args of [
    { pr: 99, overrule: true },
    { pr: 99, overrule: true, headSha: "unknown" },
    { pr: 99, overrule: true, headSha: 123 },
    { pr: 100, overrule: true, headSha: head },
    { pr: 99, overrule: false, headSha: head },
  ]) await fixture(async f => {
    const card = await offerOverrule(f);
    card.options.find(o => o.id === "overrule")!.actions[0].args = args;
    const handler = f.factory as unknown as { state: FactoryState; chooseGauntletMove(id: string, option: string): Promise<boolean> };
    handler.state.move = card;
    await handler.chooseGauntletMove(card.id, "overrule");
    expect(f.merges()).toBe(0);
    expect(f.saved().items[0].state).toBe("rejected");
  });
});
