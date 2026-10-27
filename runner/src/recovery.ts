import { chmod, lstat, mkdir, realpath, rename, rm } from "node:fs/promises";
import { resolve } from "node:path";
import type { Job } from "./messages";
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
  constructor(private random = Math.random) {}
  ready(now = Date.now()) { return now >= this.until; }
  fail(now = Date.now()) {
    const cap = Math.min(60_000, 1000 * 2 ** Math.min(this.failures++, 6));
    const delay = Math.round(cap * (0.5 + this.random() * 0.5));
    this.until = now + delay;
    return delay;
  }
  reset() { this.failures = 0; this.until = 0; }
}

// Journal stays outside the agent-visible job root. Never persist installation tokens.
const identity = (job: Job) => JSON.stringify([job.id, job.repo, job.lease, job.baseSha, job.branch, job.harness, job.plan, job.allowedPaths, job.deadline]);
export async function recoverWorkspace(root: string, job: Job) {
  const home = resolve(await realpath(root), ".recovery");
  await mkdir(home, { recursive: true, mode: 0o700 });
  if (await realpath(home) !== home) throw new Error("Recovery directory must not be a symlink");
  await chmod(home, 0o700);
  const path = resolve(home, `${job.id}.json`);
  const fingerprint = identity(job);
  let saved: { identity: string; directory: string; initialized: boolean; agentDone: boolean } | undefined;
  try { saved = JSON.parse(await Bun.file(path).text()); } catch (e) { if ((e as NodeJS.ErrnoException).code !== "ENOENT") throw e; }
  if (saved && saved.identity !== fingerprint) throw new Error("Recovery assignment changed; approve a fresh job");
  const fresh = saved ? undefined : await jobWorkspace(root, job.id);
  const state = saved ?? { identity: fingerprint, directory: fresh!.directory, initialized: false, agentDone: false };
  const directory = state.directory;
  const expected = resolve(root, ".work");
  if (!directory.startsWith(expected + "/" + job.id + "-") || resolve(directory, "..") !== expected || await realpath(directory) !== directory || !(await lstat(directory)).isDirectory()) throw new Error("Unsafe recovery workspace");
  const save = async () => {
    const temporary = `${path}.${crypto.randomUUID()}`;
    await Bun.write(temporary, JSON.stringify(state), { mode: 0o600 });
    await chmod(temporary, 0o600); await rename(temporary, path);
  };
  await save();
  return { directory, work: resolve(directory, "checkout"), state,
    checkpoint: async (stage: "initialized" | "agentDone") => { state[stage] = true; await save(); },
    close: async () => { await rm(directory, { recursive: true, force: true }); await rm(path, { force: true }); },
  };
}
