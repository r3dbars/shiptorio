import { expect, test } from "bun:test";
import { pairToken, readRunnerToken } from "../src/runner-auth";
import { runnerPathAllowed, validLease, type RunnerJob } from "../src/runner-job";
test("pair tokens are scoped, expiring and reject altered signatures and session-shaped payloads", async () => {
  const identity = { repo: "r3dbars/shiptorio", pairId: "pair-a", expires: 2000 };
  const token = await pairToken("secret", identity);
  expect(await readRunnerToken("secret", token, 1000)).toEqual(identity);
  expect(await readRunnerToken("wrong", token, 1000)).toBeNull();
  expect(await readRunnerToken("secret", token, 2000)).toBeNull();
  expect(await readRunnerToken("secret", token + "x", 1000)).toBeNull();
  expect(await readRunnerToken("", token, 1000)).toBeNull();
});
test("runner accepts only the assigned lease and pairing, before its deadline", () => {
  const job = { status: "running", pairId: "a", lease: "lease", deadline: 2000 } as RunnerJob;
  expect(validLease(job, "a", "lease", 1000)).toBe(true);
  expect(validLease(job, "b", "lease", 1000)).toBe(false);
  expect(validLease(job, "a", "wrong", 1000)).toBe(false);
  expect(validLease(job, "a", "lease", 2000)).toBe(false);
  expect(validLease({ ...job, status: "completed" }, "a", "lease", 1000)).toBe(false);
});
test("runner approval cannot include secret or git-control paths", () => {
  for (const p of ["server/src/engine.ts", "server/test/engine.test.ts"]) expect(runnerPathAllowed(p)).toBe(true);
  for (const p of [".env", "server/.dev.vars", "server/key.pem", "a/../b", "/tmp/x", ".git/config", ".github/workflows/test.yml"]) expect(runnerPathAllowed(p)).toBe(false);
});
