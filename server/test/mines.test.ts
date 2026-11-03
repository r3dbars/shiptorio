import { credentialEnv } from "./credential-fixture";
import { credentialDB } from "./credential-fixture";
import { authorizedDB, membershipCache, authorizedSocket, browserEnv, browserCookies } from "./browser-fixture";
import { expect, it, mock } from "bun:test";
import { foldSignal, matchDistrict } from "../src/ore";
import { fakeSentry, normalizeSentry, topInAppPath } from "../src/sources/sentry";
import { analyze, fakePostHogRows, normalizeRoute, parseRows } from "../src/sources/posthog";

mock.module("cloudflare:workers", () => ({ DurableObject: class {
  ctx: unknown; env: unknown;
  constructor(ctx: unknown, env: unknown) { this.ctx = ctx; this.env = env; }
} }));
const { testApp: app } = await import("./app-fixture");

const DISTRICTS = ["checkout", "cart", "api", "docs", "/"];

it("maps stack frames and routes onto districts", () => {
  expect(matchDistrict("checkout/total.ts", DISTRICTS)).toBe("checkout");
  expect(matchDistrict("/checkout/pay?x=1", DISTRICTS)).toBe("checkout");
  expect(matchDistrict("src/cart.tsx", DISTRICTS)).toBe("cart");
  expect(matchDistrict("app:///api/orders.ts", DISTRICTS)).toBe("api");
  expect(matchDistrict("/nowhere", DISTRICTS)).toBe("/");
  expect(matchDistrict(undefined, DISTRICTS)).toBe("/");
});

it("turns a Sentry issue into one chunk that grows on repeats and closes on resolve", () => {
  const [created] = normalizeSentry(fakeSentry("issue.created"), "issue");
  expect(created.fingerprint).toBe("sentry:4501");
  expect(created.severity).toBe(2);
  expect(matchDistrict(created.districtHint, DISTRICTS)).toBe("checkout");
  const first = foldSignal(undefined, created);
  expect(first.source).toBe("sentry");
  expect(first.kind).toBe("bug");
  expect(first.ore?.usersAffected).toBe(112);
  // A cumulative userCount must not double count; an error event adds one user.
  const again = foldSignal(first, { ...created, rawRef: "sentry:issue:4501:again", usersTotal: 130 });
  expect(again.ore?.usersAffected).toBe(130);
  const [event] = normalizeSentry(fakeSentry("error.created"), "error");
  expect(event.fingerprint).toBe("sentry:4501");
  const third = foldSignal(again, event);
  expect(third.id).toBe(first.id);
  expect(third.ore?.count).toBe(3);
  expect(third.ore?.usersAffected).toBe(131);
  expect(normalizeSentry(fakeSentry("issue.resolved"), "issue")[0].action).toBe("resolved");
  expect(normalizeSentry({ data: {} }, "issue")).toEqual([]);
});

it("finds the topmost in-app frame", () => {
  expect(topInAppPath({ exception: { values: [{ stacktrace: { frames: [{ filename: "./cart/a.ts", in_app: true }, { filename: "node_modules/x.js", in_app: false }] } }] } })).toBe("cart/a.ts");
});

it("flags a PostHog drop on /checkout and an exception spike, and stays quiet on steady traffic", () => {
  const now = Date.parse("2026-10-26T15:00:00Z");
  const steady = analyze(fakePostHogRows(now, "steady"), "$pageview", now);
  expect(steady.signals).toEqual([]);
  expect(steady.traffic[0].route).toBe("/");
  const drop = analyze(fakePostHogRows(now, "drop"), "$pageview", now);
  const titles = drop.signals.map((s) => s.title);
  expect(titles).toContain("/checkout traffic dropped 70% yesterday");
  expect(titles.some((t) => t.startsWith("Error spike on /checkout"))).toBe(true);
  const ore = drop.signals.find((s) => s.title.includes("dropped"))!;
  expect(ore.fingerprint).toBe("posthog:$pageview:/checkout:2026-10-25");
  expect(matchDistrict(ore.districtHint, DISTRICTS)).toBe("checkout");
  // Polling again the same day folds into the same chunk instead of new ore.
  const item = foldSignal(undefined, ore);
  expect(foldSignal(item, ore)).toBe(item);
});

it("parses HogQL rows and collapses ids in routes", () => {
  expect(normalizeRoute("/orders/123/")).toBe("/orders/:id");
  expect(parseRows({ results: [["$pageview", "/a?x=1", "2026-10-25", 3, 2]] })).toEqual([{ event: "$pageview", route: "/a", day: "2026-10-25", count: 3, users: 2 }]);
  expect(() => parseRows({ error: "nope" })).toThrow();
});

async function sign(secret: string, body: string) {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return [...new Uint8Array(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(body)))].map((b) => b.toString(16).padStart(2, "0")).join("");
}

it("Sentry webhook: rejects bad signatures, needs no preview password, queues once per request id", async () => {
  const rows = new Map<string, { state: string }>();
  const queued: string[] = [];
  const env = {
    SESSION_SECRET: "test-session-secret", APP_PASSWORD: "preview-password", SENTRY_CLIENT_SECRET: "fake-sentry-client-secret", SENTRY_REPO: "example/shop", SENTRY_REPO_ID: "503", SENTRY_INSTALLATION_ID: "1",
    DB: { prepare: (sql: string) => {
      let values: unknown[] = [];
      const statement = {
        bind: (...args: unknown[]) => { values = args; return statement; },
        run: async () => { const id = String(values[0]); const existed = rows.has(id); if (!existed) rows.set(id, { state: "done" }); return { meta: { changes: existed ? 0 : 1 } }; },
        first: async () => sql.includes("signup_counters") ? {count:1} : sql.includes("FROM repos") ? { repo_id: 503, installation_id: 1 } : rows.get(String(values[0])) ?? null,
      };
      if (sql.includes("FROM deleted_factories")) return { bind: () => ({ all: async () => ({ results: [] }) }) };
      expect(sql.includes("sentry") || sql.includes("FROM repos") || sql.includes("FROM installations") || sql.includes("signup_counters")).toBe(true);

      return statement;
    } },
    FACTORY: { idFromName: (repo: string) => repo, get: (repo: string) => ({ enqueueSentry: async (id: string, resource: string) => { expect(repo).toBe("repo:503"); queued.push(`${id}:${resource}`); } }) },
  };
  env.DB = credentialDB(env.DB);
  const body = JSON.stringify(fakeSentry("issue.created"));
  const send = async (signature: string, id = "req-1") => app.fetch(new Request("https://shiptorio.com/webhooks/sentry", { method: "POST", headers: { "sentry-hook-signature": signature, "sentry-hook-resource": "issue", "request-id": id }, body }), env as never, { waitUntil: (_p: Promise<unknown>) => {} } as never);
  expect((await send("0".repeat(64))).status).toBe(401);
  const good = await sign(env.SENTRY_CLIENT_SECRET, body);
  expect((await send(good)).status).toBe(202);
  expect((await (await send(good)).json() as { duplicate?: boolean }).duplicate).toBe(true);
  expect(queued).toEqual(["example/shop:req-1:issue"]);
});

const { Factory } = await import("../src/factory");
const { FactoryState } = await import("@shiptorio/shared");
type FactoryState = import("@shiptorio/shared").FactoryState;
const { starterLine } = await import("../src/engine");

function factoryFixture(env: Record<string, unknown>) {
  const state = FactoryState.parse({ repo: "example/shop", baseBranch: "main", districts: DISTRICTS.map((name, i) => ({ name, x: i * 6, y: 0, w: 4, h: 4, files: 3 })), ...starterLine(), items: [], science: { red: 0, green: 0, grey: 0, blue: 0 }, trust: 0.5, tick: 0 });
  const data = new Map<string, unknown>([["githubAccessCheckedAt", Date.now()], ["githubRepoId", 503], ["state", structuredClone(state)], ["meta", { repo: state.repo, installationId: 1 }]]);
  const kv = new Map<string, string>();
  let alarm: number | null = null;
  const events: { type: string; text?: string }[] = [];
  const storage = {
    async transaction<T>(fn: (tx: unknown) => Promise<T>): Promise<T> { return fn(storage); },
    async get(key: string) { return structuredClone(data.get(key)); },
    async put(key: string, value: unknown) { data.set(key, structuredClone(value)); },
    async delete(key: string) { return data.delete(key); },
    async list(options: { prefix: string; limit?: number }) { return new Map([...data.entries()].filter(([key]) => key.startsWith(options.prefix)).slice(0, options.limit)); },
    async getAlarm() { return alarm; },
    async setAlarm(value: number) { alarm = value; },
  };
  const ctx = { waitUntil: (_task: Promise<unknown>) => {}, storage, blockConcurrencyWhile: <T>(fn: () => Promise<T>) => fn(), getWebSockets: () => [authorizedSocket((raw: string) => events.push(JSON.parse(raw)))] };
  const fullEnv = {
    ...browserEnv,
    DB: { prepare: () => ({ bind: () => ({ first: async () => null, run: async () => ({ success: true }), all: async () => ({ results: [] }) }) }) },
    CACHE: { get: async (k: string, type?: string) => { const v = kv.get(k); return v == null ? null : type === "json" ? JSON.parse(v) : v; }, put: async (k: string, v: string) => void kv.set(k, v), delete: async (k: string) => void kv.delete(k) },
    SENTRY_REPO: "example/shop", POSTHOG_REPO: "example/shop", SENTRY_REPO_ID: "503", SENTRY_INSTALLATION_ID: "1", POSTHOG_REPO_ID: "503", POSTHOG_INSTALLATION_ID: "1",
    ...env,
  };
  const factory = new Factory(ctx as never, credentialEnv(fullEnv) as never);
  return { factory, kv, events, saved: () => data.get("state") as FactoryState, data };
}

it("Factory: unconfigured mine answers with setup steps and a connect link for this repo", async () => {
  const f = factoryFixture({});
  const status = await f.factory.connectMine("sentry");
  expect(status?.state).toBe("needs_action");
  expect(status?.setup.actionUrl).toBe("https://shiptorio.com/connect/sentry?repo=example%2Fshop");
  expect(f.saved().machines.some((m) => m.id === "ore-sentry")).toBe(false);
});

it("Factory: Sentry mine opens a deposit, spawns biters on the right district, grows them, and counts the kill", async () => {
  const f = factoryFixture({ SENTRY_CLIENT_SECRET: "fake-sentry-client-secret" });
  expect((await f.factory.connectMine("sentry"))?.state).toBe("connected");
  expect(f.kv.get("link:sentry")).toBeUndefined();
  expect(f.saved().machines.some((m) => m.id === "ore-sentry")).toBe(true);
  expect(f.saved().belts.some((b) => b.from === "ore-sentry" && b.to === "splitter-1")).toBe(true);
  await f.factory.enqueueSentry("d1", "issue", fakeSentry("issue.created"));
  await f.factory.enqueueSentry("d2", "error", fakeSentry("error.created"));
  await f.factory.alarm();
  const ore = f.saved().items.filter((i) => i.source === "sentry");
  expect(ore.length).toBe(1);
  expect(ore[0].district).toBe("checkout");
  expect(ore[0].ore?.count).toBe(2);
  expect(f.saved().sources?.find((s) => s.kind === "sentry")?.state).toBe("connected");
  // Our fix shipped, then Sentry resolves it: biters killed.
  f.data.set("state", { ...f.saved(), items: f.saved().items.map((i) => ({ ...i, state: "launched" })) });
  const fresh = new Factory((f.factory as unknown as { ctx: never }).ctx, credentialEnv((f.factory as unknown as { env: never }).env) as never);
  await fresh.enqueueSentry("d3", "issue", fakeSentry("issue.resolved"));
  await fresh.alarm();
  expect((f.data.get("state") as { metrics?: { bitersKilled: number } }).metrics?.bitersKilled).toBe(1);
  await fresh.disconnectMine("sentry");
  expect((f.data.get("state") as { machines: { id: string }[] }).machines.some((m) => m.id === "ore-sentry")).toBe(false);
  expect(f.kv.has("link:sentry")).toBe(false);
});

it("Factory: FAKE_POSTHOG polls on the alarm and drops ore on the checkout district once per day", async () => {
  const f = factoryFixture({ FAKE_POSTHOG: "1" });
  expect((await f.factory.connectMine("posthog"))?.state).toBe("connected");
  await f.factory.alarm();
  const traffic = <T extends { source: string; ore?: { fingerprint: string } }>(items: T[]) => items.filter((i) => i.source === "posthog" && !i.ore?.fingerprint.startsWith("growth:"));
  const ore = traffic(f.saved().items);
  expect(ore.length).toBe(2);
  expect(ore.every((i) => i.district === "checkout")).toBe(true);
  expect(f.saved().sources?.find((s) => s.kind === "posthog")?.detail).toContain("Busiest routes: / ");
  // Next alarm inside the poll window does nothing new.
  await f.factory.alarm();
  expect(traffic(f.saved().items).length).toBe(2);
});

it("Factory: route traffic alone never creates a measured growth experiment", async () => {
  const f = factoryFixture({ FAKE_POSTHOG: "1" });
  await f.factory.connectMine("posthog");
  await f.factory.alarm();
  expect(f.saved().experiments ?? []).toEqual([]);
  expect(f.saved().items.some(i => i.ore?.fingerprint.startsWith("growth:"))).toBe(false);
  expect(f.saved().machines.some(m => m.id === "measure-1")).toBe(false);
});

it("Factory: keys set as Worker secrets plug the mines in on the next alarm, and stay unplugged once disconnected", async () => {
  const f = factoryFixture({ SENTRY_CLIENT_SECRET: "fake-sentry-client-secret", FAKE_POSTHOG: "1" });
  await f.factory.ensure("example/shop", 1);
  await f.factory.alarm();
  expect(f.saved().machines.filter((m) => m.id.startsWith("ore-")).map((m) => m.id).sort()).toEqual(["ore-issues", "ore-posthog", "ore-sentry"]);
  expect(f.kv.get("link:sentry")).toBeUndefined();
  await f.factory.disconnectMine("sentry");
  await f.factory.ensure("example/shop", 1);
  await f.factory.alarm();
  expect(f.saved().machines.some((m) => m.id === "ore-sentry")).toBe(false);
  // A mine already linked to another repo isn't stolen.
  const other = factoryFixture({ SENTRY_CLIENT_SECRET: "fake-sentry-client-secret", SENTRY_REPO: "example/other", SENTRY_REPO_ID: "999" });
  await other.factory.ensure("example/shop", 1);
  await other.factory.alarm();
  expect(other.saved().machines.some((m) => m.id === "ore-sentry")).toBe(false);
});


it("encrypted mines keep secret-bearing provider errors, ore, logs and browser patches redacted", async () => {
  const { saveCreds, revokeCreds } = await import("../src/sources/creds");
  const secret = "private-mine-key-never-publish-12345";
  const f = factoryFixture({ CRED_MASTER_KEY: btoa("a".repeat(32)) });
  const env = (f.factory as unknown as { env: import("../src/sources/creds").CredsEnv }).env;
  const scope = { repo: "example/shop", installationId: 1 };
  await saveCreds(env, "sentry", { clientSecret: secret }, scope);
  expect((await f.factory.connectMine("sentry"))?.state).toBe("connected");
  const payload = fakeSentry("issue.created");
  payload.data!.issue!.title = `Provider accidentally echoed ${secret}`;
  await f.factory.enqueueSentry("redact-1", "issue", payload);
  await f.factory.alarm();
  expect(f.saved().items[0].title).toContain("[REDACTED]");
  expect(JSON.stringify(f.saved())).not.toContain(secret);
  expect(JSON.stringify(f.events)).not.toContain(secret);
  await revokeCreds(env, "sentry", scope);
  await f.factory.enqueueSentry("redact-2", "issue", fakeSentry("issue.created", "4502"));
  await f.factory.alarm();
  expect(f.saved().items.some(i => i.id === "sentry:4502")).toBe(false);

  const apiKey = "phx_private_mine_key_never_publish";
  const posthog = factoryFixture({ CRED_MASTER_KEY: btoa("a".repeat(32)) });
  const postEnv = (posthog.factory as unknown as { env: import("../src/sources/creds").CredsEnv }).env;
  await saveCreds(postEnv, "posthog", { apiKey, projectId: "123" }, scope);
  await posthog.factory.connectMine("posthog");
  const original = globalThis.fetch;
  globalThis.fetch = (async () => { throw new Error(`Provider rejected ${apiKey}`); }) as unknown as typeof fetch;
  try { await posthog.factory.alarm(); } finally { globalThis.fetch = original; }
  expect(JSON.stringify(posthog.saved())).not.toContain(apiKey);
  expect(JSON.stringify(posthog.events)).not.toContain(apiKey);
  expect(posthog.saved().sources?.find(s => s.kind === "posthog")?.detail).toContain("[REDACTED]");
});

it("a failed credential hydration cannot leak state on a second request", async () => {
  const f = factoryFixture({});
  f.kv.set("cred:sentry:example/shop", JSON.stringify({ clientSecret: "unmigrated-secret-12345" }));
  await expect(f.factory.connectMine("sentry")).rejects.toThrow("Credential encryption key unavailable");
  await expect(f.factory.runnerJobs()).rejects.toThrow("Credential encryption key unavailable");
  expect(f.events).toHaveLength(0);
  expect(f.kv.has("cred:sentry:example/shop")).toBe(true);
});

it("a stale Factory cannot use credentials from a replacement at its old name", async () => {
  const { saveCreds } = await import("../src/sources/creds");
  const f = factoryFixture({ CRED_MASTER_KEY: btoa("a".repeat(32)) });
  const env = (f.factory as unknown as { env: import("../src/sources/creds").CredsEnv }).env;
  await f.factory.connectMine("sentry"); // hydrating Factory 503 fixes its expected identity
  const db = env.DB as unknown as { sqlite: import("bun:sqlite").Database };
  db.sqlite.exec("UPDATE credential_test_repos SET repo_id = 999 WHERE full_name = 'example/shop'");
  await saveCreds(env, "sentry", { clientSecret: "synthetic-replacement-key" }, { repo: "example/shop", installationId: 1 });
  expect((await f.factory.connectMine("sentry"))?.state).toBe("needs_action");
});
