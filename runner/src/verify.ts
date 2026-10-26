import { copyFile, lstat, mkdir } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { checkSandbox, type CheckSandbox } from "./sandbox";

export const TEST_PATH = /(^|\/)(test|tests|__tests__|spec)\/.*\.[cm]?[jt]sx?$|\.(test|spec)\.[cm]?[jt]sx?$/i;
export interface RegressionProof { failsOnBase: boolean; passesOnHead: boolean; baseSha: string; command: string; logTail: string }
interface Result { code: number; log: string }
const stripAnsi = (text: string) => text.replace(/\u001b\[[0-9;]*m/g, "");
export function testOutcome(result: Result): { passed: boolean; reproduced: boolean } {
  const log = stripAnsi(result.log);
  const pass = Number(log.match(/(?:^|\n)\s*(\d+) pass\b/)?.[1] ?? 0);
  const fail = Number(log.match(/(?:^|\n)\s*(\d+) fail\b/)?.[1] ?? 0);
  const infrastructure = /Cannot find (?:module|package)|ModuleNotFound|SyntaxError|ParseError|parse error|Unhandled error between tests|No tests found/i.test(log);
  return { passed: result.code === 0 && pass > 0 && fail === 0 && !infrastructure, reproduced: result.code !== 0 && fail > 0 && !infrastructure };
}

/** Overlay only the PR's test files on an isolated base tree; production code stays at base. */
export async function verifyRegression(work: string, baseSha: string, paths: string[], _env: NodeJS.ProcessEnv): Promise<RegressionProof> {
  if (!/^[a-f0-9]{40}$/.test(baseSha)) throw new Error("Invalid verify base");
  const tests = [...new Set(paths.filter(p => TEST_PATH.test(p)))];
  if (tests.some(p => p.startsWith("/") || p.includes("..") || !/^[\w./@+-]+$/.test(p))) throw new Error("Unsafe verify path");
  const args = [process.execPath, "test", ...tests.map(p => `./${p}`)];
  const command = `bun test ${tests.map(p => `./${p}`).join(" ")}`.slice(0, 1000);
  if (!tests.length) return { failsOnBase: false, passesOnHead: false, baseSha, command: "No changed test files", logTail: "No reproducible test recipe was attached." };
  const sandbox = await checkSandbox(work);
  const run = async (args: string[], cwd: string, boundary: CheckSandbox = sandbox, install = false): Promise<Result> => {
    const result = await boundary.run(args, cwd, { install });
    return { code: result.code, log: stripAnsi(result.out + "\n" + result.err) };
  };
  const base = resolve(work, ".shiptorio-verify-base");
  let baseResult: Result;
  const added = await run(["git", "worktree", "add", "--detach", base, baseSha], work);
  if (added.code) { await sandbox.close(); throw new Error("Unable to prepare isolated verify base"); }
  let baseSandbox: CheckSandbox | undefined;
  try {
    baseSandbox = await checkSandbox(base);
    if (await Bun.file(resolve(base, "bun.lock")).exists()) {
      const install = await run([process.execPath, "install", "--frozen-lockfile", "--ignore-scripts"], base, baseSandbox, true);
      if (install.code) throw new Error("Verify base dependency setup failed");
    }
    for (const path of tests) {
      const source = resolve(work, path);
      if (!(await lstat(source)).isFile()) throw new Error("Verify recipe is not a regular file");
      await mkdir(dirname(resolve(base, path)), { recursive: true });
      await copyFile(source, resolve(base, path));
    }
    baseResult = await run(args, base, baseSandbox);
  } finally {
    await baseSandbox?.close();
    const removed = await run(["git", "worktree", "remove", "--force", base], work);
    if (removed.code) { await sandbox.close(); throw new Error("Verify base cleanup failed"); }
  }
  let headResult: Result;
  try { headResult = await run(args, work); } finally { await sandbox.close(); }
  const logTail = `BASE ${baseSha}: exit ${baseResult.code}\n${baseResult.log.slice(-1400)}\nHEAD: exit ${headResult.code}\n${headResult.log.slice(-1400)}`.slice(-3000);
  return { failsOnBase: testOutcome(baseResult).reproduced, passesOnHead: testOutcome(headResult).passed, baseSha, command, logTail };
}
