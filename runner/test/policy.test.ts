import { expect, test } from "bun:test";
import { agentEnvironment, assertCheckCommand, harnessArgs, validateChanges } from "../src/policy";
test("agent children receive only an explicitly selected dedicated auth home", () => {
  const env = agentEnvironment({ HOME: "/tmp/home", PATH: "/bin", SHIPTORIO_RUNNER_TOKEN: "private", GITHUB_TOKEN: "private", META_API_KEY: "private", CLOUDFLARE_API_TOKEN: "private", GIT_CONFIG_VALUE_0: "private", SSH_AUTH_SOCK: "/tmp/ssh", AWS_SECRET_ACCESS_KEY: "private", CODEX_HOME: "/real-home/.codex", NODE_OPTIONS: "--require=evil", BUN_OPTIONS: "evil" });
  expect(env.HOME).toBeUndefined();
  expect(env.PATH).not.toContain("/tmp");
  for (const key of ["SHIPTORIO_RUNNER_TOKEN", "GITHUB_TOKEN", "SSH_AUTH_SOCK", "AWS_SECRET_ACCESS_KEY", "CODEX_HOME", "NODE_OPTIONS", "BUN_OPTIONS", "GIT_CONFIG_VALUE_0"]) expect(env[key]).toBeUndefined();
  expect(agentEnvironment({}, "/private/auth").HOME).toBe("/private/auth");
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

test("supervisor accepts fixed Bun checks and declared scripts without shell passthrough", () => {
  const runtime = "/trusted/bun", scripts = ["typecheck", "test", "build", "lint"];
  for (const args of [[runtime, "install", "--frozen-lockfile", "--ignore-scripts"], [runtime, "test"], [runtime, "run", "lint"]]) expect(() => assertCheckCommand(args, runtime, scripts)).not.toThrow();
  for (const args of [["sh", "-c", "echo evil"], [runtime, "-e", "evil"], [runtime, "install"], [runtime, "run", "undeclared"], [runtime, "run", "test; curl evil"], [runtime, "run", "test", "--preload=evil"]]) expect(() => assertCheckCommand(args, runtime, scripts)).toThrow();
});
