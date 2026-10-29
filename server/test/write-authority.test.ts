import { afterEach, expect, mock, test } from "bun:test";
import { generateKeyPairSync } from "node:crypto";
import { signedInCookie, testD1 } from "./d1-fixture";
import { makeSessionCookie } from "../src/session";
import { repoAccess, requireUser } from "../src/authorization";
import { browserSocketEpoch } from "../src/browser-socket";
import { pairToken } from "../src/runner-auth";
import { starterLine } from "../src/engine";
import { FactoryState } from "@shiptorio/shared";
mock.module("cloudflare:workers", () => ({ DurableObject: class { constructor(public ctx: unknown, public env: unknown) {} } }));
const { testApp: app } = await import("./app-fixture");
const { Factory } = await import("../src/factory");
const original = globalThis.fetch;
afterEach(() => { globalThis.fetch = original; });

async function fixture() {
  const secret = "write-authority-test", password = "preview-test";
  const { privateKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
  let permission = "read", offline = false, calls = 0;
  const grants = new Map<string, unknown>();
  const env = {
    SESSION_SECRET: secret, APP_PASSWORD: password, ALLOWED_LOGINS: "reader", DB: testD1(),
    GITHUB_APP_ID: "123", GITHUB_APP_PRIVATE_KEY: privateKey.export({ type: "pkcs8", format: "pem" }).toString(),
    CACHE: { get: async (key: string) => grants.get(key) ?? null, put: async (key: string, value: string) => { if (key.startsWith("access:")) grants.set(key, JSON.parse(value)); } },
    FACTORY: { idFromName: (name: string) => name, get: (name: string) => {
      if (name.startsWith("security:")) return { securityLimit: async () => ({ allowed: true, retryAfter: 0 }) };
      calls++;
      return { startInboxIssue: async () => ({ waitingFor: 27 }), runnerJobs: async () => [], ensure: async () => {}, pairRunner: async () => "pair", recordRunnerGrant: async () => {}, revokeRunner: async () => {}, isRunnerPaired: async () => true };
    } },
  };
  const cookie = `${await signedInCookie(env, "reader", ["owner/repo"], 42)}; ${(await makeSessionCookie(`${secret}:${password}`, "preview")).split(";")[0].replace("shiptorio_session=", "shiptorio_access=")}`;
  const request = (path: string, method = "GET", body?: string) => app.fetch(new Request(`https://shiptorio.com${path}`, { method, headers: { cookie, origin: "https://shiptorio.com" }, body }), env as never);
  globalThis.fetch = (async (input: RequestInfo | URL) => {
    if (offline) return new Response("unavailable", { status: 503 });
    const path = new URL(String(input)).pathname;
    if (path.endsWith("/installation")) return Response.json({ id: 1 });
    if (path.endsWith("/access_tokens")) return Response.json({ token: "fixture-installation", expires_at: new Date(Date.now() + 3600000).toISOString() });
    if (path.endsWith("/permission")) return Response.json({ permission, user: { id: 42 } });
    throw new Error(`Unexpected request ${path}`);
  }) as typeof fetch;
  const user = (await requireUser(new Request("https://shiptorio.com", { headers: { cookie } }), env as never))!;
  return { env, cookie, request, user, grants, calls: () => calls, permission: (value: string) => { permission = value; }, offline: () => { offline = true; } };
}

test("read and triage can view jobs but cannot pair, revoke, enqueue or manage connectors", async () => {
  const f = await fixture();
  for (const role of ["read", "triage"]) {
    f.permission(role); f.grants.clear();
    expect((await f.request("/api/repos/owner/repo/runner/jobs")).status).toBe(200);
    const before = f.calls();
    for (const path of ["/api/repos/owner/repo/runner/pair", "/api/repos/owner/repo/runner/revoke", "/api/repos/owner/repo/runner/jobs", "/api/repos/owner/repo/issues/16/start", "/connect/sentry?repo=owner/repo", "/connect/posthog?repo=owner/repo", "/connect/support?repo=owner/repo"]) {
      expect((await f.request(path, "POST", "{}")).status).toBe(403);
    }
    expect((await f.request("/connect/support?repo=owner/repo")).status).toBe(403);
    expect(f.calls()).toBe(before);
  }
  for (const role of ["write", "maintain", "admin"]) {
    f.permission(role); f.grants.clear();
    expect((await f.request("/api/repos/owner/repo/runner/pair", "POST")).status).toBe(200);
  }
}, 60000);

test("old read grants cannot authorize writes; expired writer grants and provider errors fail closed", async () => {
  const f = await fixture();
  f.grants.set("access:v2:1:owner/repo:42", { expiresAt: Date.now() + 59000 });
  expect(await repoAccess(f.env as never, f.user, "owner/repo")).toBe(1);
  expect(await repoAccess(f.env as never, f.user, "owner/repo", "write")).toBeNull();
  f.permission("write");
  expect(await repoAccess(f.env as never, f.user, "owner/repo", "write")).toBe(1);
  f.grants.set("access:v2:write:1:owner/repo:42", { expiresAt: Date.now() - 1 });
  f.offline();
  expect(await repoAccess(f.env as never, f.user, "owner/repo", "write")).toBeNull();
}, 30000);

test("runner grants and existing sockets lose mutation authority after downgrade", async () => {
  const f = await fixture();
  const token = await pairToken(f.env.SESSION_SECRET, { repo: "owner/repo", pairId: "pair", expires: Date.now() + 60000, user: f.user });
  for (const action of ["claim", "renew", "finish", "heartbeat"]) {
    const response = await app.fetch(new Request(`https://shiptorio.com/api/runner/owner/repo/${action}`, { method: "POST", headers: { authorization: `Bearer ${token}` }, body: "{}" }), f.env as never);
    expect(response.status).toBe(403);
  }
  expect(f.calls()).toBe(0);
  const state = FactoryState.parse({ repo: "owner/repo", baseBranch: "main", districts: [], ...starterLine(), items: [], science: { red: 0, green: 0, grey: 0, blue: 0 }, trust: 0.5, tick: 0 });
  const data = new Map<string, unknown>([["state", state], ["meta", { repo: state.repo, installationId: 1 }]]);
  const storage = { transaction: async <T>(fn: (tx: unknown) => Promise<T>) => fn(storage), get: async (key: string) => structuredClone(data.get(key)), put: async (key: string, value: unknown) => { data.set(key, structuredClone(value)); } };
  let closed = 0;
  const auth = { user: f.user, repo: state.repo, login: "reader", expiresAt: Date.now() + 60000, epoch: await browserSocketEpoch(f.env) };
  const ws = { deserializeAttachment: () => auth, close: () => { closed++; }, send() {} } as unknown as WebSocket;
  const factory = new Factory({ storage, getWebSockets: () => [], blockConcurrencyWhile: (fn: () => unknown) => fn(), waitUntil() {} } as never, f.env as never);
  for (const command of [{ type: "set_goal", text: "unauthorized" }, { type: "choose_move", moveId: "launch", optionId: "launch" }, { type: "set_autonomy", district: "docs", permit: true }]) await factory.webSocketMessage(ws, JSON.stringify(command));
  expect(closed).toBe(3);
  expect((data.get("state") as typeof state).goal).toBeUndefined();
}, 30000);


test("starting an inbox issue requires a same-origin writer and reports the existing PR", async () => {
  const f = await fixture(); f.permission("write");
  const response = await f.request("/api/repos/owner/repo/issues/16/start", "POST");
  expect(response.status).toBe(409);
  expect(await response.json()).toEqual({error:"Finish PR #27 before starting another issue."});
  const before = f.calls();
  const forged = await app.fetch(new Request("https://shiptorio.com/api/repos/owner/repo/issues/16/start", {method:"POST",headers:{cookie:f.cookie,origin:"https://unrelated.example"}}), f.env as never);
  expect(forged.status).toBe(403);
  expect((await f.request("/api/repos/owner/repo/issues/0/start", "POST")).status).toBe(400);
  expect(f.calls()).toBe(before);
},30000);
