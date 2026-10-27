import { expect, spyOn, test } from "bun:test";
import { mkdtemp, readdir, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { loadConnections, persistRenewal, persistGrantRejection } from "../src/grant-store";
import { loadPairings, removePairing, savePairing, updatePairing, type Pairing } from "../src/pairing";

// Runtime imports exercise the real verifier without adding Worker-only types to the runner TS graph.
interface TestUser { id: number; login: string; sessionHash: string; expiresAt: number }
interface RunnerIdentity { repo: string; pairId: string; expires: number; user?: TestUser }
const authModule = "../../server/src/runner-auth";
const authorizationModule = "../../server/src/authorization";
const { pairToken, readRunnerToken } = await import(authModule) as {
  pairToken(secret: string, identity: RunnerIdentity): Promise<string>;
  readRunnerToken(secret: string, token: string, now?: number): Promise<RunnerIdentity | null>;
};
const { repoAccess } = await import(authorizationModule) as {
  repoAccess(env: object, user: TestUser, repo: string, authority: "write"): Promise<number | null>;
};

const signingKey = "synthetic-grant-store-test-only";
const now = Date.now();
const identity: RunnerIdentity = {
  repo: "you/repo", pairId: "synthetic-pair-a", expires: now + 60_000,
  user: { id: 42, login: "synthetic-user", sessionHash: "a".repeat(64), expiresAt: now + 86_400_000 },
};
async function grant(expires: number, change: Partial<RunnerIdentity> = {}): Promise<Pairing> {
  const claims = { ...identity, expires, ...change };
  return { repo: claims.repo, token: await pairToken(signingKey, claims), expires: claims.expires };
}
const env = (pair: Pairing) => ({ SHIPTORIO_REPO: pair.repo, SHIPTORIO_RUNNER_TOKEN: pair.token });
async function inStore(run: (root: string) => Promise<void>) {
  const root = await mkdtemp(resolve(tmpdir(), "shiptorio-grant-store-"));
  try { await run(root); } finally { await rm(root, { recursive: true, force: true }); }
}

test("a fresh same-binding environment grant replaces stale JSON and survives a restart", async () => inStore(async root => {
  const stale = await grant(now - 1), fresh = await grant(now + 120_000);
  await savePairing(stale, root);
  expect(await loadConnections(root, env(fresh))).toEqual([fresh]);
  expect(await loadConnections(root, {})).toEqual([fresh]);
  expect(await loadConnections(root, env(stale))).toEqual([fresh]);
  expect((await stat(resolve(root, "pairings/you%2Frepo.json"))).mode & 0o777).toBe(0o600);
  expect((await stat(resolve(root, "pairings"))).mode & 0o777).toBe(0o700);
}));

test("legacy environment-only setup becomes canonical JSON", async () => inStore(async root => {
  const current = await grant(now + 120_000);
  expect(await loadConnections(root, env(current))).toEqual([current]);
  expect(await loadConnections(root, {})).toEqual([current]);
}));

test("renewal survives old process environment and out-of-order same-binding responses", async () => inStore(async root => {
  const original = await grant(now + 60_000), later = await grant(now + 180_000), latest = await grant(now + 240_000);
  await savePairing(original, root);
  const first = { ...original }, second = { ...original };
  await persistRenewal(root, first, latest);
  await persistRenewal(root, second, later);
  expect(first).toEqual(latest);
  expect(second).toEqual(latest);
  expect(await loadConnections(root, env(original))).toEqual([latest]);
  expect(await loadConnections(root, {})).toEqual([latest]);
}));

test("later environment expiry cannot replace a different pairing, user, or session", async () => inStore(async root => {
  const stored = await grant(now + 60_000);
  await savePairing(stored, root);
  const changed: Partial<RunnerIdentity>[] = [
    { pairId: "synthetic-pair-b" },
    { user: { ...identity.user!, id: 43 } },
    { user: { ...identity.user!, sessionHash: "b".repeat(64) } },
    { user: { ...identity.user!, expiresAt: identity.user!.expiresAt + 1 } },
    { user: undefined },
  ];
  for (const binding of changed) {
    const other = await grant(now + 240_000, binding);
    expect(await loadConnections(root, env(other))).toEqual([stored]);
    expect(await loadPairings(root)).toEqual([stored]);
  }
}));

test("manual re-pairing or deletion wins over an in-flight renewal without mutating its object", async () => inStore(async root => {
  const old = await grant(now + 60_000), renewed = await grant(now + 240_000);
  const replacement = await grant(now + 120_000, { pairId: "synthetic-new-manual-pair" });
  await savePairing(old, root);
  await savePairing(replacement, root);
  const running = { ...old };
  await expect(persistRenewal(root, running, renewed)).rejects.toThrow("Pairing changed");
  expect(running).toEqual(old);
  expect(await loadPairings(root)).toEqual([replacement]);
  await removePairing(old.repo, root);
  await expect(persistRenewal(root, running, renewed)).rejects.toThrow("Pairing changed");
  expect(running).toEqual(old);
  expect(await loadPairings(root)).toEqual([]);
}));

test("renewal cannot change its identity or persist inconsistent expiry metadata", async () => inStore(async root => {
  const old = await grant(now + 60_000);
  await savePairing(old, root);
  const replacement = await grant(now + 240_000, { pairId: "synthetic-other-pair" });
  await expect(persistRenewal(root, old, replacement)).rejects.toThrow("identity");
  const renewed = await grant(now + 180_000);
  await expect(persistRenewal(root, old, { ...renewed, expires: renewed.expires + 1 })).rejects.toThrow("Invalid stored runner grant");
  expect(await loadPairings(root)).toEqual([old]);
}));

test("failed durable writes leave the running object and disk unchanged and release the lock", async () => inStore(async root => {
  const old = await grant(now + 60_000), renewed = await grant(now + 240_000);
  await savePairing(old, root);
  const running = { ...old };
  const write = spyOn(Bun, "write").mockImplementation(() => { throw new Error("synthetic disk failure"); });
  try { await expect(persistRenewal(root, running, renewed)).rejects.toThrow("synthetic disk failure"); }
  finally { write.mockRestore(); }
  expect(running).toEqual(old);
  expect(await loadPairings(root)).toEqual([old]);
  expect(await readdir(resolve(root, "pairings"))).toEqual(["you%2Frepo.json"]);
  await persistRenewal(root, running, renewed);
  expect(running).toEqual(renewed);
}));

test("local copy reconciliation never extends a server-expired grant or expired session", async () => inStore(async root => {
  const expired = await grant(now - 1);
  await savePairing(expired, root);
  const [stored] = await loadConnections(root, env(expired));
  expect(await readRunnerToken(signingKey, stored.token, now)).toBeNull();
  const sessionExpired = await grant(now + 120_000, { user: { ...identity.user!, expiresAt: now - 1 } });
  await savePairing(sessionExpired, root);
  const [selected] = await loadConnections(root, {});
  const claims = await readRunnerToken(signingKey, selected.token, now);
  // Token signature validity does not renew the embedded browser session.
  expect(claims?.user?.expiresAt).toBeLessThan(now);
  expect(await repoAccess({}, claims!.user!, selected.repo, "write")).toBeNull();
  expect(selected).toEqual(sessionExpired);
}));

test("manual pairing in another process shares the renewal store lock", async () => inStore(async root => {
  const old = await grant(now + 60_000), manual = await grant(now + 240_000, { pairId: "synthetic-manual-process" });
  await savePairing(old, root);
  let release!: () => void, entered!: () => void;
  const gate = new Promise<void>(done => { release = done; });
  const held = new Promise<void>(done => { entered = done; });
  const writer = updatePairing(old.repo, root, async current => { entered(); await gate; return current; });
  await held;
  const module = new URL("../src/pairing.ts", import.meta.url).href;
  const code = `import { savePairing } from ${JSON.stringify(module)}; console.log("started"); await savePairing(${JSON.stringify(manual)}, ${JSON.stringify(root)});`;
  const child = Bun.spawn([process.execPath, "--eval", code], { stdout: "pipe", stderr: "pipe", env: { PATH: process.env.PATH ?? "" } });
  try {
    const reader = child.stdout.getReader();
    expect(new TextDecoder().decode((await reader.read()).value)).toContain("started");
    reader.releaseLock();
    await Bun.sleep(60);
    expect(child.exitCode).toBeNull();
    expect(await loadPairings(root)).toEqual([old]);
    release();
    await writer;
    expect(await child.exited).toBe(0);
    expect(await loadPairings(root)).toEqual([manual]);
  } finally { release(); await writer; child.kill(); await child.exited; }
}));


test("permanent rejection is durable without deleting evidence, and a fresh pairing clears it", async () => {
  await inStore(async root => {
    const original = await grant(now + 60000);
    await savePairing(original, root);
    await persistGrantRejection(root, original, "runner_pair_revoked", now);
    const [stopped] = await loadConnections(root, env(original));
    expect(stopped.rejected).toEqual({code: "runner_pair_revoked", at: now});
    expect(stopped.token).toBe(original.token);
    const fresh = await grant(now + 120000, {pairId: "fresh-pair"});
    await savePairing(fresh, root);
    // A delayed old response cannot stop the newly paired machine.
    await persistGrantRejection(root, original, "runner_grant_expired", now);
    expect((await loadConnections(root, env(original)))[0]).toEqual(fresh);
  });
});
