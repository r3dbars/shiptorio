import { mkdir, lstat } from "node:fs/promises";
import { chmod } from "node:fs/promises";
import { resolve } from "node:path";
import { agentEnvironment, harnessArgs, validateChanges } from "./policy";
import { TEST_PATH, verifyRegression } from "./verify";
import { assertVerificationPlatform, checkSandbox, type CheckSandbox } from "./sandbox";
import { snapshotApproved, publishApproved } from "./publication";
import { runnerHome, loadPairings, savePairing, removePairing, pairMachine, type Pairing } from "./pairing";

interface Job { id: string; repo: string; harness: "codex" | "claude_code"; baseSha: string; branch: string; allowedPaths: string[]; plan: string; lease: string; token: string; deadline: number; reworkPr?: number; verifyBaseSha?: string; prTestFiles?: string[] }
const root = runnerHome();
const checkout = process.cwd();
const cleanEnv = agentEnvironment(process.env);
const harnessPath = (h: Job["harness"]) => Bun.which(h === "codex" ? "codex" : "claude");
const available = (["codex", "claude_code"] as const).filter(h => harnessPath(h));
if (process.argv[2] === "paths") {
  console.log(JSON.stringify({ root, checkout, harnesses: available }));
  process.exit(0);
}
async function command(args: string[], cwd: string, env = cleanEnv, timeout = 120000): Promise<string> {
  const p = Bun.spawn(args, { cwd, env, stdout: "pipe", stderr: "pipe" });
  const timer = setTimeout(() => p.kill(), timeout);
  const [out, err, code] = await Promise.all([new Response(p.stdout).text(), new Response(p.stderr).text(), p.exited]);
  clearTimeout(timer);
  if (code !== 0) throw new Error(`Command ${args[0].split("/").at(-1)} ${args[1]} failed (${code}): ${(err || out).slice(-2000)}`);
  return out.trim();
}
if (process.argv[2] === "doctor") {
  for (const h of available) {
    const output = await command([harnessPath(h)!, ...(h === "codex" ? ["login", "status"] : ["auth", "status"])], checkout);
    // Codex writes login status to stderr, so its zero exit status is the proof.
    if (h === "claude_code" && !JSON.parse(output).loggedIn) throw new Error("Claude is not signed in");
    console.log(`${h}: installed and signed in`);
  }
  if (!available.length) throw new Error("Install and sign in to Codex or Claude Code first");
  process.exit(0);
}
const base = process.env.SHIPTORIO_URL || "https://shiptorio.com";
if (!["https://shiptorio.com", "https://shiptorio.dev", "http://localhost:8787"].includes(base)) throw new Error("Unsupported Shiptorio origin");
const action = process.argv[2] ?? "watch";
if (action === "pair") { await pairMachine(base, root); process.exit(0); }
if (action === "uninstall") {
  console.log("Stop other runner terminals first. Removing standalone runner and local pairings.");
  const { rm } = await import("node:fs/promises");
  const { homedir } = await import("node:os");
  // Fixed install paths only; environment overrides must never become recursive delete targets.
  await rm(resolve(homedir(), ".local/bin/shiptorio-runner"), { force: true });
  await rm(resolve(homedir(), ".local/share/shiptorio/runner"), { recursive: true, force: true });
  console.log("Removed. Disconnect this machine in each factory to revoke its credential.");
  process.exit(0);
}
async function api(pair: Pairing, action: string, body: unknown): Promise<any> {
  const r = await fetch(`${base}/api/runner/${pair.repo}/${action}`, { method: "POST", headers: { authorization: `Bearer ${pair.token}`, "content-type": "application/json" }, body: JSON.stringify(body), signal: AbortSignal.timeout(30000) });
  if (!r.ok) { const error = new Error(`Runner ${pair.repo} ${action} failed (${r.status})`); Object.assign(error, { status: r.status }); throw error; }
  return r.json();
}
async function renewPairing(pair: Pairing) {
  if (pair.expires > Date.now() + 60 * 60 * 1000) return;
  const renewed = await api(pair, "renew", {});
  Object.assign(pair, renewed);
  if (process.env.SHIPTORIO_REPO === pair.repo) {
    const file = resolve(root, ".dev.vars");
    await Bun.write(file, `SHIPTORIO_URL=${base}\nSHIPTORIO_REPO=${pair.repo}\nSHIPTORIO_RUNNER_TOKEN=${pair.token}\n`, { mode: 0o600 }); await chmod(file, 0o600);
  } else await savePairing(pair, root);
}
async function execute(job: Job, pair: Pairing) {
  const repo = pair.repo;
  if (job.repo !== repo || !/^[a-f0-9]{40}$/.test(job.baseSha) || (!job.reworkPr && job.branch !== `shiptorio/runner-${job.id}` || !!job.reworkPr && (!Number.isInteger(job.reworkPr) || job.reworkPr < 1 || !/^shiptorio\/runner-[a-f0-9-]{36}$/.test(job.branch))) || !/^[a-f0-9-]{36}$/.test(job.id) || job.deadline <= Date.now()) throw new Error("Invalid job assignment");
  const work = resolve(root, ".work", job.id);
  const gitEnv = { ...cleanEnv, GIT_CONFIG_COUNT: "1", GIT_CONFIG_KEY_0: "http.https://github.com/.extraheader", GIT_CONFIG_VALUE_0: `AUTHORIZATION: basic ${Buffer.from(`x-access-token:${job.token}`).toString("base64")}`, GIT_TERMINAL_PROMPT: "0" };
  let summary = "";
  let sandbox: CheckSandbox | undefined;
  const checked = async (args: string[], install = false): Promise<string> => {
    if (!sandbox) throw new Error("Verification sandbox not prepared");
    const result = await sandbox.run(args, work, { install });
    if (result.code) throw new Error(`Sandboxed ${args[0].split("/").at(-1)} ${args[1]} failed (${result.code}): ${(result.err || result.out).slice(-2000)}`);
    return result.out.trim();
  };
  try {
    await mkdir(resolve(root, ".work"), { recursive: true });
    // Fresh clone contains tracked files only: no primary checkout secrets, hooks or local edits.
    await command(["git", "clone", "--no-checkout", "--", `https://github.com/${job.repo}.git`, work], checkout, gitEnv);
    sandbox = await checkSandbox(work);
    await checked(["git", "checkout", "--detach", job.baseSha]);
    const prompt = `You are Shiptorio's ${job.harness} assembler, executing Muse Spark's approved plan.\n${job.plan}\n\nOnly edit these exact paths: ${job.allowedPaths.join(", ")}. Read AGENTS.md and relevant product docs. Make the smallest fix and a regression test. Do not commit, push, deploy, access secrets, invoke other agents, change settings, or write outside this checkout. The supervisor will run checks and publish the branch. Return a short summary.\n`;
    console.log(`Running ${job.harness} in isolated checkout ${job.id}; Spark planned the task.`);
    const output = await command([harnessPath(job.harness)!, ...harnessArgs(job.harness, prompt)], work, cleanEnv, 15 * 60 * 1000);
    // Preserve local evidence; never forward raw agent output to the server/browser.
    await Bun.write(resolve(root, ".work", `${job.id}.agent.log`), output);
    if (job.harness === "claude_code" && JSON.parse(output).is_error) throw new Error("Claude reported an agent error");
    if (await checked(["git", "rev-parse", "HEAD"]) !== job.baseSha) throw new Error("Agent changed checkout history");
    const paths = (await checked(["git", "ls-files", "--modified", "--others", "--exclude-standard"])).split("\n").filter(Boolean);
    for (const path of paths) if (!(await lstat(resolve(work, path))).isFile()) throw new Error("Non-regular patch file");
    // Stage only approved regular files, including newly created tests, then validate the complete diff.
    if (!paths.length || paths.some(p => !job.allowedPaths.includes(p))) throw new Error("Unexpected or empty agent changes");
    await checked(["git", "add", "--", ...paths]);
    const diff = await checked(["git", "diff", "--cached", "--no-ext-diff", "--no-textconv"]);
    validateChanges(paths, job.allowedPaths, diff);
    const frozen = await snapshotApproved(sandbox, paths);
    await checked([process.execPath, "install", "--frozen-lockfile", "--ignore-scripts"], true);
    const checks = ["typecheck", "test", "build"] as const;
    for (const check of checks) { console.log(`Supervisor check: ${check}`); await checked([process.execPath, "run", check]); }
    const verifyPaths = [...new Set([...paths, ...(job.prTestFiles ?? [])])].filter(p => TEST_PATH.test(p));
    const docsOnly = !job.reworkPr && paths.every(p => /\.(md|mdx|txt)$|(^|\/)docs\//i.test(p));
    const proof = docsOnly ? undefined : await verifyRegression(work, job.verifyBaseSha ?? job.baseSha, verifyPaths, cleanEnv);
    if (proof) {
      await Bun.write(resolve(root, ".work", `${job.id}.verify.log`), proof.logTail);
      console.log(`Verify bay: base fails=${proof.failsOnBase}, head passes=${proof.passesOnHead}`);
      if (verifyPaths.length && !proof.passesOnHead) throw new Error("Regression recipe failed on the fix commit");
    }
    if (JSON.stringify(await snapshotApproved(sandbox, paths)) !== JSON.stringify(frozen)) throw new Error("Checks changed approved files");
    // Publication is rebuilt from a fresh trusted clone; hostile hooks/config never see credentials.
    const sha = await publishApproved(job, frozen);
    summary = `Changed files: ${paths.join(", ")} (approved: ${job.allowedPaths.join(", ")}). Supervisor validated the scope and secret scan, then passed typecheck, tests and build. Agent output stays local.`;
    const receipt = { jobId: job.id, lease: job.lease, ok: true, sha, summary, checks, proof: proof ? { ...proof, headSha: sha } : undefined };
    await Bun.write(resolve(root, ".work", `${job.id}.receipt.json`), JSON.stringify(receipt));
    console.log(JSON.stringify(await api(pair, "finish", receipt)));
  } catch (error) {
    // If a push/ack succeeded but transport failed, keep the success receipt for explicit retry.
    const receipt = Bun.file(resolve(root, ".work", `${job.id}.receipt.json`));
    if (!(await receipt.exists())) await api(pair, "finish", { jobId: job.id, lease: job.lease, ok: false, summary: "Local runner stopped; inspect local evidence and approve another attempt.", checks: [] }).catch(() => {});
    throw error;
  } finally { await sandbox?.close(); job.token = ""; gitEnv.GIT_CONFIG_VALUE_0 = ""; }
}
async function connections() {
  const pairs = await loadPairings(root);
  const repo = process.env.SHIPTORIO_REPO, token = process.env.SHIPTORIO_RUNNER_TOKEN;
  if (repo && token && !pairs.some(p => p.repo === repo)) {
    const claims = JSON.parse(atob(token.split(".")[0].replace(/-/g, "+").replace(/_/g, "/")));
    pairs.push({ repo, token, expires: claims.expires });
  }
  return pairs;
}
let pairs = await connections();
if (!pairs.length) { await pairMachine(base, root); pairs = await connections(); }
if (action === "retry") {
  const id = process.argv[3]; if (!/^[a-f0-9-]{36}$/.test(id ?? "")) throw new Error("Expected job UUID");
  const receipt = await Bun.file(resolve(root, ".work", `${id}.receipt.json`)).json();
  const repo = process.argv[4] ?? (pairs.length === 1 ? pairs[0].repo : "");
  const pair = pairs.find(p => p.repo === repo); if (!pair) throw new Error("Specify the receipt repository after the job UUID");
  console.log(JSON.stringify(await api(pair, "finish", receipt)));
} else {
  await assertVerificationPlatform();
  console.log(`Local runner ready: ${available.join(", ") || "no installed agents"}. Watching ${pairs.map(p => p.repo).join(", ")}. Only approved jobs run. Ctrl-C to stop.`);
  const once = action !== "watch";
  let heartbeatBusy = false;
  const heartbeat = setInterval(async () => {
    if (heartbeatBusy) return;
    heartbeatBusy = true;
    try { for (const pair of await connections()) await api(pair, "heartbeat", { harnesses: available }).catch(() => {}); }
    finally { heartbeatBusy = false; }
  }, 5000);
  try {
    do {
      for (const pair of await connections()) {
        try {
          await renewPairing(pair);
          const { job } = await api(pair, "claim", { harnesses: available });
          if (job) await execute(job, pair); else if (once) console.log(`${pair.repo}: no approved Spark job is ready.`);
        } catch (error) {
          console.error(error instanceof Error ? error.message : "Runner request failed");
          if ((error as { status?: number }).status === 401) {
            if (pair.repo !== process.env.SHIPTORIO_REPO) await removePairing(pair.repo, root);
            console.error(`${pair.repo}: pairing expired or revoked. Run shiptorio-runner pair to reconnect.`);
          }
        }
      }
      if (!once) await Bun.sleep(5000);
    } while (!once);
  } finally { clearInterval(heartbeat); }
}
