import { expect, test } from "bun:test";
import { AuthFailures, agentOffline, authExpired, diagnose } from "../src/health";

test("Codex and Claude expired sign-ins are recognized without blaming sandbox/network failures", () => {
  for (const output of ["Your session has expired. Please log in", "OAuth token revoked", "Your access token could not be refreshed because your refresh token was already used. Please log out and sign in again.", "401 Unauthorized", "authentication_required", "Not logged in · Please run claude auth login", '{"is_error":true,"result":"Invalid API key · Please run /login"}']) expect(authExpired(output)).toBe(true);
  for (const output of ["Failed to synchronize managed preferences", "workspace routing discovery failed", "sandbox-exec: operation not permitted", "fetch failed: connection reset", "typecheck exited 1"]) expect(authExpired(output)).toBe(false);
});

test("doctor reports all auth, sandbox (#235), and pairing failures in one pass", async () => {
  const checked: (string | undefined)[] = [];
  const results = await diagnose({ harnesses: ["codex", "claude_code"], pairs: [{ repo: "you/repo", token: "secret", expires: Date.now() + 60000 }],
    auth: async h => h === "claude_code", sandbox: async h => { checked.push(h); if (h === "codex") throw Error("cfprefs denied"); },
    pairing: async () => { throw Error("401 revoked secret"); } });
  expect(checked).toEqual([undefined, "codex", "claude_code"]);
  expect(results.filter(r => !r.ok).map(r => r.check)).toEqual(["auth:codex", "sandbox:codex", "pairing:you/repo"]);
  expect(results[0].detail).toContain("shiptorio-runner login codex");
  expect(JSON.stringify(results)).not.toContain("secret");
});

test("doctor detects missing installs/pairings, expired tokens and healthy setups", async () => {
  const deps = { auth: async () => true, sandbox: async () => {}, pairing: async () => {} };
  const missing = await diagnose({ ...deps, harnesses: [], pairs: [] });
  expect(missing.filter(r => !r.ok).map(r => r.check)).toEqual(["auth", "pairing"]);
  let requests = 0;
  const results = await diagnose({ ...deps, harnesses: ["codex"], pairs: [{ repo: "you/repo", token: "secret", expires: 1 }], pairing: async () => { requests++; } });
  expect(results.at(-1)?.ok).toBe(false); expect(requests).toBe(0);
  expect((await diagnose({ ...deps, harnesses: ["claude_code"], pairs: [{ repo: "you/repo", token: "secret", expires: Date.now() + 60000 }] })).every(r => r.ok)).toBe(true);
});

test("a revoked refresh token cannot churn builds on a cached logged-in status; reauth clears it", () => {
  const health = new AuthFailures();
  expect(health.ready("codex", true, "v1")).toBe(true);
  health.reject("codex", "v1");
  expect(health.ready("codex", true, "v1")).toBe(false);
  expect(health.ready("claude_code", true, "v1")).toBe(true);
  expect(health.ready("codex", false, "v2")).toBe(false);
  expect(health.ready("codex", true, "v2")).toBe(true);
});

test("provider connection drops preserve a build; ordinary code failures remain terminal", () => {
  for (const output of ["error sending request", "stream disconnected before completion", "Connection reset by peer", "Network unreachable", "connection timed out"]) expect(agentOffline(output)).toBe(true);
  expect(agentOffline("Unit tests failed: expected true")).toBe(false);
});

test("doctor CLI reports every category and a failing exit code without pairing or inference", async () => {
  const { mkdtemp, rm } = await import("node:fs/promises");
  const { tmpdir } = await import("node:os");
  const { resolve } = await import("node:path");
  const root = await mkdtemp(resolve(tmpdir(), "shiptorio-doctor-test-"));
  try {
    const child = Bun.spawn([process.execPath, "runner/src/cli.ts", "doctor"], {
      cwd: resolve(import.meta.dir, "../.."), env: { PATH: "/usr/bin:/bin", SHIPTORIO_RUNNER_ROOT: root }, stdout: "pipe", stderr: "pipe",
    });
    const [out, err, code] = await Promise.all([new Response(child.stdout).text(), new Response(child.stderr).text(), child.exited]);
    expect(code).toBe(1); expect(out).toContain("FAIL auth:"); expect(out).toContain("sandbox:verification:"); expect(out).toContain("FAIL pairing:");
    expect(out + err).not.toContain("Waiting for your approval");
    expect(out).toContain("SKIP edit:codex: Not checked");
    const edit = Bun.spawn([process.execPath, "runner/src/cli.ts", "doctor", "--edit", "codex"], {
      cwd: resolve(import.meta.dir, "../.."), env: { PATH: "/usr/bin:/bin", SHIPTORIO_RUNNER_ROOT: root }, stdout: "pipe", stderr: "pipe",
    });
    const [editOut, editErr, editCode] = await Promise.all([new Response(edit.stdout).text(), new Response(edit.stderr).text(), edit.exited]);
    expect(editCode).toBe(1); expect(editOut).toContain("FAIL edit:codex:");
    expect(editOut + editErr).not.toContain("Waiting for your approval");
  } finally { await rm(root, { recursive: true, force: true }); }
});

test("doctor's explicit edit probe runs only for a signed-in installed harness and reports real edit failure", async () => {
  let calls = 0;
  const options = { harnesses: ["codex"] as const, pairs: [], auth: async () => true, sandbox: async () => {}, pairing: async () => {}, editHarness: "codex" as const, edit: async () => { calls++; } };
  const good = await diagnose({ ...options, harnesses: [...options.harnesses] });
  expect(good.find(r => r.check === "edit:codex")?.ok).toBe(true); expect(calls).toBe(1);
  const failed = await diagnose({ ...options, harnesses: [...options.harnesses], edit: async () => { throw Error("sandbox_apply Operation not permitted"); } });
  expect(failed.find(r => r.check === "edit:codex")?.ok).toBe(false);
  expect(failed.find(r => r.check === "edit:codex")?.detail).toContain("successful login/startup does not prove");
  await diagnose({ ...options, harnesses: [...options.harnesses], auth: async () => false });
  await diagnose({ ...options, harnesses: [] });
  expect(calls).toBe(1);
});
