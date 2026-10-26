import { expect, test } from "bun:test";
import { mkdtemp, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { loadPairings, removePairing, savePairing } from "../src/pairing";
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
