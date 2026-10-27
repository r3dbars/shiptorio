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
