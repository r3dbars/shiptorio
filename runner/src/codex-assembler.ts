import { resolve } from "node:path";
import { CODEX_EDIT_SCHEMA, codexEditPrompt, applyCodexEdits, parseCodexEdits } from "./codex-edits";
import { harnessArgs } from "./policy";
import { agentOffline, authExpired, RunnerExecutionFailure } from "./health";
import { checkSandbox, type CheckSandbox, type SandboxResult } from "./sandbox";

/** The job runner and doctor must exercise the same provider, isolation and scoped writer. */
export async function assembleCodex(options: {
  root: string; work: string; home: string; executable: string; timeout: number;
  job: { plan: string; allowedPaths: string[] };
  files: { path: string; content: string }[];
  verification: CheckSandbox;
}): Promise<SandboxResult> {
  const prompt = codexEditPrompt(options.job, options.files);
  const schema = resolve(options.root, "codex-edit-schema.json");
  await Bun.write(schema, JSON.stringify(CODEX_EDIT_SCHEMA), { mode: 0o600 });
  const boundary = await checkSandbox(options.root, { home: options.home, executable: options.executable });
  let result: SandboxResult;
  try {
    result = await boundary.run([options.executable, ...harnessArgs("codex", prompt, schema)], options.work, { timeout: options.timeout });
  } finally { await boundary.close(); }
  // A timeout is terminal for this attempt, not a transport retry that can run forever.
  // Authentication and genuine network errors still follow the runner's existing recovery path.
  if (result.timedOut) throw new RunnerExecutionFailure('timeout');
  if (result.code && !authExpired(result.err + '\n' + result.out) && !agentOffline(result.err + '\n' + result.out))
    throw new RunnerExecutionFailure('stopped');
  // The agent and descendants have stopped before the credential-free verifier writes anything.
  if (!result.code && !result.timedOut) await applyCodexEdits(options.verification, parseCodexEdits(result.out, options.job.allowedPaths), options.job.allowedPaths);
  return result;
}
