import { fetchApprovedSource } from "./approved-source";
import { runnerOrigin } from "./origin";
import { freeSubscriptions, prepareAgentHome, subscriptionArgs, subscriptionSignedIn, subscriptionCredentialVersion } from "./subscriptions";
import { assembleCodex } from "./codex-assembler";
import { assembleMuse } from "./muse-assembler";
import { probeAssemblerEdit } from "./edit-probe";
import { codexDoctorFailure } from "./codex-diagnostic";
import { mkdir, lstat, realpath, rm, mkdtemp } from "node:fs/promises";
import { resolve } from "node:path";
import { agentEnvironment, assemblerPrompt, assertCheckCommand, harnessArgs, validateChanges } from "./policy";
import { TEST_PATH, resetVerifyBase, verifyRegression } from "./verify";
import { assertVerificationPlatform, checkSandbox, type CheckSandbox, verificationGit } from "./sandbox";
import { assemblerContext, snapshotApproved, publishApproved } from "./publication";
import { runnerHome, loadPairings, pairMachine, joinMachine, type Pairing } from "./pairing";
import { loadConnections, persistRenewal, persistGrantRejection } from "./grant-store";


import { atomicJson, Backoff, recoverWorkspace, replayReceipts, retryable } from "./recovery";
import { AuthFailures, RunnerGrantRejected, runnerFailureSummary, runnerResponseError, maintainConnection, renewalDue, agentOffline, authExpired, diagnose, loginCommand, agentName, type Subscription } from "./health";
import { tmpdir } from "node:os";
const blocked = new Set<Subscription>();
const authFailures = new AuthFailures();
const rejectedGrants = new Map<string, string>();
class SignInExpired extends Error {}
import { assertJobAssignment, responseSchemas, plainRunnerError, runnerCheckLabel, type Job } from "./messages";
import { detectLocalModel, localModelConfig, runLocalAssembler } from "./local-model";
import { redactText } from "../../server/src/redact";
const verbose = process.argv.includes("--verbose");
const showError = (error: unknown) => console.error(verbose ? redactText(error instanceof Error ? error.stack ?? error.message : String(error)) : plainRunnerError(error));
const fail = (error: unknown) => { showError(error); process.exit(1); };
process.on("uncaughtException", fail);
process.on("unhandledRejection", fail);
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
let claudeKeychainUnavailable = false;
const authHome = await prepareAgentHome(root, () => {
  claudeKeychainUnavailable = true;
  showError(new Error("private Keychain could not be unlocked"));
});
const harnessPath = (h: Exclude<Job["harness"], "local">) => Bun.which(h === "codex" ? "codex" : h === "muse_code" ? "muse" : "claude");
const localFile = Bun.file(resolve(root, "local-model.json"));
const local = localModelConfig(process.env, await localFile.exists() ? await localFile.json() : null);
const localStatus = local ? await detectLocalModel(local) : null;
// Players are offered Codex or Muse Code. Claude Code stays wired for development, behind an explicit opt-in.
const offered: Subscription[] = ["codex", "muse_code", ...(process.env.SHIPTORIO_ENABLE_CLAUDE === "1" ? ["claude_code" as const] : [])];
const installedSubscriptions = offered.filter(h => harnessPath(h) && (!process.argv.includes("--codex-only") || h === "codex"));
const busySubscriptions = new Set<Subscription>();
let available: Job["harness"][] = [...installedSubscriptions, ...(localStatus?.ok && !process.argv.includes("--codex-only") ? ["local" as const] : [])];

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
  console.log(status.ok ? "Your local model is ready.\nshiptorio-runner watch" : "Your local model was saved but is not ready.\nshiptorio-runner doctor");
  process.exit(0);
}
async function signedInHarness(h: Job["harness"]) {
  if ((h === "claude_code" || h === "muse_code") && claudeKeychainUnavailable) return false;
  if (h === "local") return localStatus?.ok === true;
  const executable = harnessPath(h);
  return executable ? subscriptionSignedIn(h, executable, authHome) : false;
}
async function loginHarness(h: Job["harness"]) {
  if ((h === "claude_code" || h === "muse_code") && claudeKeychainUnavailable) throw new Error(`Repair the private Keychain before signing in to ${h === "muse_code" ? "Muse Code" : "Claude"}; no personal Keychain fallback is allowed.`);
  if (h === "local") throw new Error("Local models do not need subscription login");
  console.log(`Finish signing in to ${agentName(h)} in the window that opens.`);
  const child = Bun.spawn([harnessPath(h)!, ...subscriptionArgs(h, true)], { cwd: authHome, env: agentEnvironment(process.env, authHome), stdin: "inherit", stdout: "inherit", stderr: "inherit" });
  const exited = await child.exited;
  // Muse Code has no status command: a clean login exit is the evidence, recorded beside its credential file.
  if (!exited && h === "muse_code") await Bun.write(resolve(authHome, ".config/muse/.shiptorio-login"), crypto.randomUUID(), { mode: 0o600 });
  if (exited || !await signedInHarness(h)) throw new Error(`Agent sign-in did not finish. Run ${loginCommand(h)} and try again.`);
  // Keychain-only reauthentication need not change a credential file. Wake a watching runner's auth guard.
  if (h === "claude_code") await Bun.write(resolve(authHome, ".claude/.shiptorio-login"), crypto.randomUUID(), { mode: 0o600 });
}
if (process.argv[2] === "doctor") {
  const args = process.argv.slice(3).filter(arg => arg !== "--verbose");
  if (args.length && (args.length !== 2 || args[0] !== "--edit" || !["codex", "muse"].includes(args[1]))) throw new Error("Usage: shiptorio-runner doctor [--edit codex|muse]");
  const realEdit = args.length > 0;
  const editAgent: "codex" | "muse_code" = args[1] === "muse" ? "muse_code" : "codex";
  if (realEdit) console.log(`${agentName(editAgent)} will try one small test change without starting factory work.`);
  await mkdir(resolve(authHome, ".codex"), { recursive: true, mode: 0o700 });
  const checks = await diagnose({ harnesses: available, pairs: await connections(), auth: signedInHarness,
    editHarness: realEdit ? editAgent : undefined,
    edit: async () => {
      let probeResult: import("./sandbox").SandboxResult | undefined;
      try {
        await probeAssemblerEdit(async context => {
          const assemble = editAgent === "muse_code" ? assembleMuse : assembleCodex;
          const result = await assemble({ root: context.root, work: context.work, home: authHome, executable: harnessPath(editAgent)!, timeout: 120000,
            job: { plan: context.plan, allowedPaths: context.allowedPaths }, files: context.files, verification: context.verification });
          probeResult = result;
          if (result.code || result.timedOut) throw new Error(`${agentName(editAgent)} provider did not complete the edit probe`);
        });
      } catch (error) {
        const diagnostic = codexDoctorFailure(probeResult, error).replaceAll("Codex", agentName(editAgent));
        throw new Error(diagnostic);
      }
    },
    pairing: pair => api(pair, "renew", {}),
    sandbox: async h => {
      if ((h === "claude_code" || h === "muse_code") && claudeKeychainUnavailable) throw new Error("Agent private Keychain unavailable; sandbox probe was not run.");
      const dir = await mkdtemp(resolve(tmpdir(), "shiptorio-doctor-"));
      let boundary: CheckSandbox | undefined;
      try {
        boundary = await checkSandbox(dir, h ? { home: authHome, executable: harnessPath(h)! } : undefined);
        // Exercise CLI startup, managed preferences and HTTPS inside the agent boundary (#235), without inference.
        const probe = h ? [harnessPath(h)!, ...subscriptionArgs(h)] : [process.execPath, "--no-env-file", "-e", "console.log('sandbox OK')"];
        const result = await boundary.run(probe, dir, { timeout: 30000 });
        if (result.code && !(h && authExpired(result.err + result.out))) { if (verbose) console.error(redactText(result.err.slice(-2000))); throw Error("Sandbox probe failed"); }
        if (h) {
          if (process.platform === "darwin") {
            const preferences = await boundary.run(["/usr/bin/defaults", "read", "NSGlobalDomain"], dir, { timeout: 10000 });
            // An empty preference domain is valid; Seatbelt/config sync failures are not.
            if (/not permitted|failed to synchronize|sandbox.*deny/i.test(preferences.err)) throw Error("Managed preferences unavailable in sandbox");
          }
          const network = await boundary.run([process.execPath, "--no-env-file", "-e", 'await fetch("https://shiptorio.com/api/version",{signal:AbortSignal.timeout(10000)});console.log("HTTPS OK")'], dir, { timeout: 15000 });
          if (network.code) { if (verbose) console.error(redactText(network.err.slice(-2000))); throw Error("Sandbox HTTPS probe failed"); }
        }
      } finally { await boundary?.close(); await rm(dir, { recursive: true, force: true }); }
    } });
  for (const check of checks) console.log(verbose ? `${check.ok ? "PASS" : "FAIL"} ${check.check}: ${redactText(check.detail)}` : check.ok ? `${runnerCheckLabel(check.check)} passed.` : check.check.startsWith("sandbox:") ? `${runnerCheckLabel(check.check)} could not complete its safety check.\nshiptorio-runner doctor` : plainRunnerError(new Error(check.detail)));
  if (!realEdit) for (const h of installedSubscriptions.some(h => h === "muse_code") ? installedSubscriptions.filter(h => h !== "claude_code") : ["codex" as const]) console.log(`${agentName(h)} has not tried a test change yet.\nshiptorio-runner doctor --edit ${h === "muse_code" ? "muse" : "codex"}`);
  process.exit(checks.every(c => c.ok) ? 0 : 1);
}
if (["setup", "login"].includes(process.argv[2])) {
  await mkdir(resolve(authHome, ".codex"), { recursive: true, mode: 0o700 });
  if (!available.length) throw new Error(`Install Codex or Muse Code first, then rerun the installer. See ${base}/docs/runner`);
  if (process.argv[2] === "login") {
    const h = ({ claude: "claude_code", codex: "codex", muse: "muse_code" } as const)[process.argv[3] as "claude" | "codex" | "muse"] ?? null;
    if (!h || !available.includes(h)) throw new Error("Use login codex or login muse, with that CLI installed");
    await loginHarness(h);
  }
  let ready = false;
  for (const h of available) {
    if (h === "local") { console.log("Your local model is ready."); ready = true; continue; }
    const loggedIn = await signedInHarness(h);
    console.log(loggedIn ? `${agentName(h)} is signed in and ready.` : `${agentName(h)} needs you to sign in.\n${loginCommand(h)}`);
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
  console.log("Removing this runner; close any other runner windows first.");
  const { rm } = await import("node:fs/promises");
  const { homedir } = await import("node:os");
  // Fixed install paths only; environment overrides must never become recursive delete targets.
  await rm(resolve(homedir(), ".local/bin/shiptorio-runner"), { force: true });
  await rm(resolve(homedir(), ".local/share/shiptorio/runner"), { recursive: true, force: true });
  console.log("The runner is removed; disconnect this computer in each factory.");
  process.exit(0);
}
async function api(pair: Pairing, action: keyof typeof responseSchemas, body: unknown): Promise<any> {
  if (connectionStopped(pair)) throw new RunnerGrantRejected(pair.rejected?.code ?? "runner_pair_revoked", 401);
  const r = await fetch(`${base}/api/runner/${pair.repo}/${action}`, { method: "POST", headers: { authorization: `Bearer ${pair.token}`, "content-type": "application/json" }, body: JSON.stringify(body), signal: AbortSignal.timeout(30000) });
  if (!r.ok) throw await runnerResponseError(r, pair.repo, action);
  const text = await r.text();
  if (text.length > 128000) throw new Error("Runner response exceeds size limit");
  return responseSchemas[action].parse(JSON.parse(text));

}
async function renewPairing(pair: Pairing) {
  if (!renewalDue(pair)) return;
  const renewed = await api(pair, "renew", {});
  await persistRenewal(root, pair, renewed);
}
async function execute(job: Job, pair: Pairing) {
  const repo = pair.repo;
  assertJobAssignment(job, repo);
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
    // Fetch approved commits only: no primary checkout secrets, hooks, refs or full history.
    const source = resolve(jobRoot, "source.git");
    if (!workspace.state.initialized) {
      await rm(source, { recursive: true, force: true }); await rm(work, { recursive: true, force: true });
      await fetchApprovedSource(async (args, cwd = jobRoot) => command([await verificationGit(), "-c", "core.hooksPath=/dev/null", "-c", "core.fsmonitor=false", ...args], cwd, gitEnv), source, `https://github.com/${job.repo}.git`, [job.baseSha, ...(job.verifyBaseSha ? [job.verifyBaseSha] : [])], true);
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
        console.log("Your local model is working on the approved change.");
        output = JSON.stringify(await runLocalAssembler(job, work, local!));
      } else {
        const context = await assemblerContext(sandbox, job.allowedPaths);
        console.log(`${agentName(job.harness)} is working on the approved change.`);
        const executable = harnessPath(job.harness);
        if (!executable) throw new Error("Assigned harness is unavailable");
        const timeout = Math.max(1, Math.min(15 * 60 * 1000, job.deadline - Date.now()));
        let result;
        if (job.harness === "codex") result = await assembleCodex({ root: jobRoot, work, home: authHome, executable, timeout, job, files: context, verification: sandbox });
        else if (job.harness === "muse_code") result = await assembleMuse({ root: jobRoot, work, home: authHome, executable, timeout, job, files: context, verification: sandbox });
        else {
          agentSandbox = await checkSandbox(jobRoot, { home: authHome, executable });
          result = await agentSandbox.run([executable, ...harnessArgs(job.harness, assemblerPrompt(job, context))], work, { timeout });
        }
        if (result.code) {
          // The redacted stderr tail stays on this Mac (service-error.log); the server only sees the generic failure.
          if (verbose) console.error(`${job.harness} exited ${result.code}: ${redactText(result.err.trim().slice(-2000))}`);
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
    for (const check of checks) { console.log(`Checking ${check === "typecheck" ? "types" : check === "test" ? "tests" : check}.`); await checkCommand([process.execPath, "run", check]); }
    const verifyPaths = [...new Set([...paths, ...(job.prTestFiles ?? [])])].filter(p => TEST_PATH.test(p));
    const docsOnly = !job.reworkPr && paths.every(p => /\.(md|mdx|txt)$|(^|\/)docs\//i.test(p));
    const proof = docsOnly ? undefined : await verifyRegression(work, job.verifyBaseSha ?? job.baseSha, verifyPaths, cleanEnv, jobRoot);
    if (proof) {
      await Bun.write(resolve(root, ".work", `${job.id}.verify.log`), proof.logTail, { mode: 0o600 });
      console.log(proof.failsOnBase && proof.passesOnHead ? "The test confirms this change fixes the problem." : "The test did not confirm the fix; review it in Shiptorio.");
      if (job.refreshBase && (!proof.failsOnBase || !proof.passesOnHead)) throw new Error("Base refresh requires fresh base-failing and head-passing proof");
      if (verifyPaths.length && !proof.passesOnHead) throw new Error("Regression recipe failed on the fix commit");
    }
    if (JSON.stringify(await snapshotApproved(sandbox, paths)) !== JSON.stringify(frozen)) throw new Error("Checks changed approved files");
    // Publication is rebuilt from a fresh trusted checkout; hostile hooks/config never see credentials.
    // Publication/installation can fail offline. Keep the workspace and rerun all checks on recovery.
    if (job.deadline <= Date.now()) throw new Error("Build lease expired; approve a fresh attempt in the game");
    let sha: string;
    if (connectionStopped(pair)) { preserve = true; throw new RunnerGrantRejected(pair.rejected?.code ?? "runner_pair_revoked", 401); }
    try { sha = await publishApproved(job, frozen); } catch (error) { preserve = true; throw error; }
    summary = `Changed files: ${paths.join(", ")} (approved: ${job.allowedPaths.join(", ")}). Supervisor validated the scope and secret scan, then passed typecheck, tests and build. Agent output stays local.`;
    const receipt = { jobId: job.id, lease: job.lease, ok: true, sha, summary, checks, proof: proof ? { ...proof, headSha: sha } : undefined };
    await atomicJson(receiptFile, receipt);
    const finished = await api(pair, "finish", receipt);
    console.log("prUrl" in finished ? "Your pull request is ready to review in Shiptorio." : "The failed build has been reported to Shiptorio.");
    completed = true;
  } catch (error) {
    preserve ||= retryable(error) || error instanceof SignInExpired || await Bun.file(receiptFile).exists();
    if (!preserve) {
      const receipt = { jobId: job.id, lease: job.lease, ok: false, summary: runnerFailureSummary(error), checks: [] };
      await atomicJson(receiptFile, receipt);
      try { await api(pair, "finish", receipt); completed = true; } catch { preserve = true; }
    }
    throw error;
  } finally { await agentSandbox?.close(); await sandbox?.close(); if (completed) await workspace.close(); job.token = ""; gitEnv.GIT_CONFIG_VALUE_0 = ""; }

}
function connectionStopped(pair: Pairing) { return !!pair.rejected || rejectedGrants.get(pair.repo) === pair.token; }
async function stopRejectedConnection(pair: Pairing, error: unknown): Promise<boolean> {
  if (!(error instanceof RunnerGrantRejected)) return false;
  rejectedGrants.set(pair.repo, pair.token);
  await persistGrantRejection(root, pair, error.code).catch(() => console.error("The runner could not save its connection status; this factory will stay stopped."));
  console.error("This computer needs to reconnect; your saved work is safe.\nshiptorio-runner pair");
  return true;
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
  const finished = await api(pair, "finish", receipt);
  console.log("prUrl" in finished ? "Your pull request is ready to review in Shiptorio." : "The failed build has been reported to Shiptorio.");
} else {
  await assertVerificationPlatform();
  console.log("The runner is watching your factory; press Ctrl-C to stop.");
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
  for (const pair of pairs) {
    if (connectionStopped(pair)) { console.error("This computer needs to reconnect to your factory.\nshiptorio-runner pair"); continue; }
    try { await maintainConnection(pair, { renew: renewPairing, heartbeat: p => api(p, "heartbeat", { harnesses: ready, authRequired: [...blocked] }) }); }
    catch (error) { await stopRejectedConnection(pair, error); }
  }
  const heartbeat = setInterval(async () => {
    if (heartbeatBusy) return;
    heartbeatBusy = true;
    try {
      ready = await refreshAuth();
      for (const pair of await connections()) {
        if (connectionStopped(pair)) continue;
        const retry = heartbeatBackoffs.get(pair.repo) ?? new Backoff(); heartbeatBackoffs.set(pair.repo, retry);
        if (!retry.ready()) continue;
        try { await maintainConnection(pair, { renew: renewPairing, heartbeat: p => api(p, "heartbeat", { harnesses: ready, authRequired: [...blocked] }) }); retry.reset(); }
        catch (error) { if (await stopRejectedConnection(pair, error)) continue; retry.fail(); if (verbose) showError(error); else console.error("The factory connection was interrupted; retrying shortly."); }
      }
    }
    catch (error) { showError(error); }
    finally { heartbeatBusy = false; }
  }, 5000);
  try {
    do {
      for (const pair of await connections()) {
        if (connectionStopped(pair)) continue;
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
          } else if (once) console.log("No approved work is ready yet.");
          retry.reset();
        } catch (error) {
          if (await stopRejectedConnection(pair, error)) continue;
          const delay = retry.fail();
          if (verbose) { showError(error); console.error(`Retrying in ${Math.ceil(delay / 1000)}s.`); }
          else if (error instanceof SignInExpired) showError(error);
          else console.error(`${plainRunnerError(error).split("\n")[0].replace(/\.$/, "")}; retrying shortly.`);
          if (error instanceof SignInExpired) {
            ready = ready.filter(h => !blocked.has(h as Subscription));
            await api(pair, "heartbeat", { harnesses: ready, authRequired: [...blocked] }).catch(() => {});
          }
          // Generic 401s may come from an upstream proxy: retain the grant and retry with backoff.

        }
      }
      if (!once) await Bun.sleep(5000);
    } while (!once);
  } finally { clearInterval(heartbeat); }
}
