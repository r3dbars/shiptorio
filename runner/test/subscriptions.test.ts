import { nativeTest } from "./native-prerequisite";
import { expect, test } from "bun:test";
import { chmod, mkdir, mkdtemp, rm, stat, symlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { freeSubscriptions, prepareAgentHome, subscriptionSignedIn, subscriptionCredentialVersion } from "../src/subscriptions";
import { harnessArgs, agentEnvironment } from "../src/policy";
import { checkSandbox } from "../src/sandbox";

nativeTest("Claude CLI login → status → sandbox uses the same private config outside job workspaces", async () => {
  const root = await mkdtemp(join(tmpdir(), "shiptorio-subscriptions-"));
  try {
    const home = await prepareAgentHome(root), executable = join(root, "claude");
    const fixture = `#!/bin/sh
[ "$CLAUDE_CONFIG_DIR" = "$HOME/.claude" ] || exit 8
[ -z "$ANTHROPIC_API_KEY$CLAUDE_CODE_OAUTH_TOKEN$SHIPTORIO_RUNNER_TOKEN" ] || exit 9
case "$1 $2" in
"auth login") [ -d "$CLAUDE_CODE_TMPDIR" ] || exit 6; [ "$3" = "--claudeai" ] || exit 7; printf 'dedicated-login' > "$CLAUDE_CONFIG_DIR/login" ;;
"auth status") if [ -f "$CLAUDE_CONFIG_DIR/login" ]; then printf '{"loggedIn":true}'; else printf '{"loggedIn":false}'; exit 1; fi ;;
*) [ -d "$CLAUDE_CODE_TMPDIR" ] || exit 6; [ "$CLAUDE_CODE_TMPDIR" != "/tmp/claude-501" ] || exit 5; [ -f "$CLAUDE_CONFIG_DIR/login" ] && printf 'sandbox-signed-in' ;;
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
    expect(await Bun.file(join(home, ".claude/.shiptorio-login")).exists()).toBe(true);
    expect((await stat(join(home, ".claude"))).mode & 0o777).toBe(0o700);
    const work = join(root, ".work/job"); await mkdir(work, { recursive: true });
    const sandbox = await checkSandbox(work, { home, executable });
    try { const result = await sandbox.run([executable, "--print"], work); expect({ code: result.code, err: result.err }).toEqual({ code: 0, err: "" }); expect(result.out).toBe("sandbox-signed-in"); }
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

// No account is used: the real CLI must reject a fresh, signed-out home promptly.
// This catches macOS startup stalls a shell fixture cannot reproduce (timezone ICU, #235).
test.skipIf(process.env.SHIPTORIO_CHECK_SANDBOX === "1" || process.platform !== "darwin" || !Bun.which("claude"))("native Claude reaches its auth error inside the macOS agent sandbox without spending tokens", async () => {
  const root = await mkdtemp(join(tmpdir(), "shiptorio-native-claude-"));
  const home = await prepareAgentHome(root), work = join(root, "job"), executable = Bun.which("claude")!;
  await mkdir(work);
  let boundary: Awaited<ReturnType<typeof checkSandbox>> | undefined;
  try {
    expect(await subscriptionSignedIn("claude_code", executable, home)).toBe(false);
    boundary = await checkSandbox(work, { home, executable });
    const result = await boundary.run([executable, ...harnessArgs("claude_code", "Return OK without using any tools.")], work, { timeout: 10000 });
    expect(result.timedOut).toBe(false);
    expect(result.code).toBe(1);
    const reply = JSON.parse(result.out);
    expect(reply.is_error).toBe(true);
    expect(reply.result).toMatch(/not logged in|login/i);
    expect(reply.total_cost_usd).toBe(0);
  } finally { await boundary?.close(); await rm(root, { recursive: true, force: true }); }
}, 30000);

test.skipIf(process.env.SHIPTORIO_CHECK_SANDBOX === "1")("Claude reauthentication clears its auth guard without resetting a failed Codex login", async () => {
  const root = await mkdtemp(join(tmpdir(), "shiptorio-auth-version-"));
  try {
    const home = await prepareAgentHome(root);
    const codex = await subscriptionCredentialVersion("codex", home), claude = await subscriptionCredentialVersion("claude_code", home);
    // Routine Claude metadata writes must not make a revoked cached login usable.
    await Bun.write(join(home, ".claude/.claude.json"), "{}");
    expect(await subscriptionCredentialVersion("claude_code", home)).toBe(claude);
    await Bun.write(join(home, ".claude/.shiptorio-login"), "successful-keychain-login");
    expect(await subscriptionCredentialVersion("claude_code", home)).not.toBe(claude);
    expect(await subscriptionCredentialVersion("codex", home)).toBe(codex);
    expect(await subscriptionSignedIn("claude_code", join(root, "missing-cli"), home)).toBe(false);
  } finally { await rm(root, { recursive: true, force: true }); }
});
