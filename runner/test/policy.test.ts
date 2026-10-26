import { expect, test } from "bun:test";
import { agentEnvironment, harnessArgs, validateChanges } from "../src/policy";
test("agent children keep subscription auth location but receive no server or push credentials", () => {
  const env = agentEnvironment({ HOME: "/tmp/home", PATH: "/bin", SHIPTORIO_RUNNER_TOKEN: "private", GITHUB_TOKEN: "private", META_API_KEY: "private", CLOUDFLARE_API_TOKEN: "private", GIT_CONFIG_VALUE_0: "private" });
  expect(env).toEqual({ HOME: "/tmp/home", PATH: "/bin" });
});
test("supervisor refuses out-of-scope patches, huge changes and private keys", () => {
  expect(() => validateChanges(["src/a.ts"], ["src/a.ts"], "+fixed")).not.toThrow();
  expect(() => validateChanges(["src/b.ts"], ["src/a.ts"], "+fixed")).toThrow();
  expect(() => validateChanges(["src/a.ts"], ["src/a.ts"], "+-----BEGIN PRIVATE KEY-----")).toThrow();
  expect(() => validateChanges(["src/a.ts"], ["src/a.ts"], Array(502).fill("+line").join("\n"))).toThrow();
});
test("adapters keep native subscription auth and enforce bounded tool permissions", () => {
  expect(harnessArgs("codex", "task")).toContain("workspace-write");
  expect(harnessArgs("codex", "task")).toContain("--ignore-user-config");
  expect(harnessArgs("claude_code", "task")).toContain("--restricted");
  expect(harnessArgs("claude_code", "task")).not.toContain("--bare");
  expect(harnessArgs("claude_code", "task")).not.toContain("--dangerously-skip-permissions");
});
