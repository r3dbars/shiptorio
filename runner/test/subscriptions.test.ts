import { expect, test } from "bun:test";
import { chmod, mkdir, mkdtemp, rm, stat, symlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { freeSubscriptions, prepareAgentHome, subscriptionSignedIn } from "../src/subscriptions";
import { agentEnvironment } from "../src/policy";
import { checkSandbox } from "../src/sandbox";

test("Claude CLI login → status → sandbox uses the same private config outside job workspaces", async () => {
  const root = await mkdtemp(join(tmpdir(), "shiptorio-subscriptions-"));
  try {
    const home = await prepareAgentHome(root), executable = join(root, "claude");
    const fixture = `#!/bin/sh
[ "$CLAUDE_CONFIG_DIR" = "$HOME/.claude" ] || exit 8
[ -z "$ANTHROPIC_API_KEY$CLAUDE_CODE_OAUTH_TOKEN$SHIPTORIO_RUNNER_TOKEN" ] || exit 9
case "$1 $2" in
"auth login") [ "$3" = "--claudeai" ] || exit 7; printf 'dedicated-login' > "$CLAUDE_CONFIG_DIR/login" ;;
"auth status") if [ -f "$CLAUDE_CONFIG_DIR/login" ]; then printf '{"loggedIn":true}'; else printf '{"loggedIn":false}'; exit 1; fi ;;
*) [ -f "$CLAUDE_CONFIG_DIR/login" ] && printf 'sandbox-signed-in' ;;
esac
`;
    await Bun.write(executable, fixture); await chmod(executable, 0o700);
    expect(await subscriptionSignedIn("claude_code", executable, home)).toBe(false);
    // The real runner entrypoint launches the provider and checks its persisted status.
    const env = { ...process.env, PATH: `${root}:/usr/bin:/bin`, SHIPTORIO_RUNNER_ROOT: root, ANTHROPIC_API_KEY: "do-not-inherit", CLAUDE_CODE_OAUTH_TOKEN: "do-not-inherit", SHIPTORIO_RUNNER_TOKEN: "do-not-inherit" };
    const child = Bun.spawn([process.execPath, join(import.meta.dir, "../src/cli.ts"), "login", "claude"], { env, stdin: "ignore", stdout: "pipe", stderr: "pipe" });
    const [out, err, code] = await Promise.all([new Response(child.stdout).text(), new Response(child.stderr).text(), child.exited]);
    expect({ code, err }).toEqual({ code: 0, err: "" }); expect(out).toContain("signed in for Shiptorio");
    expect(await subscriptionSignedIn("claude_code", executable, home)).toBe(true);
    expect((await stat(join(home, ".claude"))).mode & 0o777).toBe(0o700);
    const work = join(root, ".work/job"); await mkdir(work, { recursive: true });
    const sandbox = await checkSandbox(work, { home, executable });
    try { const result = await sandbox.run([executable, "--print"], work); expect(result.code).toBe(0); expect(result.out).toBe("sandbox-signed-in"); }
    finally { await sandbox.close(); }
    // A normal verification child must not inherit either provider's dedicated home.
    expect(agentEnvironment(env).CLAUDE_CONFIG_DIR).toBeUndefined();
    await rm(join(home, ".claude/login"));
    expect(await subscriptionSignedIn("claude_code", executable, home)).toBe(false);
  } finally { await rm(root, { recursive: true, force: true }); }
}, 30000);

test("auth home rejects linked credential directories and canonicalizes macOS temp aliases", async () => {
  const root = await mkdtemp(join(tmpdir(), "shiptorio-auth-home-"));
  try {
    await mkdir(join(root, "elsewhere")); await mkdir(join(root, ".agent-home"));
    await symlink(join(root, "elsewhere"), join(root, ".agent-home/.claude"));
    await expect(prepareAgentHome(root)).rejects.toThrow("symlink");
  } finally { await rm(root, { recursive: true, force: true }); }
});

test("each job refreshes sign-in, skips busy agents, and recovers after login or completion", async () => {
  const installed = ["codex", "claude_code"] as const;
  const signed = new Set<string>(["codex"]), busy = new Set<"codex" | "claude_code">();
  const ready = () => freeSubscriptions([...installed], async h => signed.has(h), busy);
  expect(await ready()).toEqual(["codex"]);
  signed.add("claude_code"); busy.add("codex"); expect(await ready()).toEqual(["claude_code"]);
  signed.delete("claude_code"); expect(await ready()).toEqual([]);
  busy.clear(); expect(await ready()).toEqual(["codex"]);
});
