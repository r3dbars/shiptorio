import { chmod, mkdir, readdir, rename, rm } from "node:fs/promises";
import { resolve } from "node:path";
import { homedir } from "node:os";
export interface Pairing { repo: string; token: string; expires: number }
export const runnerHome = () => resolve(process.env.SHIPTORIO_RUNNER_ROOT || resolve(homedir(), ".local/share/shiptorio/runner"));
const validRepo = (repo: string) => /^[\w.-]+\/[\w.-]+$/.test(repo) && !repo.split("/").some(p => p === "." || p === "..");
export async function savePairing(pairing: Pairing, root = runnerHome()) {
  if (!validRepo(pairing.repo) || typeof pairing.token !== "string" || !Number.isFinite(pairing.expires)) throw new Error("Invalid pairing response");
  const dir = resolve(root, "pairings");
  await mkdir(dir, { recursive: true, mode: 0o700 }); await chmod(root, 0o700); await chmod(dir, 0o700);
  const path = resolve(dir, encodeURIComponent(pairing.repo.toLowerCase()) + ".json");
  const temp = path + "." + crypto.randomUUID();
  await Bun.write(temp, JSON.stringify(pairing), { mode: 0o600 }); await chmod(temp, 0o600); await rename(temp, path);
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
export async function removePairing(repo: string, root = runnerHome()) { await rm(resolve(root, "pairings", encodeURIComponent(repo.toLowerCase()) + ".json"), { force: true }); }
export async function pairMachine(base: string, root = runnerHome()) {
  const start = await fetch(`${base}/api/runner-device/start`, { method: "POST", signal: AbortSignal.timeout(30000) });
  if (!start.ok) throw new Error(`Could not start pairing (${start.status})`);
  const { code, secret, expires, verificationUri } = await start.json() as { code: string; secret: string; expires: number; verificationUri: string };
  if (new URL(verificationUri).origin !== base || !/^[A-F0-9]{4}(-[A-F0-9]{4}){2}$/.test(code) || !Number.isFinite(expires) || expires > Date.now() + 11 * 60_000 || typeof secret !== "string") throw new Error("Invalid device response");
  console.log(`\nConnect your machine. Compare this code in your browser: ${code}\n${verificationUri}\nWaiting for your approval (10 minutes)…`);
  const opener = process.platform === "darwin" ? "open" : "xdg-open";
  if (Bun.which(opener)) { const child = Bun.spawn([opener, verificationUri], { stdout: "ignore", stderr: "ignore" }); await child.exited; }
  while (Date.now() < expires) {
    await Bun.sleep(3000);
    const response = await fetch(`${base}/api/runner-device/poll`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ code, secret }), signal: AbortSignal.timeout(30000) });
    if (!response.ok) throw new Error(`Pairing failed (${response.status}); run pair again`);
    const result = await response.json() as Pairing & { status: string };
    if (result.status === "approved") { await savePairing(result, root); console.log(`Connected to ${result.repo}. Your agent sign-ins stay on this computer.`); return; }
    if (result.status === "expired") break;
  }
  throw new Error("Pairing code expired or already used. Run shiptorio-runner pair again.");
}
