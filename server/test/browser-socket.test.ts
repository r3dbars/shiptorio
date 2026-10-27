import { credentialEnv } from "./credential-fixture";
import { authorizedDB, membershipCache } from "./browser-fixture";
import { describe, expect, it, mock } from "bun:test";
import { browserSocketAllowed, browserSocketAuth, browserSocketEpoch } from "../src/browser-socket";
import { makeSessionCookie } from "../src/session";
import { authorizedSocket, browserCookies, browserEnv } from "./browser-fixture";
import { FactoryState } from "@shiptorio/shared";
import { starterLine } from "../src/engine";
mock.module("cloudflare:workers", () => ({ DurableObject: class { constructor(public ctx: unknown, public env: unknown) {} } }));
const { Factory } = await import("../src/factory");

const request = (cookie: string) => new Request("https://shiptorio.com/api/repos/owner/repo/factory", { headers: { cookie, upgrade: "websocket" } });
describe("privileged browser socket lifetime", () => {
  it("requires both login and preview cookies and retains their earliest expiry", async () => {
    expect(await browserSocketAuth(request(""), browserEnv)).toBeNull();
    const login = (await makeSessionCookie(browserEnv.SESSION_SECRET, "test-player")).split(";")[0];
    expect(await browserSocketAuth(request(login), browserEnv)).toBeNull();
    const auth = await browserSocketAuth(request(await browserCookies()), browserEnv);
    expect(auth?.login).toBe("test-player");
    expect(auth?.expiresAt).toBeGreaterThan(Date.now());
    expect(JSON.stringify(auth)).not.toContain(browserEnv.SESSION_SECRET);
    expect(JSON.stringify(auth)).not.toContain(browserEnv.APP_PASSWORD!);
    const old = Date.now() - 13 * 86400000;
    const preview = (await makeSessionCookie(`${browserEnv.SESSION_SECRET}:${browserEnv.APP_PASSWORD}`, "preview", old)).split(";")[0].replace("shiptorio_session=", "shiptorio_access=");
    const early = await browserSocketAuth(request(`${login}; ${preview}`), browserEnv);
    expect(early!.expiresAt).toBeLessThan(auth!.expiresAt);
    expect(await browserSocketAuth(request(await browserCookies()), { ...browserEnv, APP_PASSWORD: "rotated" })).toBeNull();
  });
  it("rejects expired, missing, revoked and rotated attachments", async () => {
    const auth = await browserSocketAuth(request(await browserCookies()), browserEnv);
    const epoch = await browserSocketEpoch(browserEnv);
    expect(browserSocketAllowed(auth, browserEnv, epoch)).toBe(true);
    expect(browserSocketAllowed(undefined, browserEnv, epoch)).toBe(false);
    expect(browserSocketAllowed(auth, browserEnv, epoch, auth!.expiresAt)).toBe(false);
    expect(browserSocketAllowed(auth, { ...browserEnv, ALLOWED_LOGINS: "another-player" }, epoch)).toBe(false);
    for (const env of [{ ...browserEnv, APP_PASSWORD: "rotated" }, { ...browserEnv, CACHE: membershipCache, SESSION_SECRET: "rotated" }, { ...browserEnv, CACHE: membershipCache, ALLOWED_LOGINS: "test-player,another-player" }]) {
      expect(browserSocketAllowed(auth, env, await browserSocketEpoch(env))).toBe(false);
    }
  });
  it("denies expired or legacy connections before player actions and stops their broadcasts", async () => {
    const state = FactoryState.parse({ repo: "owner/repo", baseBranch: "main", districts: [], ...starterLine(), items: [], science: { red: 0, green: 0, grey: 0, blue: 0 }, trust: 0.5, tick: 0 });
    const data = new Map<string, unknown>([["state", state], ["meta", { repo: state.repo, installationId: 1 }]]);
    const sent: string[] = [], closed: number[] = [];
    const active = authorizedSocket(raw => sent.push(raw), "owner/repo");
    const expired = authorizedSocket(() => { throw new Error("Expired connection received private data"); });
    expired.serializeAttachment({ ...expired.deserializeAttachment(), expiresAt: Date.now() - 1 });
    expired.close = (code?: number) => { closed.push(code!); };
    const legacy = { deserializeAttachment: () => null, close: (code: number) => closed.push(code) } as unknown as WebSocket;
    const env = { ...browserEnv, CACHE: membershipCache, DB: { prepare: () => ({ bind: () => ({ all: async () => ({ results: [] }) }) }) } };
    const storage = { transaction: async <T>(fn: (tx: unknown) => Promise<T>): Promise<T> => fn(storage), get: async (key: string) => structuredClone(data.get(key)), put: async (key: string, value: unknown) => { data.set(key, structuredClone(value)); }, list: async () => new Map(), getAlarm: async () => null, setAlarm: async () => {} };
    env.DB = authorizedDB(env.DB);
    const f = new Factory({ storage, getWebSockets: () => [active, expired], blockConcurrencyWhile: (fn: () => unknown) => fn() } as never, credentialEnv(env) as never);

    const action = JSON.stringify({ type: "place_machine", machineType: "assembler", x: 22, y: 22 });
    const before = state.machines.length;
    await f.webSocketMessage(expired, action);
    await f.webSocketMessage(legacy, action);
    expect((data.get("state") as FactoryState).machines).toHaveLength(before);
    await f.webSocketMessage(active, action);
    expect((data.get("state") as FactoryState).machines).toHaveLength(before + 1);
    expect(sent.length).toBeGreaterThan(0);
    expect(closed.every(code => code === 1008)).toBe(true);
    expect(closed.length).toBeGreaterThanOrEqual(3);
    env.APP_PASSWORD = "rotated";
    active.close = (code?: number) => { closed.push(code!); };
    await f.webSocketMessage(active, action);
    expect((data.get("state") as FactoryState).machines).toHaveLength(before + 1);
  });
});

it("browser transport cursors persist across hibernation and snapshots do not advance them", async () => {
  const { browserFrame, browserHeartbeat } = await import("../src/browser-socket");
  const data = new Map<string, unknown>();
  const storage = { get: async (key: string) => data.get(key), put: async (key: string, value: unknown) => { data.set(key, value); } } as Pick<DurableObjectStorage, "get" | "put">;
  const frame = { type: "log", level: "info", text: "Current", at: 1 };
  expect(JSON.parse(await browserFrame(storage, { type: "snapshot" }, false)).seq).toBe(0);
  expect(JSON.parse(await browserFrame(storage, frame))).toEqual({ ...frame, seq: 1 });
  expect(JSON.parse(await browserFrame({ ...storage }, { type: "snapshot" }, false)).seq).toBe(1);
  expect(JSON.parse(await browserFrame({ ...storage }, frame)).seq).toBe(2);
  const sent: string[] = [];
  const ws = { send: (raw: string) => { sent.push(raw); } };
  expect(browserHeartbeat(ws, "ping")).toBe(true);
  expect(browserHeartbeat(ws, '{"type":"launch_pr"}')).toBe(false);
  expect(sent).toEqual(["pong"]);
});

it("allocates ordered cursors before delivery and fences a concurrent snapshot", async () => {
  const { BrowserFrames } = await import("../src/browser-socket");
  const data = new Map<string, unknown>();
  const storage = { get: async (key: string) => data.get(key), put: async (key: string, value: unknown) => { data.set(key, value); } } as Pick<DurableObjectStorage, "get" | "put">;
  const frames = new BrowserFrames(storage);
  const out = await Promise.all([frames.frame({ type: "patch" }), frames.frame({ type: "snapshot" }, false), frames.frame({ type: "patch" })]);
  expect(out.map(raw => JSON.parse(raw).seq)).toEqual([1, 1, 2]);
});
