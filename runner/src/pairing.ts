import { chmod, mkdir, open, readdir, rename, rm } from "node:fs/promises";
import { resolve } from "node:path";
import { homedir } from "node:os";
export type GrantRejectionCode = "runner_grant_expired" | "runner_grant_invalid" | "runner_pair_revoked" | "runner_access_revoked";
export interface Pairing { repo: string; token: string; expires: number; rejected?: { code: GrantRejectionCode; at: number } }
export const runnerHome = () => resolve(process.env.SHIPTORIO_RUNNER_ROOT || resolve(homedir(), ".local/share/shiptorio/runner"));
const validRepo = (repo: string) => /^[\w.-]+\/[\w.-]+$/.test(repo) && !repo.split("/").some(p => p === "." || p === "..");
export async function savePairing(pairing: Pairing, root = runnerHome()) {
  if (!validRepo(pairing.repo) || typeof pairing.token !== "string" || !Number.isFinite(pairing.expires)) throw new Error("Invalid pairing response");
  await updatePairing(pairing.repo, root, () => pairing, true);
}
/** Serialize manual pairing, renewal and removal across CLI/service processes. */
export async function updatePairing(repo: string, root: string, update: (current: Pairing | null) => Pairing | null | Promise<Pairing | null>, replace = false): Promise<Pairing | null> {
  if (!validRepo(repo)) throw new Error("Invalid pairing repository");
  repo = repo.toLowerCase();
  const dir = resolve(root, "pairings");
  await mkdir(dir, { recursive: true, mode: 0o700 }); await chmod(root, 0o700); await chmod(dir, 0o700);
  const path = resolve(dir, encodeURIComponent(repo) + ".json"), lock = path + ".lock";
  let handle: Awaited<ReturnType<typeof open>> | undefined;
  for (let attempt = 0; attempt < 100; attempt++) {
    try { handle = await open(lock, "wx", 0o600); break; }
    catch (error) { if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error; await Bun.sleep(20); }
  }
  // Never break another process's lock based on age: an interrupted write fails closed.
  if (!handle) throw new Error("Pairing store is busy; close other pairing commands and retry. An interrupted writer may require lock recovery.");
  const temp = path + "." + crypto.randomUUID();
  try {
    await handle.writeFile(String(process.pid));
    const file = Bun.file(path);
    const current = !replace && await file.exists() ? await file.json() as Pairing : null;
    const next = await update(current);
    if (next) {
      if (next.repo.toLowerCase() !== repo || typeof next.token !== "string" || !Number.isFinite(next.expires)) throw new Error("Invalid pairing response");
      if (!current || current.token !== next.token || current.expires !== next.expires || current.repo !== repo || JSON.stringify(current.rejected) !== JSON.stringify(next.rejected)) {
        await Bun.write(temp, JSON.stringify({ ...next, repo }), { mode: 0o600 }); await chmod(temp, 0o600); await rename(temp, path);
      }
    } else await rm(path, { force: true });
    return next ? { ...next, repo } : null;
  } finally { await rm(temp, { force: true }); await handle.close(); await rm(lock, { force: true }); }
}
export async function loadPairings(root = runnerHome()): Promise<Pairing[]> {
  const dir = resolve(root, "pairings");
  const files = await readdir(dir).catch((error) => { if (error.code === "ENOENT") return []; throw error; });
  return Promise.all(files.filter(name => name.endsWith(".json")).map(async name => {
    const pair = await Bun.file(resolve(dir, name)).json() as Pairing;
    if (!validRepo(pair.repo) || typeof pair.token !== "string" || !Number.isFinite(pair.expires)) throw new Error("Invalid stored pairing; pair this repository again");
    return pair;
  }));
}
export async function removePairing(repo: string, root = runnerHome()) { await updatePairing(repo, root, () => null, true); }
export async function pairMachine(base: string, root = runnerHome(), pollMs = 3000, attempts = 3) {
  // A code that times out while someone is away from the keyboard just gets a fresh one, so re-running install isn't needed.
  for (let attempt = 1; attempt <= attempts; attempt++) {
    if (await pairOnce(base, root, pollMs, attempt > 1)) return;
  }
  throw new Error("Pairing timed out. Run shiptorio-runner pair when you're at your browser to get a fresh code.");
}
async function pairOnce(base: string, root: string, pollMs: number, retry: boolean): Promise<boolean> {
  const start = await fetch(`${base}/api/runner-device/start`, { method: "POST", signal: AbortSignal.timeout(30000) });
  if (!start.ok) throw new Error(`Could not start pairing (${start.status})`);
  const { code, secret, expires, verificationUri } = await start.json() as { code: string; secret: string; expires: number; verificationUri: string };
  if (new URL(verificationUri).origin !== base || !/^[A-F0-9]{4}(-[A-F0-9]{4}){2}$/.test(code) || !Number.isFinite(expires) || expires > Date.now() + 11 * 60_000 || typeof secret !== "string") throw new Error("Invalid device response");
  console.log(`\n${retry ? "That code timed out, so here's a fresh one" : "Connect your machine"}. Compare this code in your browser: ${code}\n${verificationUri}\nWaiting for your approval (10 minutes)…`);
  const opener = process.platform === "darwin" ? "open" : "xdg-open";
  if (Bun.which(opener)) { const child = Bun.spawn([opener, verificationUri], { stdout: "ignore", stderr: "ignore" }); await child.exited; }
  while (Date.now() < expires) {
    await Bun.sleep(pollMs);
    // A dropped connection or a busy server mid-wait shouldn't burn the code the person is about to approve.
    const response = await fetch(`${base}/api/runner-device/poll`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ code, secret }), signal: AbortSignal.timeout(30000) }).catch(() => null);
    if (!response || response.status === 429 || response.status >= 500) continue;
    if (!response.ok) throw new Error(`Pairing failed (${response.status}); run shiptorio-runner pair again`);
    const result = await response.json() as Pairing & { status: string };
    if (result.status === "approved") { await savePairing(result, root); console.log(`Connected to ${result.repo}. Your agent sign-ins stay on this computer.`); return true; }
    if (result.status === "expired") return false;
  }
  return false;
}
/** One-paste setup: trade the single-use join code from the install command for this repo's credential. No browser step. */
export async function joinMachine(base: string, join: string, root = runnerHome()) {
  if (!/^[a-f0-9]{48}$/.test(join)) throw new Error("That setup command looks cut off. Copy a fresh one from Power in your factory.");
  const response = await fetch(`${base}/api/runner-device/join`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ join }), signal: AbortSignal.timeout(30000) });
  if (response.status === 410) throw new Error("That setup command expired or was already used. Copy a fresh one from Power in your factory.");
  if (!response.ok) throw new Error(`Could not connect this computer (${response.status}). Copy a fresh setup command from Power.`);
  const pairing = await response.json() as Pairing;
  await savePairing(pairing, root);
  console.log(`Connected to ${pairing.repo}. Your agent sign-ins stay on this computer.`);
}
