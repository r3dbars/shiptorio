import { mkdir, lstat, realpath } from "node:fs/promises";
import { chmod } from "node:fs/promises";
import { resolve } from "node:path";
import { agentEnvironment, assemblerPrompt, assertCheckCommand, harnessArgs, validateChanges } from "./policy";
import { TEST_PATH, verifyRegression } from "./verify";
import { assertVerificationPlatform, checkSandbox, type CheckSandbox, verificationGit } from "./sandbox";
import { assemblerContext, snapshotApproved, publishApproved } from "./publication";
import { runnerHome, loadPairings, savePairing, removePairing, pairMachine, type Pairing } from "./pairing";


import { jobWorkspace } from "./workspace";
import { responseSchemas, type Job } from "./messages";
import { detectLocalModel, localModelConfig, runLocalAssembler } from "./local-model";
import { redactText } from "../../server/src/redact";
const root = process.env.SHIPTORIO_RUNNER_ROOT ? runnerHome() : process.env.SHIPTORIO_REPO ? resolve(import.meta.dir, "..") : runnerHome();
const checkout = process.cwd();
const cleanEnv = agentEnvironment(process.env);
const authHome = resolve(root, ".agent-home");
const harnessPath = (h: Exclude<Job["harness"], "local">) => Bun.which(h === "codex" ? "codex" : "claude");
const localFile = Bun.file(resolve(root, "local-model.json"));
const local = localModelConfig(process.env, await localFile.exists() ? await localFile.json() : null);
const localStatus = local ? await detectLocalModel(local) : null;
let available: Job["harness"][] = [...(["codex", "claude_code"] as const).filter(h => harnessPath(h)), ...(localStatus?.ok ? ["local" as const] : [])];

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
if (process.argv[2] === "geothermal") {
  // bun run runner geothermal MODEL [URL]: save local-model settings, then check the endpoint answers.
  const config = localModelConfig({ SHIPTORIO_LOCAL_MODEL: process.argv[3] ?? "", SHIPTORIO_LOCAL_MODEL_URL: process.argv[4] ?? "" });
  if (!config) throw new Error("Usage: runner geothermal MODEL [URL], e.g. runner geothermal qwen2.5-coder:7b");
  const status = await detectLocalModel(config);
  await Bun.write(resolve(root, "local-model.json"), JSON.stringify({ model: config.model, url: config.baseUrl }, null, 2) + "\n");
  console.log(status.ok ? `Geothermal online: ${config.model} at ${config.baseUrl}. Restart the runner to offer it.` : `Saved, but not ready yet: ${status.reason}`);
  process.exit(0);
}
async function signedInHarness(h: Job["harness"]) {
  if (h === "local") return localStatus?.ok === true;
  try {

    const output = await command([harnessPath(h)!, ...(h === "codex" ? ["login", "status"] : ["auth", "status"])], authHome, agentEnvironment(process.env, authHome));
    return h === "codex" || JSON.parse(output).loggedIn === true;
  } catch { return false; }
}
async function loginHarness(h: Job["harness"]) {
  if (h === "local") throw new Error("Local models do not need subscription login");
  console.log(`Sign in to ${h === "codex" ? "Codex" : "Claude Code"} for Shiptorio. This dedicated local login keeps your normal agent home outside job sandboxes.`);
  const child = Bun.spawn([harnessPath(h)!, ...(h === "codex" ? ["login"] : ["auth", "login"])], { cwd: authHome, env: agentEnvironment(process.env, authHome), stdin: "inherit", stdout: "inherit", stderr: "inherit" });
  if (await child.exited || !await signedInHarness(h)) throw new Error("Agent sign-in did not finish. Run shiptorio-runner login codex (or claude) and try again.");
}
if (["doctor", "setup", "login"].includes(process.argv[2])) {
  await mkdir(resolve(authHome, ".codex"), { recursive: true, mode: 0o700 });
  if (!available.length) throw new Error("Install Codex CLI or Claude Code first, then rerun the installer. See https://shiptorio.com/docs/runner");
  if (process.argv[2] === "login") {
    const h = process.argv[3] === "claude" ? "claude_code" : process.argv[3] === "codex" ? "codex" : null;
    if (!h || !available.includes(h)) throw new Error("Use login codex or login claude, with that CLI installed");
    await loginHarness(h);
  }
  let ready = false;
  for (const h of available) {
    if (h === "local") { console.log(`local: ${local!.model} at ${local!.baseUrl} (geothermal power)`); ready = true; continue; }
    const loggedIn = await signedInHarness(h);
    console.log(`${h}: ${loggedIn ? "installed and signed in for Shiptorio" : "installed; needs dedicated sign-in (shiptorio-runner login " + (h === "codex" ? "codex" : "claude") + ")"}`);
    ready ||= loggedIn;
  }
  if (!ready && process.argv[2] === "setup") await loginHarness(available[0]);
  else if (!ready) throw new Error("Sign in for Shiptorio with the login command printed above.");
  await assertVerificationPlatform();
  process.exit(0);
}
const base = process.env.SHIPTORIO_URL || "https://shiptorio.com";
if (!["https://shiptorio.com", "https://shiptorio.dev"].includes(base) && !/^http:\/\/(localhost|127\.0\.0\.1):[0-9]{4,5}$/.test(base)) throw new Error("Unsupported Shiptorio origin");
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
async function api(pair: Pairing, action: keyof typeof responseSchemas, body: unknown): Promise<any> {
  const r = await fetch(`${base}/api/runner/${pair.repo}/${action}`, { method: "POST", headers: { authorization: `Bearer ${pair.token}`, "content-type": "application/json" }, body: JSON.stringify(body), signal: AbortSignal.timeout(30000) });
  if (!r.ok) { const error = new Error(`Runner ${pair.repo} ${action} failed (${r.status})`); Object.assign(error, { status: r.status }); throw error; }
  const text = await r.text();
  if (text.length > 128000) throw new Error("Runner response exceeds size limit");
  return responseSchemas[action].parse(JSON.parse(text));

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
  assemblerPrompt(job); // Validate before creating workspace or launching any child.
  const workspace = await jobWorkspace(root, job.id);
  const jobRoot = workspace.directory, work = workspace.work;
  const gitEnv = { ...cleanEnv, GIT_CONFIG_COUNT: "1", GIT_CONFIG_KEY_0: "http.https://github.com/.extraheader", GIT_CONFIG_VALUE_0: `AUTHORIZATION: basic ${Buffer.from(`x-access-token:${job.token}`).toString("base64")}`, GIT_TERMINAL_PROMPT: "0" };
  let summary = "";
  let sandbox: CheckSandbox | undefined;
  let agentSandbox: CheckSandbox | undefined;
  const checked = async (args: string[], install = false): Promise<string> => {
    if (!sandbox) throw new Error("Verification sandbox not prepared");
    const result = await sandbox.run(args, work, { install });
    if (result.code) throw new Error(`Sandboxed ${args[0].split("/").at(-1)} ${args[1]} failed (${result.code}): ${(result.err || result.out).slice(-2000)}`);
    return result.out.trim();
  };
  try {
    await mkdir(resolve(authHome, ".codex"), { recursive: true, mode: 0o700 });
    if (await realpath(authHome) !== authHome) throw new Error("Agent home must not be a symlink");
    // Fresh clone contains tracked files only: no primary checkout secrets, hooks or local edits.
    const source = resolve(jobRoot, "source.git");
    await command([await verificationGit(), "-c", "core.hooksPath=/dev/null", "clone", "--bare", "--", `https://github.com/${job.repo}.git`, source], jobRoot, gitEnv);
    await command([await verificationGit(), "-c", "core.hooksPath=/dev/null", "--git-dir", source, "worktree", "add", "--detach", work, job.baseSha], jobRoot, cleanEnv);
    const boundary = await checkSandbox(jobRoot);
    sandbox = { run: (args, cwd = work, options) => boundary.run(args, cwd, options), close: () => boundary.close() };
    await checked(["git", "checkout", "--detach", job.baseSha]);
    let output: string;
    if (job.harness === "local") {
      // Geothermal: the model only returns text; the runner writes approved files, then the same supervisor runs.
      console.log(`Running local model ${local!.model} in isolated checkout ${job.id}; geothermal power, Spark planned the task.`);
      output = JSON.stringify(await runLocalAssembler(job, work, local!));
    } else {
      const prompt = assemblerPrompt(job, await assemblerContext(sandbox, job.allowedPaths));
      console.log(`Running ${job.harness} in isolated checkout ${job.id}; Spark planned the task.`);
      const executable = harnessPath(job.harness);
      if (!executable) throw new Error("Assigned harness is unavailable");
      agentSandbox = await checkSandbox(jobRoot, { home: authHome, executable });
      const result = await agentSandbox.run([executable, ...harnessArgs(job.harness, prompt)], work, { timeout: 15 * 60 * 1000 });
      if (result.code) {
        // The redacted stderr tail stays on this Mac (service-error.log); the server only sees the generic failure.
        console.error(`${job.harness} exited ${result.code}: ${redactText(result.err.trim().slice(-2000))}`);
        throw new Error(`Agent failed (${result.code}); see the runner log for the agent's error`);
      }
      output = result.out;
      await agentSandbox.close(); agentSandbox = undefined;
    }
    // Preserve local evidence; never forward raw agent output to the server/browser.
    await Bun.write(resolve(root, ".work", `${job.id}.agent.log`), output, { mode: 0o600 });
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
    const manifest = await sandbox.run([process.execPath, "--no-env-file", "-e", 'console.log(JSON.stringify(Object.keys((await Bun.file("package.json").json()).scripts ?? {})))'], work);
    if (manifest.code) throw new Error("Cannot read repository scripts");
    const scripts = JSON.parse(manifest.out) as string[];
    const checkCommand = async (args: string[], install = false) => { assertCheckCommand(args, process.execPath, scripts); return checked(args, install); };
    await checkCommand([process.execPath, "install", "--frozen-lockfile", "--ignore-scripts"], true);
    const checks = ["typecheck", "test", "build"] as const;
    for (const check of checks) { console.log(`Supervisor check: ${check}`); await checkCommand([process.execPath, "run", check]); }
    const verifyPaths = [...new Set([...paths, ...(job.prTestFiles ?? [])])].filter(p => TEST_PATH.test(p));
    const docsOnly = !job.reworkPr && paths.every(p => /\.(md|mdx|txt)$|(^|\/)docs\//i.test(p));
    const proof = docsOnly ? undefined : await verifyRegression(work, job.verifyBaseSha ?? job.baseSha, verifyPaths, cleanEnv, jobRoot);
    if (proof) {
      await Bun.write(resolve(root, ".work", `${job.id}.verify.log`), proof.logTail, { mode: 0o600 });
      console.log(`Verify bay: base fails=${proof.failsOnBase}, head passes=${proof.passesOnHead}`);
      if (verifyPaths.length && !proof.passesOnHead) throw new Error("Regression recipe failed on the fix commit");
    }
    if (JSON.stringify(await snapshotApproved(sandbox, paths)) !== JSON.stringify(frozen)) throw new Error("Checks changed approved files");
    // Publication is rebuilt from a fresh trusted clone; hostile hooks/config never see credentials.
    const sha = await publishApproved(job, frozen);
    summary = `Changed files: ${paths.join(", ")} (approved: ${job.allowedPaths.join(", ")}). Supervisor validated the scope and secret scan, then passed typecheck, tests and build. Agent output stays local.`;
    const receipt = { jobId: job.id, lease: job.lease, ok: true, sha, summary, checks, proof: proof ? { ...proof, headSha: sha } : undefined };
    await Bun.write(resolve(root, ".work", `${job.id}.receipt.json`), JSON.stringify(receipt), { mode: 0o600 });
    console.log(JSON.stringify(await api(pair, "finish", receipt)));
  } catch (error) {
    // If a push/ack succeeded but transport failed, keep the success receipt for explicit retry.
    const receipt = Bun.file(resolve(root, ".work", `${job.id}.receipt.json`));
    if (!(await receipt.exists())) await api(pair, "finish", { jobId: job.id, lease: job.lease, ok: false, summary: "Local runner stopped; inspect local evidence and approve another attempt.", checks: [] }).catch(() => {});
    throw error;
  } finally { await agentSandbox?.close(); await sandbox?.close(); await workspace.close(); job.token = ""; gitEnv.GIT_CONFIG_VALUE_0 = ""; }
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
await mkdir(resolve(authHome, ".codex"), { recursive: true, mode: 0o700 });
const readyHarnesses: Job["harness"][] = [];
for (const h of available) if (await signedInHarness(h)) readyHarnesses.push(h);
available = readyHarnesses;
if (!available.length) throw new Error("No signed-in agent. Run shiptorio-runner setup first.");
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
