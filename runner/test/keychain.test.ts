import { expect, test } from "bun:test";
import { chmod, mkdir, mkdtemp, readFile, rm, stat, symlink } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { agentEnvironment } from "../src/policy";
import { prepareAgentHome } from "../src/subscriptions";
import { KeychainUnavailable, prepareAgentKeychain } from "../src/keychain";
import { checkSandbox } from "../src/sandbox";

const run = async (args: string[], home?: string) => {
  const child = Bun.spawn(["/usr/bin/security", ...args], { env: home ? agentEnvironment({}, home) : process.env, stdin: "ignore", stdout: "pipe", stderr: "pipe" });
  const [out, err, code] = await Promise.all([new Response(child.stdout).text(), new Response(child.stderr).text(), child.exited]);
  if (code) throw Error(`${args[0]} failed: ${err}`);
  return out;
};
test.skipIf(process.env.SHIPTORIO_CHECK_SANDBOX === "1" || process.platform !== "darwin")("isolated HOME persists credentials across processes and into the agent sandbox without changing the personal Keychain", async () => {
  const root = await mkdtemp(join(tmpdir(), "shiptorio-keychain-test-"));
  const normalBefore = await run(["default-keychain", "-d", "user"]).catch(() => "no-default");
  let home: string | undefined;
  try {
    home = await prepareAgentHome(root);
    const work = join(root, "work"); await mkdir(work);
    const keychain = join(home, "Library/Keychains/shiptorio.keychain-db"), password = join(root, ".agent-keychain-password");
    expect((await stat(password)).mode & 0o777).toBe(0o600);
    expect((await stat(keychain)).mode & 0o777).toBe(0o600);
    await run(["add-generic-password", "-a", "shiptorio-test", "-s", "shiptorio-test", "-w", "non-secret-canary"], home);
    expect((await run(["find-generic-password", "-s", "shiptorio-test", "-w"], home)).trim()).toBe("non-secret-canary");
    const saved = await readFile(password, "utf8");
    await run(["lock-keychain", keychain], home);
    // Start exactly as a restarted service does: prepare must unlock the existing store itself.
    await prepareAgentKeychain(home);
    expect((await readFile(password, "utf8")) === saved).toBe(true);
    expect((await run(["find-generic-password", "-s", "shiptorio-test", "-w"], home)).trim()).toBe("non-secret-canary");
    const boundary = await checkSandbox(work, { home, executable: process.execPath });
    try {
      const credential = await boundary.run(["/usr/bin/security", "find-generic-password", "-s", "shiptorio-test", "-w"], work);
      expect(credential.code).toBe(0); expect(credential.out.trim()).toBe("non-secret-canary");
      const escaped = await boundary.run([process.execPath, "-e", `await Bun.file(${JSON.stringify(password)}).text()`], work);
      expect(escaped.code).not.toBe(0);
    } finally { await boundary.close(); }
    expect(await run(["default-keychain", "-d", "user"]).catch(() => "no-default")).toBe(normalBefore);
  } finally {
    if (home) await run(["delete-keychain", join(home, "Library/Keychains/shiptorio.keychain-db")], home).catch(() => {});
    await rm(root, { recursive: true, force: true });
  }
}, 30000);

test.skipIf(process.platform !== "darwin")("Keychain setup refuses linked password files", async () => {
  const root = await mkdtemp(join(tmpdir(), "shiptorio-keychain-link-"));
  try {
    const home = join(root, ".agent-home"); await mkdir(home);
    await Bun.write(join(root, "outside"), "do-not-read"); await chmod(join(root, "outside"), 0o600);
    await symlink(join(root, "outside"), join(root, ".agent-keychain-password"));
    await expect(prepareAgentKeychain(home)).rejects.toThrow("links");
    let degraded = false;
    await expect(prepareAgentHome(root, () => { degraded = true; })).rejects.toThrow("links");
    expect(degraded).toBe(false);
  } finally { await rm(root, { recursive: true, force: true }); }
});

test.skipIf(process.env.SHIPTORIO_CHECK_SANDBOX === "1" || process.platform !== "darwin")("unavailable Claude Keychain cannot block Codex login and cannot fall back for Claude", async () => {
  const root = await mkdtemp(join(tmpdir(), "shiptorio-keychain-unavailable-"));
  let home: string | undefined;
  try {
    home = await prepareAgentHome(root);
    // Only corrupt this disposable fixture's saved password, preserving its store.
    const password = join(root, ".agent-keychain-password");
    const original = await readFile(password, "utf8");
    await Bun.write(password, original[0] === "0" ? "1".repeat(64) : "0".repeat(64));
    await expect(prepareAgentHome(root)).rejects.toBeInstanceOf(KeychainUnavailable);
    const bin = join(root, "bin"); await mkdir(bin);
    for (const name of ["codex", "claude"]) {
      const executable = join(bin, name);
      await Bun.write(executable, `#!/bin/sh
[ "$HOME" = ${JSON.stringify(home)} ] || exit 9
[ -z "$ANTHROPIC_API_KEY$CLAUDE_CODE_OAUTH_TOKEN$SHIPTORIO_RUNNER_TOKEN" ] || exit 8
printf '%s\\n' "$1 $2" >> "$HOME/.codex/${name}-invoked"
[ "$CI" != true ] || printf 'sandbox' > "$HOME/.codex/${name}-sandbox-invoked"
printf 'dedicated-provider-called'
`);
      await chmod(executable, 0o700);
    }
    const invoke = async (...args: string[]) => {
      const child = Bun.spawn([process.execPath, join(import.meta.dir, "../src/cli.ts"), ...args], {
        env: { PATH: `${bin}:/usr/bin:/bin`, SHIPTORIO_RUNNER_ROOT: root }, stdin: "ignore", stdout: "pipe", stderr: "pipe",
      });
      const [out, err, code] = await Promise.all([new Response(child.stdout).text(), new Response(child.stderr).text(), child.exited]);
      return { out, err, code };
    };
    const codex = await invoke("login", "codex");
    expect(codex.code).toBe(0);
    expect(codex.out).toContain("dedicated-provider-called");
    expect(codex.err).toContain("Claude Code is unavailable: its private Keychain could not be unlocked");
    expect(codex.err).not.toContain(original);
    const claude = await invoke("login", "claude");
    expect(claude.code).not.toBe(0);
    expect(claude.out).not.toContain("dedicated-provider-called");
    expect(claude.err).toContain("Repair the private Keychain before signing in to Claude");
    const doctor = await invoke("doctor");
    expect(doctor.code).not.toBe(0);
    expect(doctor.out).toContain("FAIL auth:claude_code");
    expect(doctor.out).toContain("FAIL sandbox:claude_code");
    expect(await Bun.file(join(home, ".codex/codex-sandbox-invoked")).exists()).toBe(true);
    expect(await Bun.file(join(home, ".codex/claude-invoked")).exists()).toBe(false);
    expect(await readFile(password, "utf8")).not.toBe(original);
  } finally {
    if (home) await run(["delete-keychain", join(home, "Library/Keychains/shiptorio.keychain-db")], home).catch(() => {});
    await rm(root, { recursive: true, force: true });
  }
}, 30000);
