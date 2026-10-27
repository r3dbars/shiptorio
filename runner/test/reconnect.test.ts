import { expect, test } from "bun:test";
import { chmod, mkdtemp, rm, mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { savePairing } from "../src/pairing";

// Exercise the shipped polling loop with a real HTTP server and an isolated fake subscription CLI.
test.skipIf(process.platform !== "darwin")("watch reconnects after HTTP drops and reports unavailable auth without exiting", async () => {
  const root = await mkdtemp(resolve(tmpdir(), "shiptorio-reconnect-"));
  const bin = resolve(root, "bin"); await mkdir(bin);
  await Bun.write(resolve(bin, "codex"), '#!/bin/sh\nif [ -f "$HOME/expired" ]; then echo "Not logged in" >&2; exit 1; fi\necho "Logged in using ChatGPT"\n');
  await chmod(resolve(bin, "codex"), 0o700);
  let claims = 0, authCard = false;
  const server = Bun.serve({ port: 0, async fetch(request) {
    const body = await request.json() as { authRequired?: string[]; harnesses?: string[] };
    if (new URL(request.url).pathname.endsWith("/heartbeat")) { authCard ||= body.authRequired?.includes("codex") ?? false; return Response.json({ ok: true }); }
    claims++;
    if (claims === 1) return new Response("network outage", { status: 503 });
    if (claims === 2) await Bun.write(resolve(root, ".agent-home", "expired"), "expired");
    return Response.json({ job: null });
  } });
  await Bun.write(resolve(root, "server-url"), `http://127.0.0.1:${server.port}\n`);
  const expires = Date.now() + 7200000;
  const token = `${btoa(JSON.stringify({ purpose: "runner", repo: "you/repo", pairId: "reconnect-fixture", expires })).replace(/=/g, "")}.signature`;
  await savePairing({ repo: "you/repo", token, expires }, root);
  const child = Bun.spawn([process.execPath, "runner/src/cli.ts", "watch"], { cwd: resolve(import.meta.dir, "../.."), env: { PATH: `${bin}:/usr/bin:/bin`, SHIPTORIO_RUNNER_ROOT: root, SHIPTORIO_URL: `http://127.0.0.1:${server.port}` }, stdout: "pipe", stderr: "pipe" });
  const out = new Response(child.stdout).text(), err = new Response(child.stderr).text();
  try {
    const end = Date.now() + 17000;
    while ((!authCard || claims < 2) && Date.now() < end && child.exitCode === null) await Bun.sleep(100);
    expect(child.exitCode).toBeNull(); expect(claims).toBeGreaterThanOrEqual(2); expect(authCard).toBe(true);
  } finally {
    child.kill(); await child.exited; await out;
    const errors = await err;
    expect(errors).toContain("Retrying in");
    server.stop(true); await rm(root, { recursive: true, force: true });
  }
}, 20000);
