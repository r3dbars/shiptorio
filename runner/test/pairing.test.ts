import { expect, test } from "bun:test";
import { mkdtemp, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { joinMachine, loadPairings, removePairing, savePairing } from "../src/pairing";
test("adding, renewing and revoking one repo preserves the other; credentials are owner-only", async () => {
  const root = await mkdtemp(resolve(tmpdir(), "shiptorio-pair-"));
  try {
    await savePairing({ repo: "you/first", token: "first-secret", expires: 10000 }, root);
    await savePairing({ repo: "you/second", token: "second-secret", expires: 20000 }, root);
    expect((await loadPairings(root)).map(p => p.repo).sort()).toEqual(["you/first", "you/second"]);
    await savePairing({ repo: "you/first", token: "renewed", expires: 30000 }, root);
    expect((await loadPairings(root)).find(p => p.repo === "you/second")?.token).toBe("second-secret");
    expect((await stat(resolve(root, "pairings/you%2Ffirst.json"))).mode & 0o777).toBe(0o600);
    expect((await stat(resolve(root, "pairings"))).mode & 0o777).toBe(0o700);
    await removePairing("you/first", root);
    expect((await loadPairings(root)).map(p => p.repo)).toEqual(["you/second"]);
    await expect(savePairing({ repo: "../bad", token: "bad", expires: 1 }, root)).rejects.toThrow("Invalid pairing");
  } finally { await rm(root, { recursive: true, force: true }); }
});

test("one-paste join trades the install command's code for a saved pairing; a spent code says so", async () => {
  const root = await mkdtemp(resolve(tmpdir(), "shiptorio-join-"));
  const good = "a".repeat(48), seen: string[] = [];
  const server = Bun.serve({ port: 0, async fetch(req) {
    const { join } = await req.json() as { join: string }; seen.push(join);
    return join === good ? Response.json({ repo: "you/repo", token: "cred", expires: Date.now() + 3600000 }) : Response.json({ error: "expired" }, { status: 410 });
  } });
  try {
    await joinMachine(`http://localhost:${server.port}`, good, root);
    expect((await loadPairings(root)).map(p => [p.repo, p.token])).toEqual([["you/repo", "cred"]]);
    await expect(joinMachine(`http://localhost:${server.port}`, "b".repeat(48), root)).rejects.toThrow("expired or was already used");
    await expect(joinMachine(`http://localhost:${server.port}`, "abc", root)).rejects.toThrow("cut off");
    expect(seen).toEqual([good, "b".repeat(48)]);
  } finally { server.stop(true); await rm(root, { recursive: true, force: true }); }
});
