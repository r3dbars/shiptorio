import { signedInCookie, testD1 } from "./d1-fixture";
import { makeSessionCookie } from "../src/session";
import { expect, mock, test } from "bun:test";
import { pollDevice, secretHash, type DeviceRecord } from "../src/device-pairing";
import { pairToken, readRunnerToken } from "../src/runner-auth";
import { browserCookies, browserEnv } from "./browser-fixture";
mock.module("cloudflare:workers", () => ({ DurableObject: class { constructor(public ctx: unknown, public env: unknown) {} } }));
const { Factory } = await import("../src/factory");
const { default: app } = await import("../src/index");

test("device retrieval requires its secret, explicit activation, expiry and single consumption", () => {
  const record: DeviceRecord = { secret: "hash", expires: 10000, approved: { repo: "you/repo", token: "credential", expires: 30000 } };
  expect(pollDevice(record, "wrong", 1000).status).toBe("expired");
  expect(pollDevice(record, "hash", 1000).status).toBe("pending");
  record.ready = true;
  expect(pollDevice(record, "hash", 1100).status).toBe("slow_down");
  expect(pollDevice(record, "hash", 4000)).toEqual({ status: "approved", repo: "you/repo", token: "credential", expires: 30000 });
  expect(record.approved).toBeUndefined();
  expect(pollDevice(record, "hash", 7000).status).toBe("expired");
  expect(pollDevice({ secret: "hash", expires: 1000 }, "hash", 1000).status).toBe("expired");
});

test("browser pairing: session + origin + repo permission, terminal-only delivery, replay, revocation and rate limit", async () => {
  const key = await crypto.subtle.generateKey({ name: "RSASSA-PKCS1-v1_5", modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: "SHA-256" }, true, ["sign", "verify"]);
  const pem = `-----BEGIN PRIVATE KEY-----\n${Buffer.from(await crypto.subtle.exportKey("pkcs8", key.privateKey)).toString("base64")}\n-----END PRIVATE KEY-----`;
  const stores = new Map<string, Map<string, any>>(), instances = new Map<string, InstanceType<typeof Factory>>();
  const env = { ASSETS: { fetch: async () => new Response("static runner docs: uninstall") }, ...browserEnv, GITHUB_APP_ID: "1", GITHUB_APP_PRIVATE_KEY: pem, DB: testD1(), FACTORY: { idFromName: (s: string) => s, get(name: string) {
    if (!instances.has(name)) {
      const data = new Map<string, any>(); stores.set(name, data);
      let serial: Promise<unknown> = Promise.resolve();
      const ctx = { waitUntil() {}, storage: { transaction<T>(fn: (tx: unknown) => Promise<T>): Promise<T> { return fn(this); }, get: async (key: string) => structuredClone(data.get(key)), put: async (key: string, value: unknown) => { data.set(key, structuredClone(value)); }, delete: async (key: string) => data.delete(key), list: async ({ prefix }: { prefix: string }) => new Map([...data].filter(([key]) => key.startsWith(prefix))), setAlarm: async () => {}, deleteAll: async () => data.clear() }, blockConcurrencyWhile(fn: () => Promise<unknown>) { const result = serial.then(fn); serial = result.catch(() => {}); return result; } };
      const f = new Factory(ctx as never, env as never); f.ensure = async () => {};
      instances.set(name, f);
    }
    return instances.get(name)!;
  } } };
  const original = globalThis.fetch;
  let permission = "write";
  globalThis.fetch = (async (input: any) => {
    const url = String(input);
    if (url.endsWith("/access_tokens")) return Response.json({ token: "install-token", expires_at: new Date(Date.now() + 3600000).toISOString() });
    if (url.includes("/collaborators/test-player/permission")) return Response.json({ permission, user: { id: 77 } });
    if (/\/repos\/you\/[^/]+\/installation$/.test(url)) return Response.json({ id: 1 });
    throw new Error(`Unexpected network ${url}`);
  }) as typeof fetch;
  const request = (path: string, init: RequestInit = {}) => app.fetch(new Request(`https://shiptorio.com${path}`, init), env as never);
  try {
    const help = await request("/docs/runner"); expect(help.status).toBe(200); expect(await help.text()).toContain("uninstall");
    const start = await request("/api/runner-device/start", { method: "POST" });
    expect(start.status).toBe(200); expect(start.headers.get("cache-control")).toBe("no-store");
    const d = await start.json() as { code: string; secret: string; verificationUri: string };
    const path = `/runner/pair?code=${d.code}`;
    expect((await request(path)).status).toBe(401); // preview gate
    const cookies = await signedInCookie(env, "test-player", ["you/repo", "you/second"], 77) + "; " + (await makeSessionCookie(`${browserEnv.SESSION_SECRET}:${browserEnv.APP_PASSWORD}`, "preview")).split(";")[0].replace("shiptorio_session=", "shiptorio_access=");
    const page = await request(path, { headers: { cookie: cookies } });
    expect(page.status).toBe(200); expect(await page.text()).toContain(d.code);
    const approve = (repo = "you/repo", origin = "https://shiptorio.com") => request(path, { method: "POST", headers: { cookie: cookies, origin }, body: new URLSearchParams({ repo }) });
    expect((await approve("you/repo", "https://evil.test")).status).toBe(403);
    expect((await approve("stranger/private")).status).toBe(403);
    permission = "read"; expect((await approve()).status).toBe(403); permission = "write";
    const poll = (secret = d.secret) => request("/api/runner-device/poll", { method: "POST", body: JSON.stringify({ code: d.code, secret }) });
    expect(await (await poll("x".repeat(72))).json()).toEqual({ status: "expired" });
    const approved = await approve(); expect(approved.status).toBe(200); expect(await approved.text()).not.toContain('"token"');
    const result = await (await poll()).json() as { repo: string; token: string; status: string };
    expect(result.status).toBe("approved"); expect(result.repo).toBe("you/repo");
    const claims = await readRunnerToken(browserEnv.SESSION_SECRET, result.token);
    expect(claims?.repo).toBe("you/repo"); expect(await instances.get("you/repo")!.isRunnerPaired(claims!.pairId)).toBe(true);
    expect((await approve()).status).toBe(409);
    expect(await (await poll()).json()).toEqual({ status: "expired" });
    const heartbeat = () => request("/api/runner/you/repo/heartbeat", { method: "POST", headers: { authorization: `Bearer ${result.token}` }, body: JSON.stringify({ harnesses: ["codex"] }) });
    expect((await heartbeat()).status).toBe(200);
    const status = await request("/api/repos/you/repo/runner/status", { headers: { cookie: cookies } });
    expect(await status.json()).toMatchObject({ online: true, paired: true, harnesses: ["codex"], lastJob: null });
    expect((await request("/api/runner/you/second/heartbeat", { method: "POST", headers: { authorization: `Bearer ${result.token}` } })).status).toBe(401);
    await instances.get("you/repo")!.revokeRunner(); expect((await heartbeat()).status).toBe(401);
    for (let i = 0; i < 9; i++) expect((await request("/api/runner-device/start", { method: "POST" })).status).toBe(200);
    expect((await request("/api/runner-device/start", { method: "POST" })).status).toBe(429);
    const record = stores.get(`device:${d.code.toLowerCase()}`)!.get("device");
    expect(record.approved).toBeUndefined(); expect(record.secret).toBe(await secretHash(d.secret));
  } finally { globalThis.fetch = original; }
}, 30000);
