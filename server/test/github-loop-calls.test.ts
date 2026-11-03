import { expect, it } from "bun:test";
import * as github from "../src/github";
import { githubLoopFixture } from "./github-loop-fixture";
it("one issue reaches a confirmed merge with bounded reads and separate human-gate checks", async () => {
  const result = await githubLoopFixture(github);
  expect(result.counts).toEqual({ inbox: 1, plan: 1, "pull request": 2, checks: 4, merge: 4 });
  expect(result.total).toBe(12);
  expect(result.merged).toBe(true);
  expect(result.calls.filter(call => call.step === "checks" && call.path.endsWith("/pulls/27")).map(call => call.conditional)).toEqual([false, true]);
  expect(result.calls.filter(call => call.step === "merge" && call.method === "GET").map(call => call.conditional)).toEqual([false, false, true]);
  expect(result.calls.filter(call => call.method === "PUT")).toHaveLength(1);
});
