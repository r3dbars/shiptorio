import { expect, test } from "bun:test";
import { runnerInstallCommand } from "../src/runner-install";

test("the displayed command downloads AND configures the runner for the current origin", () => {
  const origin = "https://shiptorio-selfhost-test.example.workers.dev";
  expect(runnerInstallCommand(origin)).toBe(`curl -fsSL '${origin}/install.sh' | SHIPTORIO_URL='${origin}' sh`);
  expect(runnerInstallCommand("http://localhost:8787")).toContain("SHIPTORIO_URL='http://localhost:8787'");
  expect(runnerInstallCommand("https://factory.o'brien.example")).toContain("'\\''");
});

test("one-paste join codes stay arguments to the self-host installer", () => {
  const origin = "https://factory.example", join = "a".repeat(48);
  expect(runnerInstallCommand(origin, join)).toBe(`curl -fsSL '${origin}/install.sh' | SHIPTORIO_URL='${origin}' sh -s -- --join '${join}'`);
  expect(runnerInstallCommand(origin, "x'; touch /tmp/unexpected; '")).toContain("--join 'x'\\''; touch /tmp/unexpected; '\\''' ".trim());
});

test("staging setup uses its own data and binary folders so production stays connected", () => {
  const command = runnerInstallCommand('https://shiptorio.dev', 'abc');
  expect(command).toContain('SHIPTORIO_RUNNER_ROOT="$HOME/.local/share/shiptorio/runner-staging"');
  expect(command).toContain('SHIPTORIO_RUNNER_BIN_DIR="$HOME/.local/bin/shiptorio-staging"');
  expect(command).toContain("SHIPTORIO_URL='https://shiptorio.dev'");
  expect(runnerInstallCommand('https://shiptorio.com')).not.toContain('RUNNER_ROOT');
});
