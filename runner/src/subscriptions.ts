import { KeychainUnavailable, prepareAgentKeychain, unlockAgentKeychain } from "./keychain";
import { chmod, lstat, mkdir, realpath } from "node:fs/promises";
import { resolve } from "node:path";
import { agentEnvironment } from "./policy";
export type Subscription = "codex" | "claude_code";
export const subscriptionArgs = (h: Subscription, login = false): string[] =>
  h === "codex" ? ["login", ...(login ? [] : ["status"])] : ["auth", login ? "login" : "status", login ? "--claudeai" : "--json"];

/** Resolve before passing the path to Claude: its Keychain identity depends on this exact path. */
export async function prepareAgentHome(root: string, onKeychainUnavailable?: () => void): Promise<string> {
  await mkdir(root, { recursive: true, mode: 0o700 });
  const home = resolve(await realpath(root), ".agent-home");
  for (const path of [home, resolve(home, ".codex"), resolve(home, ".claude"), resolve(home, ".claude/tmp")]) {
    await mkdir(path, { recursive: true, mode: 0o700 });
    if (!(await lstat(path)).isDirectory() || await realpath(path) !== path) throw new Error("Agent home must not be a symlink");
    await chmod(path, 0o700);
  }
  try { await prepareAgentKeychain(home); }
  catch (error) {
    // Only the optional provider unlock may degrade. Filesystem/isolation failures stay fatal.
    if (!(error instanceof KeychainUnavailable) || !onKeychainUnavailable) throw error;
    onKeychainUnavailable();
  }
  return home;
}
export async function subscriptionSignedIn(h: Subscription, executable: string, home: string): Promise<boolean> {
  if (h === "claude_code") { try { await unlockAgentKeychain(home); } catch { return false; } }
  let child: Bun.Subprocess<"ignore", "pipe", "pipe">;
  try { child = Bun.spawn([executable, ...subscriptionArgs(h)], { cwd: home, env: agentEnvironment(process.env, home), stdin: "ignore", stdout: "pipe", stderr: "pipe" }); }
  catch { return false; }
  const timer = setTimeout(() => child.kill(), 10000);
  try {
    const [out, , code] = await Promise.all([new Response(child.stdout).text(), new Response(child.stderr).text(), child.exited]);
    if (code) return false;
    return h === "codex" || JSON.parse(out).loggedIn === true;
  } catch { return false; }
  finally { clearTimeout(timer); }
}

/** Refresh between jobs; a busy subscription is never offered to another assignment. */
export async function freeSubscriptions(installed: Subscription[], signedIn: (h: Subscription) => Promise<boolean>, busy: ReadonlySet<Subscription> = new Set()): Promise<Subscription[]> {
  const statuses = await Promise.all(installed.map(async h => !busy.has(h) && await signedIn(h)));
  return installed.filter((_, i) => statuses[i]);
}

/** Only credentials or an explicit successful login clear a provider's cached auth failure. */
export async function subscriptionCredentialVersion(h: Subscription, home: string): Promise<string> {
  const files = h === "codex" ? [".codex/auth.json"] : [".claude/.credentials.json", ".claude/.shiptorio-login"];
  return (await Promise.all(files.map(async file => {
    try { const info = await lstat(resolve(home, file)); return `${file}:${info.mtimeMs}:${info.size}`; }
    catch { return `${file}:missing`; }
  }))).join("|");
}
