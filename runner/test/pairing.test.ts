import { expect, spyOn, test } from "bun:test";
import { mkdtemp, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { joinMachine, loadPairings, pairMachine, removePairing, savePairing } from "../src/pairing";
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

test.skipIf(process.env.SHIPTORIO_CHECK_SANDBOX === "1")("one-paste join trades the install command's code for a saved pairing; a spent code says so", async () => {
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

test.skipIf(process.env.SHIPTORIO_CHECK_SANDBOX === "1")("browser pairing keeps waiting through a dropped connection or a busy server instead of burning the code", async () => {
  const root = await mkdtemp(resolve(tmpdir(), "shiptorio-device-"));
  let polls = 0;
  const server = Bun.serve({ hostname: "127.0.0.1", port: 0, async fetch(req) {
    const base = new URL(req.url).origin;
    const path = new URL(req.url).pathname;
    if (req.method !== "POST") return new Response("not found", { status: 404 });
    if (path === "/api/runner-device/start") return Response.json({ code: "AAAA-BBBB-CCCC", secret: "s", expires: Date.now() + 60000, verificationUri: `${base}/runner/pair?code=AAAA-BBBB-CCCC` });
    if (path !== "/api/runner-device/poll") return new Response("not found", { status: 404 });
    polls++;
    if (polls === 1) return Response.json({ error: "busy" }, { status: 503 });
    if (polls === 2) return Response.json({ status: "pending" });
    return Response.json({ status: "approved", repo: "you/repo", token: "cred", expires: Date.now() + 3600000 });
  } });
  const base = `http://127.0.0.1:${server.port}`;
  const realFetch = globalThis.fetch, realWhich = Bun.which.bind(Bun);
  const opener = spyOn(Bun, "which").mockImplementation((name, options) => name === "open" || name === "xdg-open" ? null : realWhich(name, options));
  let dropped = false;
  globalThis.fetch = (async (url: string | URL | Request, init?: RequestInit) => {
    if (!dropped && String(url) === `${base}/api/runner-device/poll`) { dropped = true; throw Object.assign(new Error("socket hang up"), { code: "ECONNRESET" }); }
    return realFetch(url, init);
  }) as typeof fetch;
  try {
    const unrelated = await realFetch(`${base}/runner/pair?code=AAAA-BBBB-CCCC`);
    expect(unrelated.status).toBe(404);
    await unrelated.body?.cancel();
    expect(polls).toBe(0);
    await pairMachine(base, root, 5);
    expect(opener).toHaveBeenCalledWith(process.platform === "darwin" ? "open" : "xdg-open");
    expect(dropped).toBe(true);
    expect(polls).toBe(3);
    expect((await loadPairings(root)).map(p => p.token)).toEqual(["cred"]);
  } finally { globalThis.fetch = realFetch; opener.mockRestore(); server.stop(true); await rm(root, { recursive: true, force: true }); }
});
