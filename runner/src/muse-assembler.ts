import { applyCodexEdits } from "./codex-edits";
import { museEditPrompt, parseMuseEdits } from "./muse-edits";
import { harnessArgs } from "./policy";
import { agentOffline, authExpired, RunnerExecutionFailure, usageLimited } from "./health";
import { checkSandbox, type CheckSandbox, type SandboxResult } from "./sandbox";

/** Same boundary as assembleCodex: outer OS sandbox, clean env, no writes or shell, the supervisor applies edits. */
export async function assembleMuse(options: {
  root: string; work: string; home: string; executable: string; timeout: number;
  job: { plan: string; allowedPaths: string[] };
  files: { path: string; content: string }[];
  verification: CheckSandbox;
}): Promise<SandboxResult> {
  const prompt = museEditPrompt(options.job, options.files);
  const boundary = await checkSandbox(options.root, { home: options.home, executable: options.executable });
  let result: SandboxResult;
  try {
    result = await boundary.run([options.executable, ...harnessArgs("muse_code", prompt)], options.work, { timeout: options.timeout });
  } finally { await boundary.close(); }
  if (result.timedOut) throw new RunnerExecutionFailure("timeout", "Muse Code");
  const limited = result.code ? usageLimited(result.err + "\n" + result.out) : null;
  if (limited) throw new RunnerExecutionFailure("limit", "Muse Code", limited.until);
  if (result.code && !authExpired(result.err + "\n" + result.out) && !agentOffline(result.err + "\n" + result.out))
    throw new RunnerExecutionFailure("stopped", "Muse Code");
  if (!result.code) await applyCodexEdits(options.verification, parseMuseEdits(result.out, options.job.allowedPaths), options.job.allowedPaths);
  return result;
}
