import { expect, mock, test } from "bun:test";
import { testD1, signedInCookie } from "./d1-fixture";
import { repoAccess, requireUser } from "../src/authorization";
import { browserSocketEpoch } from "../src/browser-socket";
import { starterLine } from "../src/engine";
import { FactoryState } from "@shiptorio/shared";
mock.module("cloudflare:workers", () => ({ DurableObject: class { constructor(public ctx: unknown, public env: unknown) {} } }));
const { Factory } = await import("../src/factory");

async function fixture() {
  const DB = testD1();
  const env = { DB, SESSION_SECRET: "batch-test-session", APP_PASSWORD: "batch-test-preview", ALLOWED_LOGINS: "alice", GITHUB_APP_ID: "unused", GITHUB_APP_PRIVATE_KEY: "unused", CACHE: { get: async () => ({ expiresAt: Date.now() + 59000 }) } };
  const cookie = await signedInCookie(env, "alice", ["alice/private"], 11);
  const user = (await requireUser(new Request("https://shiptorio.com", { headers: { cookie } }), env as never))!;
  const state = FactoryState.parse({ repo: "alice/private", baseBranch: "main", districts: [], ...starterLine(), items: [], science: { red: 0, green: 0, grey: 0, blue: 0 }, trust: 0.5, tick: 0 });
  const data = new Map<string, unknown>([["state", state], ["meta", { repo: state.repo, installationId: 1 }]]);
  const storage = { transaction: async <T>(fn: (tx: unknown) => Promise<T>): Promise<T> => fn(storage), get: async (key: string) => structuredClone(data.get(key)), put: async (key: string, value: unknown) => { data.set(key, structuredClone(value)); } };
  let sent = 0, closed = 0, batches = 0, fail = false;
  const statements: string[][] = [];
  const batch = DB.batch.bind(DB);
  DB.batch = async <T>(list: D1PreparedStatement[]) => {
    batches++;
    statements.push(list.map(s => (s as unknown as { sql: string }).sql));
    if (fail) throw Error("D1 batch unavailable");
    return batch<T>(list);
  };
  const auth = { user, repo: state.repo, login: "alice", expiresAt: user.expiresAt, epoch: await browserSocketEpoch(env) };
  const ws = { deserializeAttachment: () => auth, close: () => { closed++; }, send: () => { sent++; } } as unknown as WebSocket;
  const factory = new Factory({ storage, getWebSockets: () => [ws], blockConcurrencyWhile: (fn: () => unknown) => fn(), waitUntil() {} } as never, env as never);
  await factory.exportState();
  const frame = () => (factory as unknown as { broadcast(message: unknown): Promise<void> }).broadcast({ type: "snapshot", state });
  return { DB, env, user, frame, sent: () => sent, closed: () => closed, batches: () => batches, statements, fail: () => { fail = true; } };
}

test("cached visibility still reads all three relationships once per frame in one batch", async () => {
  const f = await fixture();
  await f.frame(); await f.frame();
  expect(f.sent()).toBe(2); expect(f.closed()).toBe(0); expect(f.batches()).toBe(2);
  expect(f.statements[0]).toEqual([
    "SELECT id FROM installations WHERE id = ?",
    "SELECT installation_id FROM user_repos WHERE user_id = ? AND repo = ?",
    "SELECT installation_id FROM user_installations WHERE user_id = ? AND installation_id = ?",
  ]);
});

for (const sql of ["DELETE FROM installations WHERE id = 1", "DELETE FROM user_repos WHERE user_id = 11", "DELETE FROM user_installations WHERE user_id = 11"]) {
  test(`an existing socket is denied after ${sql.split(" ")[2]} revocation despite a warm grant`, async () => {
    const f = await fixture();
    await f.frame(); expect(f.sent()).toBe(1);
    await f.DB.prepare(sql).run();
    await f.frame();
    expect(f.sent()).toBe(1); expect(f.closed()).toBe(1);
    expect(await repoAccess(f.env as never, f.user, "alice/private")).toBeNull();
  });
}

test("a membership installation mismatch cannot reuse a positive visibility grant", async () => {
  const f = await fixture();
  await f.DB.prepare("INSERT INTO installations(id, account_login) VALUES (2, 'other')").run();
  await f.DB.prepare("UPDATE user_repos SET installation_id = 2 WHERE user_id = 11").run();
  await f.frame();
  expect(f.sent()).toBe(0); expect(f.closed()).toBe(1);
});

test("batch errors close the socket without delivering a frame or falling back", async () => {
  const f = await fixture(); f.fail();
  await expect(repoAccess(f.env as never, f.user, "alice/private")).rejects.toThrow("D1 batch unavailable");
  await f.frame();
  expect(f.sent()).toBe(0); expect(f.closed()).toBe(1); expect(f.batches()).toBe(2);
});

for (const sql of ["DELETE FROM sessions WHERE user_id = 11", "INSERT INTO signup_allowlist(login, enabled, approved_by, updated_at) VALUES ('alice', 0, 'fixture', 0)"]) {
  test(`session/signup early denial never reaches relationship batching: ${sql.split(" ")[2]}`, async () => {
    const f = await fixture();
    await f.DB.prepare(sql).run();
    await f.frame();
    expect(f.sent()).toBe(0); expect(f.closed()).toBe(1); expect(f.batches()).toBe(0);
  });
}
