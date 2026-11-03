import { expect, test } from "bun:test";
import { plainRunnerError } from "../src/messages";

test("runner errors explain the problem before one next command", () => {
  for (const [error, expected] of [
    ["Build lease expired; job 1234", "The build ran out of time; approve a new attempt in Shiptorio."],
    ["Grant revoked for private-id", "This computer needs to reconnect to your factory.\nshiptorio-runner pair"],
    ["Sign-in expired", "Sign in to Codex again.\nshiptorio-runner login codex"],
    ["ECONNRESET secret=do-not-print", "The runner could not connect.\nshiptorio-runner watch"],
  ]) expect(plainRunnerError(new Error(error))).toBe(expected);
});

test("unknown errors never print stack traces, IDs or raw provider text", () => {
  const error = new Error("PRIVATE stack user-id=secret-token-1234");
  error.stack = "PRIVATE stack trace";
  expect(plainRunnerError(error)).toBe("The runner could not finish this step.\nshiptorio-runner doctor");
});

test("fatal CLI errors are plain by default and technical only with --verbose", async () => {
  const { mkdtemp, rm } = await import("node:fs/promises");
  const { tmpdir } = await import("node:os");
  const root = await mkdtemp(`${tmpdir()}/shiptorio-copy-`);
  try {
    for (const verbose of [false, true]) {
      const proc = Bun.spawn([process.execPath, new URL("../src/cli.ts", import.meta.url).pathname, "paths", ...(verbose ? ["--verbose"] : [])], {
        env: { ...process.env, SHIPTORIO_RUNNER_ROOT: root, SHIPTORIO_URL: "http://remote.invalid" }, stdout: "pipe", stderr: "pipe",
      });
      const [code, stderr] = await Promise.all([proc.exited, new Response(proc.stderr).text()]);
      expect(code).toBe(1);
      if (verbose) expect(stderr).toContain("Error:");
      else { expect(stderr.trim()).toBe("The factory address is not valid; use the HTTPS address from Shiptorio."); expect(stderr).not.toContain(root); }
    }
  } finally { await rm(root, { recursive: true, force: true }); }
});
