import { expect, test } from "bun:test";
import { availableJobHarness, syncRunnerPower } from "../src/runner-power";

test("dispatch prefers Spark's subscription, falls back only to a free subscription, never to local", () => {
  expect(availableJobHarness("codex", ["codex", "claude_code"])).toBe("codex");
  expect(availableJobHarness("codex", ["claude_code"])).toBe("claude_code");
  expect(availableJobHarness("claude_code", ["codex"])).toBe("codex");
  expect(availableJobHarness("codex", ["local"])).toBeNull();
  expect(availableJobHarness("local", ["claude_code"])).toBeNull();
  expect(availableJobHarness("codex", [])).toBeNull();
});
test("heartbeat plants stay separate, lose power on logout, recover without duplicates", () => {
  const both = syncRunnerPower([], ["codex", "claude_code", "codex"]);
  expect(both.map(p => p.name)).toEqual(["Codex", "Claude Code"]);
  expect(both).toHaveLength(2);
  const out = syncRunnerPower(both, ["claude_code"]);
  expect(out.find(p => p.id === "solar-codex")?.online).toBe(false);
  expect(out.find(p => p.id === "solar-claude_code")?.online).toBe(true);
  expect(syncRunnerPower(out, ["codex", "claude_code"])).toEqual(both);
  expect(syncRunnerPower(both, []).every(p => !p.online)).toBe(true);
});
