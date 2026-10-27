import { expect, test } from "bun:test";
import { runnerOrigin } from "../src/origin";

test("self-hosted origins are supported without accepting insecure or credential-bearing URLs", () => {
  for (const origin of ["https://shiptorio.com", "https://shiptorio-test.example.workers.dev", "https://factory.example:8443", "http://localhost:8787", "http://127.0.0.1:9876", "http://[::1]:8787"]) {
    expect(runnerOrigin(origin + "/")).toBe(origin);
  }
  for (const origin of ["http://remote.example", "https://user:secret@factory.example", "https://factory.example/path", "https://factory.example?key=x", "https://factory.example#fragment", "file:///tmp/runner", "invalid"]) {
    expect(() => runnerOrigin(origin)).toThrow();
  }
});

test("a pinned origin accepts normalized matches and rejects a different server", () => {
  expect(runnerOrigin("https://factory.example:443/", "https://factory.example")).toBe("https://factory.example");
  expect(() => runnerOrigin("https://other.example", "https://factory.example")).toThrow("another Shiptorio server");
});

test("CLI rejects an origin override before requests or stored credentials leave the installation", async () => {
  const { mkdtemp, mkdir, rm } = await import("node:fs/promises");
  const { tmpdir } = await import("node:os");
  const { join } = await import("node:path");
  const root = await mkdtemp(join(tmpdir(), "shiptorio-origin-pin-"));
  const requests: string[] = [];
  const server = Bun.serve({ port: 0, fetch(req) {
    requests.push(`${req.url} ${req.headers.get("authorization") ?? ""}`);
    return new Response(null, { status: 503 });
  } });
  const token = "test-pairing-must-stay-local";
  try {
    await mkdir(join(root, "pairings"));
    await Bun.write(join(root, "pairings/you%2Frepo.json"), JSON.stringify({ repo: "you/repo", token, expires: Date.now() + 3600000 }));
    for (const pinned of ["https://factory.example", undefined]) {
      if (pinned) await Bun.write(join(root, "server-url"), pinned + "\n");
      else await rm(join(root, "server-url")); // legacy installations are pinned to the original public server
      for (const command of ["doctor", "watch", "pair", "retry"]) {
        const child = Bun.spawn([process.execPath, "--no-env-file", "--config=/dev/null", join(import.meta.dir, "../src/cli.ts"), command], {
          env: { HOME: root, PATH: "/usr/bin:/bin", SHIPTORIO_RUNNER_ROOT: root, SHIPTORIO_URL: `http://localhost:${server.port}` },
          stdin: "ignore", stdout: "pipe", stderr: "pipe",
        });
        const [code, stdout, stderr] = await Promise.all([child.exited, new Response(child.stdout).text(), new Response(child.stderr).text()]);
        expect(code).not.toBe(0);
        expect(stderr).toContain("another Shiptorio server");
        expect(stdout + stderr).not.toContain(token);
        expect(requests).toEqual([]);
      }
    }
  } finally { server.stop(true); await rm(root, { recursive: true, force: true }); }
}, 30000);

test("fresh CLI pairing pins a custom origin and subsequent pairing retains it without an override", async () => {
  const { mkdtemp, rm } = await import("node:fs/promises");
  const { tmpdir } = await import("node:os");
  const { join } = await import("node:path");
  const root = await mkdtemp(join(tmpdir(), "shiptorio-origin-pair-"));
  let requests = 0;
  const server = Bun.serve({ port: 0, fetch(req) {
    expect(new URL(req.url).pathname).toBe("/api/runner-device/join");
    requests++;
    return Response.json({ repo: "you/repo", token: "synthetic-pairing", expires: Date.now() + 3600000 });
  } });
  const origin = `http://localhost:${server.port}`;
  try {
    for (const override of [origin, undefined]) {
      const child = Bun.spawn([process.execPath, "--no-env-file", "--config=/dev/null", join(import.meta.dir, "../src/cli.ts"), "pair", "--join", "a".repeat(48)], {
        env: { HOME: root, PATH: "/usr/bin:/bin", SHIPTORIO_RUNNER_ROOT: root, ...(override ? { SHIPTORIO_URL: override } : {}) },
        stdin: "ignore", stdout: "pipe", stderr: "pipe",
      });
      const [code, stderr] = await Promise.all([child.exited, new Response(child.stderr).text(), new Response(child.stdout).text()]);
      expect(stderr).toBe("");
      expect(code).toBe(0);
      expect((await Bun.file(join(root, "server-url")).text()).trim()).toBe(origin);
    }
    expect(requests).toBe(2);
  } finally { server.stop(true); await rm(root, { recursive: true, force: true }); }
}, 30000);
