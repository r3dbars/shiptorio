import { expect, test } from "bun:test";
import { chmod, mkdir, mkdtemp, readFile, rm, stat, symlink } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { agentEnvironment } from "../src/policy";
import { prepareAgentHome } from "../src/subscriptions";
import { prepareAgentKeychain, unlockAgentKeychain } from "../src/keychain";
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
    await run(["lock-keychain", keychain], home);
    await unlockAgentKeychain(home);
    // A service restart reuses the exact encrypted store and password; it never rotates away the login.
    const saved = await readFile(password, "utf8");
    await prepareAgentKeychain(home); expect(await readFile(password, "utf8")).toBe(saved);
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
  } finally { await rm(root, { recursive: true, force: true }); }
});
