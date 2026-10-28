import { fetchApprovedSource } from "./approved-source";
import { lstat, mkdtemp, mkdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import type { CheckSandbox } from "./sandbox";
import { verificationGit } from "./sandbox";
import { validateChanges } from "./policy";

export type ApprovedFiles = Record<string, string>;
/** Give a shell-free assembler bounded code evidence, never direct host-file access. */
export async function assemblerContext(sandbox: CheckSandbox, paths: string[]): Promise<{ path: string; content: string }[]> {
  const program = `import {lstatSync,readFileSync,realpathSync} from "node:fs";
const root=realpathSync(process.cwd());const paths=JSON.parse(process.argv[1]);const result=[];
for(const path of paths){try{const target=realpathSync(path);if(!target.startsWith(root+"/")||!lstatSync(path).isFile())throw Error("Unsafe source file");result.push({path,content:readFileSync(target,"utf8").slice(0,12000)});}catch(error){if(error.code!=="ENOENT")throw error;result.push({path,content:"File does not exist yet"});}}console.log(JSON.stringify(result));`;
  const result = await sandbox.run([process.execPath, "--no-env-file", "-e", program, JSON.stringify(paths)]);
  if (result.code) throw new Error("Unable to read approved assembler context");
  const files = JSON.parse(result.out) as { path: string; content: string }[];
  if (files.length !== paths.length || files.some(f => !paths.includes(f.path) || typeof f.content !== "string" || f.content.length > 12000)) throw new Error("Invalid assembler context");
  return files;
}

/** Read hostile paths inside the OS boundary, including symlink/race resolution. */
export async function snapshotApproved(sandbox: CheckSandbox, paths: string[]): Promise<ApprovedFiles> {
  const program = `import {lstatSync,readFileSync,realpathSync} from "node:fs";
const paths=JSON.parse(process.argv[1]);const root=realpathSync(process.cwd());const result={};let size=0;
for(const path of paths){const target=realpathSync(path);if(!target.startsWith(root+"/")||!lstatSync(path).isFile())throw Error("Unsafe approved path");const bytes=readFileSync(target);size+=bytes.length;if(size>2000000)throw Error("Approved patch files exceed 2MB");result[path]=bytes.toString("base64");}console.log(JSON.stringify(result));`;
  const result = await sandbox.run([process.execPath, "--no-env-file", "-e", program, JSON.stringify(paths)]);
  if (result.code) throw new Error("Unable to freeze approved files inside the verification sandbox");
  const files = JSON.parse(result.out) as ApprovedFiles;
  if (Object.keys(files).length !== paths.length || paths.some(path => typeof files[path] !== "string") || Object.values(files).reduce((size, value) => size + Buffer.from(value, "base64").length, 0) > 2_000_000) throw new Error("Invalid approved file snapshot");
  return files;
}

/** Never publish through metadata/config/hooks that an agent or test could modify. */
export async function prepareApprovedCommit(job: { sourceUrl: string; baseSha: string; allowedPaths: string[]; refreshBase?: { expectedHeadSha: string } }, files: ApprovedFiles, token = ""): Promise<{ sha: string; directory: string; push(branch: string): Promise<void>; close(): Promise<void> }> {
  if (job.refreshBase && (!/^[a-f0-9]{40}$/.test(job.refreshBase.expectedHeadSha) || job.refreshBase.expectedHeadSha === job.baseSha)) throw new Error("Invalid approved publication lease");
  const root = await mkdtemp(join(tmpdir(), "shiptorio-publish-"));
  const home = join(root, "home"), work = join(root, "checkout"), hooks = join(root, "empty-hooks");
  await mkdir(home); await mkdir(hooks);
  const git = await verificationGit();
  const url = job.sourceUrl;
  const env = {
    HOME: home, TMPDIR: root, PATH: "/usr/bin:/bin", LANG: "en_US.UTF-8",
    GIT_CONFIG_NOSYSTEM: "1", GIT_CONFIG_GLOBAL: "/dev/null", GIT_TERMINAL_PROMPT: "0",
    GIT_CONFIG_COUNT: "3", GIT_CONFIG_KEY_0: "http.https://github.com/.extraheader",
    GIT_CONFIG_VALUE_0: `AUTHORIZATION: basic ${Buffer.from(`x-access-token:${token}`).toString("base64")}`,
    GIT_CONFIG_KEY_1: "core.hooksPath", GIT_CONFIG_VALUE_1: hooks,
    GIT_CONFIG_KEY_2: "core.fsmonitor", GIT_CONFIG_VALUE_2: "false",
  };
  const run = async (args: string[], cwd = root) => {
    const process = Bun.spawn([git, ...args], { cwd, env, stdout: "pipe", stderr: "pipe" });
    const timer = setTimeout(() => process.kill(), 120000);
    try {
      const [out, _err, code] = await Promise.all([new Response(process.stdout).text(), new Response(process.stderr).text(), process.exited]);
      if (code) throw new Error(`Trusted publication git ${args[0]} failed (${code})`);
      return out.trim();
    } finally { clearTimeout(timer); }
  };
  try {
    await fetchApprovedSource(run, work, url, [job.baseSha]);
    await run(["checkout", "--detach", job.baseSha], work);
    // The trusted checkout starts from main/previous PR head, not agent-owned metadata.
    // Never copy files through a tracked symlink ancestor.
    for (const [path, content] of Object.entries(files)) {
      if (!job.allowedPaths.includes(path) || !/^[\w./@+-]+$/.test(path) || path.split("/").some(part => part === ".." || part.toLowerCase() === ".git") || path.startsWith("/")) throw new Error("Invalid publication path");
      let current = work;
      for (const part of path.split("/").slice(0, -1)) {
        current = join(current, part);
        try { if (!(await lstat(current)).isDirectory()) throw new Error("Publication parent is not a regular directory"); }
        catch (error) { if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error; await mkdir(current); }
      }
      const destination = join(work, path);
      try { if (!(await lstat(destination)).isFile()) throw new Error("Publication target is not a regular file"); }
      catch (error) { if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error; }
      await Bun.write(destination, Buffer.from(content, "base64"));
    }
    const paths = Object.keys(files);
    await run(["add", "--", ...paths], work);
    const diff = await run(["diff", "--cached", "--no-ext-diff", "--no-textconv"], work);
    validateChanges(paths, job.allowedPaths, diff);
    // Stable metadata makes a lost push acknowledgment safe to retry: identical patch => identical SHA.
    const timestamp = await run(["show", "-s", "--format=%cI", job.baseSha], work);
    Object.assign(env, { GIT_AUTHOR_DATE: timestamp, GIT_COMMITTER_DATE: timestamp });
    await run(["-c", "user.name=Shiptorio local runner", "-c", "user.email=shiptorio@users.noreply.github.com", "commit", "-m", "Execute Spark-approved issue plan with local subscription agent"], work);
    const sha = await run(["rev-parse", "HEAD"], work);
    let closed = false;
    const close = async () => { closed = true; env.GIT_CONFIG_VALUE_0 = ""; await rm(root, { recursive: true, force: true }); };
    return { sha, directory: work, close, async push(branch) {
      if (closed || !/^shiptorio\/runner-[a-f0-9-]{36}$/.test(branch)) throw new Error("Invalid publication branch");
      const ref = `refs/heads/${branch}`;
      if (job.refreshBase) {
        // The approved old head is immutable authority; never infer a lease from a fresh fetch.
        // A lost acknowledgment can only recover the identical deterministic commit.
        const current = (await run(["ls-remote", "--refs", url, ref], work)).split(/\s+/)[0];
        if (current === sha) return;
        if (current !== job.refreshBase.expectedHeadSha) throw new Error("Factory branch changed; approve a fresh plan");
        await run(["push", `--force-with-lease=${ref}:${job.refreshBase.expectedHeadSha}`, url, `HEAD:${ref}`], work);
      } else await run(["push", url, `HEAD:${ref}`], work);
    } };
  } catch (error) { env.GIT_CONFIG_VALUE_0 = ""; await rm(root, { recursive: true, force: true }); throw error; }
}

export async function publishApproved(job: { repo: string; token: string; baseSha: string; branch: string; allowedPaths: string[]; refreshBase?: { expectedHeadSha: string } }, files: ApprovedFiles): Promise<string> {
  const commit = await prepareApprovedCommit({ sourceUrl: `https://github.com/${job.repo}.git`, baseSha: job.baseSha, allowedPaths: job.allowedPaths, refreshBase: job.refreshBase }, files, job.token);
  try { await commit.push(job.branch); return commit.sha; } finally { await commit.close(); }
}
