import { mkdir, lstat } from "node:fs/promises";
import { resolve } from "node:path";
import { agentEnvironment, harnessArgs, validateChanges } from "./policy";

interface Job { id: string; repo: string; harness: "codex" | "claude_code"; baseSha: string; branch: string; allowedPaths: string[]; plan: string; lease: string; token: string; deadline: number }
const root = resolve(import.meta.dir, "..");
const checkout = resolve(root, "..");
const cleanEnv = agentEnvironment(process.env);
const harnessPath = (h: Job["harness"]) => Bun.which(h === "codex" ? "codex" : "claude");
const available = (["codex", "claude_code"] as const).filter(h => harnessPath(h));
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
const repo = process.env.SHIPTORIO_REPO;
const pairing = process.env.SHIPTORIO_RUNNER_TOKEN;
if (!repo || !/^[\w.-]+\/[\w.-]+$/.test(repo) || !pairing) throw new Error("Run runner:control pair first");
async function api(action: string, body: unknown): Promise<any> {
  const r = await fetch(`${base}/api/runner/${repo}/${action}`, { method: "POST", headers: { authorization: `Bearer ${pairing}`, "content-type": "application/json" }, body: JSON.stringify(body), signal: AbortSignal.timeout(30000) });
  if (!r.ok) throw new Error(`Runner ${action} failed (${r.status})`);
  return r.json();
}
async function execute(job: Job) {
  if (job.repo !== repo || !/^[a-f0-9]{40}$/.test(job.baseSha) || job.branch !== `shiptorio/runner-${job.id}` || !/^[a-f0-9-]{36}$/.test(job.id) || job.deadline <= Date.now()) throw new Error("Invalid job assignment");
  const work = resolve(root, ".work", job.id);
  const gitEnv = { ...cleanEnv, GIT_CONFIG_COUNT: "1", GIT_CONFIG_KEY_0: "http.https://github.com/.extraheader", GIT_CONFIG_VALUE_0: `AUTHORIZATION: basic ${Buffer.from(`x-access-token:${job.token}`).toString("base64")}`, GIT_TERMINAL_PROMPT: "0" };
  let summary = "";
  try {
    await mkdir(resolve(root, ".work"), { recursive: true });
    // Fresh clone contains tracked files only: no primary checkout secrets, hooks or local edits.
    await command(["git", "clone", "--no-checkout", "--", `https://github.com/${job.repo}.git`, work], checkout, gitEnv);
    await command(["git", "checkout", "--detach", job.baseSha], work);
    const prompt = `You are Shiptorio's ${job.harness} assembler, executing Muse Spark's approved plan.\n${job.plan}\n\nOnly edit these exact paths: ${job.allowedPaths.join(", ")}. Read AGENTS.md and relevant product docs. Make the smallest fix and a regression test. Do not commit, push, deploy, access secrets, invoke other agents, change settings, or write outside this checkout. The supervisor will run checks and publish the branch. Return a short summary.\n`;
    console.log(`Running ${job.harness} in isolated checkout ${job.id}; Spark planned the task.`);
    const output = await command([harnessPath(job.harness)!, ...harnessArgs(job.harness, prompt)], work, cleanEnv, 15 * 60 * 1000);
    // Preserve local evidence; never forward raw agent output to the server/browser.
    await Bun.write(resolve(root, ".work", `${job.id}.agent.log`), output);
    if (job.harness === "claude_code" && JSON.parse(output).is_error) throw new Error("Claude reported an agent error");
    if (await command(["git", "rev-parse", "HEAD"], work) !== job.baseSha) throw new Error("Agent changed checkout history");
    const paths = (await command(["git", "ls-files", "--modified", "--others", "--exclude-standard"], work)).split("\n").filter(Boolean);
    for (const path of paths) if (!(await lstat(resolve(work, path))).isFile()) throw new Error("Non-regular patch file");
    // Stage only approved regular files, including newly created tests, then validate the complete diff.
    if (!paths.length || paths.some(p => !job.allowedPaths.includes(p))) throw new Error("Unexpected or empty agent changes");
    await command(["git", "add", "--", ...paths], work);
    const diff = await command(["git", "diff", "--cached", "--no-ext-diff", "--no-textconv"], work);
    validateChanges(paths, job.allowedPaths, diff);
    await command([process.execPath, "install", "--frozen-lockfile", "--ignore-scripts"], work, cleanEnv);
    const checks = ["typecheck", "test", "build"] as const;
    for (const check of checks) { console.log(`Supervisor check: ${check}`); await command([process.execPath, "run", check], work, cleanEnv, 180000); }
    if (await command(["git", "diff", "--name-only"], work)) throw new Error("Checks changed tracked files");
    await command(["git", "-c", "user.name=Shiptorio local runner", "-c", "user.email=shiptorio@users.noreply.github.com", "commit", "-m", "Execute Spark-approved issue plan with local subscription agent"], work);
    const sha = await command(["git", "rev-parse", "HEAD"], work);
    await command(["git", "push", "origin", `HEAD:refs/heads/${job.branch}`], work, gitEnv);
    summary = `Approved paths: ${paths.join(", ")}. Supervisor validated the scope and secret scan, then passed typecheck, tests and build. Agent output stays local.`;
    const receipt = { jobId: job.id, lease: job.lease, ok: true, sha, summary, checks };
    await Bun.write(resolve(root, ".work", `${job.id}.receipt.json`), JSON.stringify(receipt));
    console.log(JSON.stringify(await api("finish", receipt)));
  } catch (error) {
    // If a push/ack succeeded but transport failed, keep the success receipt for explicit retry.
    const receipt = Bun.file(resolve(root, ".work", `${job.id}.receipt.json`));
    if (!(await receipt.exists())) await api("finish", { jobId: job.id, lease: job.lease, ok: false, summary: "Local runner stopped; inspect local evidence and approve another attempt.", checks: [] }).catch(() => {});
    throw error;
  } finally { job.token = ""; gitEnv.GIT_CONFIG_VALUE_0 = ""; }
}
if (process.argv[2] === "retry") {
  const id = process.argv[3]; if (!/^[a-f0-9-]{36}$/.test(id ?? "")) throw new Error("Expected job UUID");
  console.log(JSON.stringify(await api("finish", await Bun.file(resolve(root, ".work", `${id}.receipt.json`)).json())));
} else {
  const once = process.argv[2] !== "watch";
  do {
    const { job } = await api("claim", { harnesses: available });
    if (job) await execute(job); else if (once) console.log("No approved Spark job is ready.");
    if (!once) await new Promise(resolve => setTimeout(resolve, 5000));
  } while (!once);
}
