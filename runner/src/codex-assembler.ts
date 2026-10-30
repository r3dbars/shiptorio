import { join } from "node:path";
import { mkdtemp, realpath, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { CODEX_EDIT_SCHEMA, codexEditPrompt, applyCodexEdits, parseCodexEdits } from "./codex-edits";
import { harnessArgs } from "./policy";
import { agentOffline, authExpired, RunnerExecutionFailure, usageLimited } from "./health";
import { checkSandbox, type CheckSandbox, type SandboxResult } from "./sandbox";

/** The job runner and doctor must exercise the same provider, isolation and scoped writer. */
export async function assembleCodex(options: {
  root: string; work: string; home: string; executable: string; timeout: number;
  job: { plan: string; allowedPaths: string[] };
  files: { path: string; content: string }[];
  verification: CheckSandbox;
}): Promise<SandboxResult> {
  const prompt = codexEditPrompt(options.job, options.files);
  // Repository code may have run already. Never write supervisor controls into its writable tree.
  const control = await realpath(await mkdtemp(join(tmpdir(), "shiptorio-codex-control-")));
  const schema = join(control, "schema.json");
  let boundary: CheckSandbox | undefined;
  let result: SandboxResult;
  try {
    await writeFile(schema, JSON.stringify(CODEX_EDIT_SCHEMA), { mode: 0o600, flag: "wx" });
    boundary = await checkSandbox(options.root, { home: options.home, executable: options.executable, readOnlyFiles: [schema] });
    result = await boundary.run([options.executable, ...harnessArgs("codex", prompt, schema)], options.work, { timeout: options.timeout });
  } finally {
    try { await boundary?.close(); } finally { await rm(control, { recursive: true, force: true }); }
  }
  // A timeout is terminal for this attempt, not a transport retry that can run forever.
  // Authentication and genuine network errors still follow the runner's existing recovery path.
  if (result.timedOut) throw new RunnerExecutionFailure('timeout');
  const limited = result.code ? usageLimited(result.err + '\n' + result.out) : null;
  if (limited) throw new RunnerExecutionFailure('limit', 'Codex', limited.until);
  if (result.code && !authExpired(result.err + '\n' + result.out) && !agentOffline(result.err + '\n' + result.out))
    throw new RunnerExecutionFailure('stopped');
  // The agent and descendants have stopped before the credential-free verifier writes anything.
  if (!result.code && !result.timedOut) await applyCodexEdits(options.verification, parseCodexEdits(result.out, options.job.allowedPaths), options.job.allowedPaths);
  return result;
}
