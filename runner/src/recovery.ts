import { chmod, lstat, mkdir, realpath, rename, rm, readdir } from "node:fs/promises";
import { resolve } from "node:path";
import { JobAssignment, type Job } from "./messages";
import { jobWorkspace } from "./workspace";

/** Retry transport failures, never authentication/revocation or rejected requests. */
export function retryable(error: unknown): boolean {
  const e = error as { status?: number; name?: string; code?: string };
  return e.status !== undefined ? e.status === 408 || e.status === 429 || e.status >= 500
    : ["TypeError", "TimeoutError", "AbortError"].includes(e.name ?? "") || /^(ECONN|ENET|EHOST|EAI_|ETIMEDOUT)/.test(e.code ?? "");
}
export class Backoff {
  private failures = 0;
  private until = 0;
  private observed = 0;
  constructor(private random = Math.random) {}
  ready(now = Date.now()) {
    // A backwards clock correction after wake must not strand a retry in the future.
    if (now < this.observed) this.until = now;
    this.observed = now;
    return now >= this.until;
  }
  fail(now = Date.now()) {
    this.observed = now;
    const cap = Math.min(60_000, 1000 * 2 ** Math.min(this.failures++, 6));
    const delay = Math.round(cap * (0.5 + this.random() * 0.5));
    this.until = now + delay;
    return delay;
  }
  reset() { this.failures = 0; this.until = 0; }
}

export async function atomicJson(path: string, value: unknown) {
  const temporary = `${path}.${crypto.randomUUID()}`;
  await Bun.write(temporary, JSON.stringify(value), { mode: 0o600 });
  await chmod(temporary, 0o600); await rename(temporary, path);
}

// Journal stays outside the agent-visible job root. Never persist installation tokens.
const identity = (job: Job) => JSON.stringify([job.id, job.repo, job.lease, job.baseSha, job.branch, job.harness, job.plan, job.allowedPaths, job.deadline, job.reworkPr, job.verifyBaseSha, job.prTestFiles, ...(job.refreshBase ? [job.refreshBase] : [])]);
export async function recoverWorkspace(root: string, job: Job) {
  job = JobAssignment.parse(job);
  const home = resolve(await realpath(root), ".recovery");
  await mkdir(home, { recursive: true, mode: 0o700 });
  if (await realpath(home) !== home) throw new Error("Recovery directory must not be a symlink");
  await chmod(home, 0o700);
  const path = resolve(home, `${job.id}.json`);
  const fingerprint = identity(job);
  let saved: { identity: string; directory: string; assignment: Omit<Job, "token">; initialized: boolean; agentDone: boolean; frozen?: Record<string, string> } | undefined;
  try { saved = JSON.parse(await Bun.file(path).text()); } catch (e) { if ((e as NodeJS.ErrnoException).code !== "ENOENT") throw e; }
  if (saved && saved.identity !== fingerprint) throw new Error("Recovery assignment changed; approve a fresh job");
  const { token: _token, ...assignment } = job;
  const fresh = saved ? undefined : await jobWorkspace(root, job.id);
  const state = saved ?? { identity: fingerprint, directory: fresh!.directory, assignment, initialized: false, agentDone: false, frozen: undefined as Record<string, string> | undefined };
  const directory = state.directory;
  const expected = resolve(root, ".work");
  if (!directory.startsWith(expected + "/" + job.id + "-") || resolve(directory, "..") !== expected || await realpath(directory) !== directory || !(await lstat(directory)).isDirectory()) throw new Error("Unsafe recovery workspace");
  const save = async () => {
    await atomicJson(path, state);
  };
  await save();
  return { directory, work: resolve(directory, "checkout"), state,
    checkpoint: async (stage: "initialized" | "agentDone") => { state[stage] = true; await save(); },
    freeze: async (files: Record<string, string>) => {
      if (state.frozen && JSON.stringify(state.frozen) !== JSON.stringify(files)) throw new Error("Checks changed approved files before recovery");
      state.frozen = files; await save();
    },
    close: async () => { await rm(path, { force: true }); await rm(directory, { recursive: true, force: true }); },
  };
}

/** Replay unacknowledged receipts even when claim returns null (server already completed the job). */
export async function replayReceipts(root: string, repo: string, send: (receipt: unknown) => Promise<unknown>) {
  const home = resolve(root, ".recovery");
  const names = await readdir(home).catch((e) => { if (e.code === "ENOENT") return []; throw e; });
  for (const name of names.filter(n => /^[a-f0-9-]{36}\.json$/.test(n))) {
    const journal = await Bun.file(resolve(home, name)).json();
    const job = JobAssignment.parse({ ...journal.assignment, token: "reacquired-only" });
    if (job.repo !== repo) continue;
    const receipt = Bun.file(resolve(root, ".work", `${job.id}.receipt.json`));
    if (!await receipt.exists()) continue;
    const data = await receipt.json();
    if (data.jobId !== job.id || data.lease !== job.lease) throw new Error("Receipt lease mismatch");
    try { await send(data); }
    catch (error) { if (job.deadline > Date.now()) throw error; continue; }
    const workspace = await recoverWorkspace(root, job); await workspace.close();
  }
}
