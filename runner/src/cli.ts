import { mkdir, lstat, realpath } from "node:fs/promises";
import { chmod } from "node:fs/promises";
import { resolve } from "node:path";
import { agentEnvironment, assertCheckCommand, harnessArgs, validateChanges } from "./policy";
import { TEST_PATH, verifyRegression } from "./verify";
import { assertVerificationPlatform, checkSandbox, type CheckSandbox, verificationGit } from "./sandbox";
import { snapshotApproved, publishApproved } from "./publication";

import { jobWorkspace } from "./workspace";
import { responseSchemas, type Job } from "./messages";

const root = resolve(process.env.SHIPTORIO_RUNNER_ROOT || resolve(import.meta.dir, ".."));
const checkout = resolve(root, "..");
const cleanEnv = agentEnvironment(process.env);
const authHome = resolve(root, ".agent-home");
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
  await mkdir(authHome, { recursive: true, mode: 0o700 });
  for (const h of available) {
    const output = await command([harnessPath(h)!, ...(h === "codex" ? ["login", "status"] : ["auth", "status"])], authHome, agentEnvironment(process.env, authHome));
    // Codex writes login status to stderr, so its zero exit status is the proof.
    if (h === "claude_code" && !JSON.parse(output).loggedIn) throw new Error("Claude is not signed in");
    console.log(`${h}: installed and signed in`);
  }
  if (!available.length) throw new Error("Install and sign in to Codex or Claude Code first");
  process.exit(0);
}
const base = process.env.SHIPTORIO_URL || "https://shiptorio.com";
if (!["https://shiptorio.com", "https://shiptorio.dev", "http://localhost:8787"].includes(base)) throw new Error("Unsupported Shiptorio origin");
const repo = process.env.SHIPTORIO_REPO;
let pairing = process.env.SHIPTORIO_RUNNER_TOKEN;
if (!repo || !/^[\w.-]+\/[\w.-]+$/.test(repo) || !pairing) throw new Error("Run runner:control pair first");
async function api(action: keyof typeof responseSchemas, body: unknown): Promise<any> {
  const r = await fetch(`${base}/api/runner/${repo}/${action}`, { method: "POST", headers: { authorization: `Bearer ${pairing}`, "content-type": "application/json" }, body: JSON.stringify(body), signal: AbortSignal.timeout(30000) });
  if (!r.ok) throw new Error(`Runner ${action} failed (${r.status})`);
  const text = await r.text();
  if (text.length > 128000) throw new Error("Runner response exceeds size limit");
  return responseSchemas[action].parse(JSON.parse(text));
}
async function renewPairing() {
  const claims = JSON.parse(atob(pairing!.split(".")[0].replace(/-/g, "+").replace(/_/g, "/")));
  if (claims.expires > Date.now() + 60 * 60 * 1000) return;
  const renewed = await api("renew", {});
  pairing = renewed.token;
  const file = resolve(root, ".dev.vars");
  await Bun.write(file, `SHIPTORIO_URL=${base}\nSHIPTORIO_REPO=${repo}\nSHIPTORIO_RUNNER_TOKEN=${pairing}\n`, { mode: 0o600 });
  await chmod(file, 0o600);
}
async function execute(job: Job) {
  if (job.repo !== repo || !/^[a-f0-9]{40}$/.test(job.baseSha) || (!job.reworkPr && job.branch !== `shiptorio/runner-${job.id}` || !!job.reworkPr && (!Number.isInteger(job.reworkPr) || job.reworkPr < 1 || !/^shiptorio\/runner-[a-f0-9-]{36}$/.test(job.branch))) || !/^[a-f0-9-]{36}$/.test(job.id) || job.deadline <= Date.now()) throw new Error("Invalid job assignment");
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
    await mkdir(authHome, { recursive: true, mode: 0o700 });
    if (await realpath(authHome) !== authHome) throw new Error("Agent home must not be a symlink");
    // Fresh clone contains tracked files only: no primary checkout secrets, hooks or local edits.
    const source = resolve(jobRoot, "source.git");
    await command([await verificationGit(), "-c", "core.hooksPath=/dev/null", "clone", "--bare", "--", `https://github.com/${job.repo}.git`, source], jobRoot, gitEnv);
    await command([await verificationGit(), "-c", "core.hooksPath=/dev/null", "--git-dir", source, "worktree", "add", "--detach", work, job.baseSha], jobRoot, cleanEnv);
    const boundary = await checkSandbox(jobRoot);
    sandbox = { run: (args, cwd = work, options) => boundary.run(args, cwd, options), close: () => boundary.close() };
    await checked(["git", "checkout", "--detach", job.baseSha]);
    const prompt = `You are Shiptorio's ${job.harness} assembler, executing Muse Spark's approved plan.\n${job.plan}\n\nOnly edit these exact paths: ${job.allowedPaths.join(", ")}. Read AGENTS.md and relevant product docs. Make the smallest fix and a regression test. Do not commit, push, deploy, access secrets, invoke other agents, change settings, or write outside this checkout. The supervisor will run checks and publish the branch. Return a short summary.\n`;
    console.log(`Running ${job.harness} in isolated checkout ${job.id}; Spark planned the task.`);
    const executable = harnessPath(job.harness);
    if (!executable) throw new Error("Assigned harness is unavailable");
    agentSandbox = await checkSandbox(jobRoot, { home: authHome, executable });
    const result = await agentSandbox.run([executable, ...harnessArgs(job.harness, prompt)], work, { timeout: 15 * 60 * 1000 });
    if (result.code) throw new Error(`Agent failed (${result.code}); check dedicated subscription sign-in`);
    const output = result.out;
    await agentSandbox.close(); agentSandbox = undefined;
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
    console.log(JSON.stringify(await api("finish", receipt)));
  } catch (error) {
    // If a push/ack succeeded but transport failed, keep the success receipt for explicit retry.
    const receipt = Bun.file(resolve(root, ".work", `${job.id}.receipt.json`));
    if (!(await receipt.exists())) await api("finish", { jobId: job.id, lease: job.lease, ok: false, summary: "Local runner stopped; inspect local evidence and approve another attempt.", checks: [] }).catch(() => {});
    throw error;
  } finally { await agentSandbox?.close(); await sandbox?.close(); await workspace.close(); job.token = ""; gitEnv.GIT_CONFIG_VALUE_0 = ""; }
}
if (process.argv[2] !== "retry") console.log(`Local runner ready for ${repo}: ${available.join(", ") || "no installed agents"}. Only approved jobs run.`);
if (process.argv[2] === "retry") {
  const id = process.argv[3]; if (!/^[a-f0-9-]{36}$/.test(id ?? "")) throw new Error("Expected job UUID");
  console.log(JSON.stringify(await api("finish", await Bun.file(resolve(root, ".work", `${id}.receipt.json`)).json())));
} else {
  await assertVerificationPlatform();
  const once = process.argv[2] !== "watch";
  do {
    await renewPairing();
    const { job } = await api("claim", { harnesses: available });
    if (job) await execute(job); else if (once) console.log("No approved Spark job is ready.");
    if (!once) await new Promise(resolve => setTimeout(resolve, 5000));
  } while (!once);
}
