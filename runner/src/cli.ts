import { runnerOrigin } from "./origin";
import { freeSubscriptions, prepareAgentHome, subscriptionArgs, subscriptionSignedIn, subscriptionCredentialVersion } from "./subscriptions";
import { assembleCodex } from "./codex-assembler";
import { probeAssemblerEdit } from "./edit-probe";
import { mkdir, lstat, realpath, rm, mkdtemp } from "node:fs/promises";
import { resolve } from "node:path";
import { agentEnvironment, assemblerPrompt, assertCheckCommand, harnessArgs, validateChanges } from "./policy";
import { TEST_PATH, resetVerifyBase, verifyRegression } from "./verify";
import { assertVerificationPlatform, checkSandbox, type CheckSandbox, verificationGit } from "./sandbox";
import { assemblerContext, snapshotApproved, publishApproved } from "./publication";
import { runnerHome, loadPairings, pairMachine, joinMachine, type Pairing } from "./pairing";
import { loadConnections, persistRenewal } from "./grant-store";


import { atomicJson, Backoff, recoverWorkspace, replayReceipts, retryable } from "./recovery";
import { AuthFailures, agentOffline, authExpired, diagnose, loginCommand, type Subscription } from "./health";
import { tmpdir } from "node:os";
const blocked = new Set<Subscription>();
const authFailures = new AuthFailures();
class SignInExpired extends Error {}
import { responseSchemas, type Job } from "./messages";
import { detectLocalModel, localModelConfig, runLocalAssembler } from "./local-model";
import { redactText } from "../../server/src/redact";
const root = process.env.SHIPTORIO_RUNNER_ROOT ? runnerHome() : process.env.SHIPTORIO_REPO ? resolve(import.meta.dir, "..") : runnerHome();
// Resolve the installation origin before provider probes or authenticated runner calls.
// Pre-self-host installations have no server-url file and belong to shiptorio.com.
const originFile = Bun.file(resolve(root, "server-url"));
const pinnedOrigin = await originFile.exists() ? (await originFile.text()).trim() : (await loadPairings(root)).length ? "https://shiptorio.com" : undefined;
const base = runnerOrigin(process.env.SHIPTORIO_URL || pinnedOrigin || "https://shiptorio.com", pinnedOrigin);
async function pinPairingOrigin() {
  await mkdir(root, { recursive: true, mode: 0o700 });
  await Bun.write(originFile, base + "\n", { mode: 0o600 });
}
const checkout = process.cwd();
const cleanEnv = agentEnvironment(process.env);
const authHome = await prepareAgentHome(root);
const harnessPath = (h: Exclude<Job["harness"], "local">) => Bun.which(h === "codex" ? "codex" : "claude");
const localFile = Bun.file(resolve(root, "local-model.json"));
const local = localModelConfig(process.env, await localFile.exists() ? await localFile.json() : null);
const localStatus = local ? await detectLocalModel(local) : null;
const installedSubscriptions = (["codex", "claude_code"] as const).filter(h => harnessPath(h));
const busySubscriptions = new Set<"codex" | "claude_code">();
let available: Job["harness"][] = [...(["codex", "claude_code"] as const).filter(h => harnessPath(h)), ...(localStatus?.ok ? ["local" as const] : [])];

if (process.argv[2] === "paths") {
  console.log(JSON.stringify({ root, checkout, harnesses: available }));
  process.exit(0);
}
async function command(args: string[], cwd: string, env = cleanEnv, timeout = 120000): Promise<string> {
  const p = Bun.spawn(args, { cwd, env, stdout: "pipe", stderr: "pipe" });
  let timedOut = false;
  const timer = setTimeout(() => { timedOut = true; p.kill(); }, timeout);
  const [out, err, code] = await Promise.all([new Response(p.stdout).text(), new Response(p.stderr).text(), p.exited]);
  clearTimeout(timer);
  if (code !== 0 && (timedOut || agentOffline(err + out))) throw new TypeError("Runner connection interrupted or timed out; retrying with saved work");
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
  const executable = harnessPath(h);
  return executable ? subscriptionSignedIn(h, executable, authHome) : false;
}
async function loginHarness(h: Job["harness"]) {
  if (h === "local") throw new Error("Local models do not need subscription login");
  console.log(`Sign in to ${h === "codex" ? "Codex" : "Claude Code"} for Shiptorio. This dedicated local login keeps your normal agent home outside job sandboxes.`);
  const child = Bun.spawn([harnessPath(h)!, ...subscriptionArgs(h, true)], { cwd: authHome, env: agentEnvironment(process.env, authHome), stdin: "inherit", stdout: "inherit", stderr: "inherit" });
  if (await child.exited || !await signedInHarness(h)) throw new Error("Agent sign-in did not finish. Run shiptorio-runner login codex (or claude) and try again.");
  // Keychain-only reauthentication need not change a credential file. Wake a watching runner's auth guard.
  if (h === "claude_code") await Bun.write(resolve(authHome, ".claude/.shiptorio-login"), crypto.randomUUID(), { mode: 0o600 });
}
if (process.argv[2] === "doctor") {
  const args = process.argv.slice(3);
  if (args.length && (args.length !== 2 || args[0] !== "--edit" || args[1] !== "codex")) throw new Error("Usage: shiptorio-runner doctor [--edit codex]");
  const realEdit = args.length > 0;
  if (realEdit) console.log("Real edit probe: one small Codex subscription request in a disposable repository; no factory job is claimed.");
  await mkdir(resolve(authHome, ".codex"), { recursive: true, mode: 0o700 });
  const checks = await diagnose({ harnesses: available, pairs: await connections(), auth: signedInHarness,
    editHarness: realEdit ? "codex" : undefined,
    edit: async () => {
      try {
        await probeAssemblerEdit(async context => {
          const result = await assembleCodex({ root: context.root, work: context.work, home: authHome, executable: harnessPath("codex")!, timeout: 120000,
            job: { plan: context.plan, allowedPaths: context.allowedPaths }, files: context.files, verification: context.verification });
          if (result.code || result.timedOut) throw new Error(`Codex edit probe failed (${result.code}): ${redactText(result.err.slice(-2000))}`);
        });
      } catch (error) { console.error(redactText(error instanceof Error ? error.message : "Real edit probe failed")); throw error; }
    },
    pairing: pair => api(pair, "renew", {}),
    sandbox: async h => {
      const dir = await mkdtemp(resolve(tmpdir(), "shiptorio-doctor-"));
      let boundary: CheckSandbox | undefined;
      try {
        boundary = await checkSandbox(dir, h ? { home: authHome, executable: harnessPath(h)! } : undefined);
        // Exercise CLI startup, managed preferences and HTTPS inside the agent boundary (#235), without inference.
        const probe = h ? [harnessPath(h)!, ...subscriptionArgs(h)] : [process.execPath, "--no-env-file", "-e", "console.log('sandbox OK')"];
        const result = await boundary.run(probe, dir, { timeout: 30000 });
        if (result.code && !(h && authExpired(result.err + result.out))) { console.error(redactText(result.err.slice(-2000))); throw Error("Sandbox probe failed"); }
        if (h) {
          if (process.platform === "darwin") {
            const preferences = await boundary.run(["/usr/bin/defaults", "read", "NSGlobalDomain"], dir, { timeout: 10000 });
            // An empty preference domain is valid; Seatbelt/config sync failures are not.
            if (/not permitted|failed to synchronize|sandbox.*deny/i.test(preferences.err)) throw Error("Managed preferences unavailable in sandbox");
          }
          const network = await boundary.run([process.execPath, "--no-env-file", "-e", 'await fetch("https://shiptorio.com/api/version",{signal:AbortSignal.timeout(10000)});console.log("HTTPS OK")'], dir, { timeout: 15000 });
          if (network.code) { console.error(redactText(network.err.slice(-2000))); throw Error("Sandbox HTTPS probe failed"); }
        }
      } finally { await boundary?.close(); await rm(dir, { recursive: true, force: true }); }
    } });
  for (const check of checks) console.log(`${check.ok ? "PASS" : "FAIL"} ${check.check}: ${check.detail}`);
  if (!realEdit) console.log("SKIP edit:codex: Not checked. Run shiptorio-runner doctor --edit codex for one real subscription edit.");
  process.exit(checks.every(c => c.ok) ? 0 : 1);
}
if (["setup", "login"].includes(process.argv[2])) {
  await mkdir(resolve(authHome, ".codex"), { recursive: true, mode: 0o700 });
  if (!available.length) throw new Error(`Install Codex CLI or Claude Code first, then rerun the installer. See ${base}/docs/runner`);
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
const action = process.argv[2] ?? "watch";
if (action === "pair") {
  await pinPairingOrigin();
  if (process.argv[3] === "--join") await joinMachine(base, process.argv[4] ?? "", root); else await pairMachine(base, root);
  process.exit(0);
}
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
  await persistRenewal(root, pair, renewed);
}
async function execute(job: Job, pair: Pairing) {
  const repo = pair.repo;
  if (job.repo !== repo || !/^[a-f0-9]{40}$/.test(job.baseSha) || (!job.reworkPr && job.branch !== `shiptorio/runner-${job.id}` || !!job.reworkPr && (!Number.isInteger(job.reworkPr) || job.reworkPr < 1 || !/^shiptorio\/runner-[a-f0-9-]{36}$/.test(job.branch))) || !/^[a-f0-9-]{36}$/.test(job.id) || job.deadline <= Date.now()) throw new Error("Invalid job assignment");
  assemblerPrompt(job); // Validate before creating workspace or launching any child.
  const receiptFile = resolve(root, ".work", `${job.id}.receipt.json`);
  if (await Bun.file(receiptFile).exists()) {
    const receipt = await Bun.file(receiptFile).json();
    if (receipt.jobId !== job.id || receipt.lease !== job.lease) throw new Error("Receipt lease mismatch");
    await api(pair, "finish", receipt);
    const recovered = await recoverWorkspace(root, job); await recovered.close();
    return;
  }
  const workspace = await recoverWorkspace(root, job);
  let completed = false;
  let preserve = false;
  const jobRoot = workspace.directory, work = workspace.work;
  const gitEnv = { ...cleanEnv, GIT_CONFIG_COUNT: "1", GIT_CONFIG_KEY_0: "http.https://github.com/.extraheader", GIT_CONFIG_VALUE_0: `AUTHORIZATION: basic ${Buffer.from(`x-access-token:${job.token}`).toString("base64")}`, GIT_TERMINAL_PROMPT: "0" };
  let summary = "";
  let sandbox: CheckSandbox | undefined;
  let agentSandbox: CheckSandbox | undefined;
  const checked = async (args: string[], install = false): Promise<string> => {
    if (!sandbox) throw new Error("Verification sandbox not prepared");
    if (job.deadline <= Date.now()) throw new Error("Build lease expired; approve a fresh attempt in the game");
    const result = await sandbox.run(args, work, { install, timeout: Math.min(180000, job.deadline - Date.now()) });
    if (result.timedOut) throw new TypeError("Supervisor interrupted or timed out; saved build will resume");
    if (result.code) throw new Error(`Sandboxed ${args[0].split("/").at(-1)} ${args[1]} failed (${result.code}): ${(result.err || result.out).slice(-2000)}`);
    return result.out.trim();
  };
  try {
    await mkdir(resolve(authHome, ".codex"), { recursive: true, mode: 0o700 });
    if (await realpath(authHome) !== authHome) throw new Error("Agent home must not be a symlink");
    // Fresh clone contains tracked files only: no primary checkout secrets, hooks or local edits.
    const source = resolve(jobRoot, "source.git");
    if (!workspace.state.initialized) {
      await rm(source, { recursive: true, force: true }); await rm(work, { recursive: true, force: true });
      await command([await verificationGit(), "-c", "core.hooksPath=/dev/null", "clone", "--bare", "--", `https://github.com/${job.repo}.git`, source], jobRoot, gitEnv);
      await command([await verificationGit(), "-c", "core.hooksPath=/dev/null", "--git-dir", source, "worktree", "add", "--detach", work, job.baseSha], jobRoot, cleanEnv);
      await workspace.checkpoint("initialized");
    }
    const boundary = await checkSandbox(jobRoot);
    sandbox = { run: async (args, cwd = work, options) => {
      const result = await boundary.run(args, cwd, options);
      if (result.timedOut) throw new TypeError("Supervisor interrupted or timed out; saved build will resume");
      return result;
    }, close: () => boundary.close() };
    await resetVerifyBase(sandbox, work);
    await checked(["git", "checkout", "--detach", job.baseSha]);
    let output = "";
    if (!workspace.state.agentDone) {
      if (job.harness === "local") {
        // Geothermal: the model only returns text; the runner writes approved files, then the same supervisor runs.
        console.log(`Running local model ${local!.model} in isolated checkout ${job.id}; geothermal power, Spark planned the task.`);
        output = JSON.stringify(await runLocalAssembler(job, work, local!));
      } else {
        const context = await assemblerContext(sandbox, job.allowedPaths);
        console.log(`Running ${job.harness} in isolated checkout ${job.id}; Spark planned the task.`);
        const executable = harnessPath(job.harness);
        if (!executable) throw new Error("Assigned harness is unavailable");
        const timeout = Math.max(1, Math.min(15 * 60 * 1000, job.deadline - Date.now()));
        let result;
        if (job.harness === "codex") result = await assembleCodex({ root: jobRoot, work, home: authHome, executable, timeout, job, files: context, verification: sandbox });
        else {
          agentSandbox = await checkSandbox(jobRoot, { home: authHome, executable });
          result = await agentSandbox.run([executable, ...harnessArgs(job.harness, assemblerPrompt(job, context))], work, { timeout });
        }
        if (result.code) {
          // The redacted stderr tail stays on this Mac (service-error.log); the server only sees the generic failure.
          console.error(`${job.harness} exited ${result.code}: ${redactText(result.err.trim().slice(-2000))}`);
          if (authExpired(result.err + "\n" + result.out)) {
            blocked.add(job.harness); authFailures.reject(job.harness, await subscriptionCredentialVersion(job.harness, authHome));
            throw new SignInExpired(`Sign-in expired: ${loginCommand(job.harness)}. The build is saved while its lease remains valid.`);
          }
          if (result.timedOut || agentOffline(result.err + "\n" + result.out)) throw new TypeError("Agent connection interrupted or timed out; saved build will resume");
          throw new Error(`Agent failed (${result.code}); see the runner log for the agent's error`);
        }
        output = result.out;
        await agentSandbox?.close(); agentSandbox = undefined;
      }
      // Preserve local evidence; never forward raw agent output to the server/browser.
      await Bun.write(resolve(root, ".work", `${job.id}.agent.log`), output, { mode: 0o600 });
      if (job.harness === "claude_code" && JSON.parse(output).is_error) {
        if (authExpired(output)) { blocked.add(job.harness); authFailures.reject(job.harness, await subscriptionCredentialVersion(job.harness, authHome)); throw new SignInExpired(`Sign-in expired: ${loginCommand(job.harness)}`); }
        if (agentOffline(output)) throw new TypeError("Agent connection interrupted; saved build will resume");
        throw new Error("Claude reported an agent error");
      }
      await workspace.checkpoint("agentDone");
    }
    if (await checked(["git", "rev-parse", "HEAD"]) !== job.baseSha) throw new Error("Agent changed checkout history");
    const paths = [...new Set(((await checked(["git", "diff", "HEAD", "--name-only", "--no-ext-diff"])) + "\n" + (await checked(["git", "ls-files", "--others", "--exclude-standard"]))).split("\n").filter(Boolean))];
    for (const path of paths) if (!(await lstat(resolve(work, path))).isFile()) throw new Error("Non-regular patch file");
    // Stage only approved regular files, including newly created tests, then validate the complete diff.
    if (!paths.length || paths.some(p => !job.allowedPaths.includes(p))) throw new Error("Unexpected or empty agent changes");
    await checked(["git", "add", "--", ...paths]);
    const diff = await checked(["git", "diff", "--cached", "--no-ext-diff", "--no-textconv"]);
    validateChanges(paths, job.allowedPaths, diff);
    const frozen = await snapshotApproved(sandbox, paths);
    await workspace.freeze(frozen);
    const manifest = await sandbox.run([process.execPath, "--no-env-file", "-e", 'console.log(JSON.stringify(Object.keys((await Bun.file("package.json").json()).scripts ?? {})))'], work);
    if (manifest.code) throw new Error("Cannot read repository scripts");
    const scripts = JSON.parse(manifest.out) as string[];
    const checkCommand = async (args: string[], install = false) => { assertCheckCommand(args, process.execPath, scripts); return checked(args, install); };
    try { await checkCommand([process.execPath, "install", "--frozen-lockfile", "--ignore-scripts"], true); }
    catch (error) { preserve = true; throw error; }
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
    // Publication/installation can fail offline. Keep the workspace and rerun all checks on recovery.
    if (job.deadline <= Date.now()) throw new Error("Build lease expired; approve a fresh attempt in the game");
    let sha: string;
    try { sha = await publishApproved(job, frozen); } catch (error) { preserve = true; throw error; }
    summary = `Changed files: ${paths.join(", ")} (approved: ${job.allowedPaths.join(", ")}). Supervisor validated the scope and secret scan, then passed typecheck, tests and build. Agent output stays local.`;
    const receipt = { jobId: job.id, lease: job.lease, ok: true, sha, summary, checks, proof: proof ? { ...proof, headSha: sha } : undefined };
    await atomicJson(receiptFile, receipt);
    console.log(JSON.stringify(await api(pair, "finish", receipt)));
    completed = true;
  } catch (error) {
    preserve ||= retryable(error) || error instanceof SignInExpired || await Bun.file(receiptFile).exists();
    if (!preserve) {
      const receipt = { jobId: job.id, lease: job.lease, ok: false, summary: "Local runner stopped; inspect local evidence and approve another attempt.", checks: [] };
      await atomicJson(receiptFile, receipt);
      try { await api(pair, "finish", receipt); completed = true; } catch { preserve = true; }
    }
    throw error;
  } finally { await agentSandbox?.close(); await sandbox?.close(); if (completed) await workspace.close(); job.token = ""; gitEnv.GIT_CONFIG_VALUE_0 = ""; }

}
async function connections() {
  return loadConnections(root, { SHIPTORIO_REPO: process.env.SHIPTORIO_REPO, SHIPTORIO_RUNNER_TOKEN: process.env.SHIPTORIO_RUNNER_TOKEN });
}
await mkdir(resolve(authHome, ".codex"), { recursive: true, mode: 0o700 });
let pairs = await connections();
if (!pairs.length) { await pinPairingOrigin(); await pairMachine(base, root); pairs = await connections(); }
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
  const backoffs = new Map<string, Backoff>();
  const heartbeatBackoffs = new Map<string, Backoff>();
  let heartbeatBusy = false;
  const refreshAuth = async () => {
    const next: Job["harness"][] = [];
    for (const h of available) {
      if (h === "local" ? await signedInHarness(h) : authFailures.ready(h, await signedInHarness(h), await subscriptionCredentialVersion(h, authHome))) { next.push(h); if (h !== "local") blocked.delete(h); }
      else if (h !== "local") blocked.add(h);
    }
    return next;
  };
  let ready = await refreshAuth();
  for (const pair of pairs) await api(pair, "heartbeat", { harnesses: ready, authRequired: [...blocked] }).catch(() => {});
  const heartbeat = setInterval(async () => {
    if (heartbeatBusy) return;
    heartbeatBusy = true;
    try {
      ready = await refreshAuth();
      for (const pair of await connections()) {
        const retry = heartbeatBackoffs.get(pair.repo) ?? new Backoff(); heartbeatBackoffs.set(pair.repo, retry);
        if (!retry.ready()) continue;
        try { await api(pair, "heartbeat", { harnesses: ready, authRequired: [...blocked] }); retry.reset(); }
        catch (error) { retry.fail(); console.error(`${pair.repo}: heartbeat unavailable; retrying. ${error instanceof Error ? error.message : "Network error"}`); }
      }
    }
    catch (error) { console.error(error instanceof Error ? error.message : "Heartbeat failed"); }
    finally { heartbeatBusy = false; }
  }, 5000);
  try {
    do {
      for (const pair of await connections()) {
        const retry = backoffs.get(pair.repo) ?? new Backoff(); backoffs.set(pair.repo, retry);
        if (!retry.ready()) continue;
        try {
          await renewPairing(pair);
          await replayReceipts(root, pair.repo, receipt => api(pair, "finish", receipt));
          ready = await refreshAuth();
          const free = await freeSubscriptions(installedSubscriptions, async h => ready.includes(h), busySubscriptions);
          const { job } = await api(pair, "claim", { harnesses: [...free, ...(ready.includes("local") ? ["local"] : [])] });
          if (job) {
            if (job.harness !== "local") busySubscriptions.add(job.harness);
            try { await execute(job, pair); }
            finally { if (job.harness !== "local") busySubscriptions.delete(job.harness); }
          } else if (once) console.log(`${pair.repo}: no approved Spark job is ready.`);
          retry.reset();
        } catch (error) {
          const delay = retry.fail();
          console.error(`${error instanceof Error ? error.message : "Runner request failed"}. Retrying in ${Math.ceil(delay / 1000)}s.`);
          if (error instanceof SignInExpired) {
            ready = ready.filter(h => !blocked.has(h as Subscription));
            await api(pair, "heartbeat", { harnesses: ready, authRequired: [...blocked] }).catch(() => {});
          }
          if ((error as { status?: number }).status === 401) {
            // Keep the pairing so doctor can diagnose it; never erase recovery evidence.
            console.error(`${pair.repo}: pairing expired or revoked. Run shiptorio-runner pair to reconnect.`);
          }
        }
      }
      if (!once) await Bun.sleep(5000);
    } while (!once);
  } finally { clearInterval(heartbeat); }
}
