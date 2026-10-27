import { expect, test } from "bun:test";
import { chmod, mkdtemp, mkdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { checkSandbox } from "../src/sandbox";
import { assemblerContext, prepareApprovedCommit, snapshotApproved } from "../src/publication";

test.skipIf(process.platform !== "darwin" || process.env.SHIPTORIO_CHECK_SANDBOX === "1")("publication freezes approved bytes and ignores hostile metadata and hooks", async () => {
  const root = await mkdtemp(join(tmpdir(), "shiptorio-publication-test-"));
  const source = join(root, "source"), work = join(root, "hostile"), marker = join(root, "hook-fired");
  await mkdir(source);
  const git = async (cwd: string, ...args: string[]) => {
    const p = Bun.spawn(["git", ...args], { cwd, env: { PATH: process.env.PATH, HOME: root, GIT_CONFIG_NOSYSTEM: "1", GIT_CONFIG_GLOBAL: "/dev/null", GIT_AUTHOR_DATE: "2026-10-26T01:02:03Z", GIT_COMMITTER_DATE: "2026-10-26T01:02:03Z" }, stdout: "pipe", stderr: "pipe" });
    const [out, err, code] = await Promise.all([new Response(p.stdout).text(), new Response(p.stderr).text(), p.exited]);
    if (code) throw new Error(err); return out.trim();
  };
  let sandbox: Awaited<ReturnType<typeof checkSandbox>> | undefined;
  let commit: Awaited<ReturnType<typeof prepareApprovedCommit>> | undefined;
  try {
    await git(source, "init", "--initial-branch=main");
    await Bun.write(join(source, "value.ts"), "export const value = 1;\n");
    await git(source, "add", ".");
    await git(source, "-c", "user.name=Test", "-c", "user.email=test@example.invalid", "commit", "-m", "base");
    const base = await git(source, "rev-parse", "HEAD");
    await git(root, "clone", source, work);
    await Bun.write(join(work, "value.ts"), "export const value = 2;\n");
    const hook = join(work, ".git", "hooks", "post-commit");
    await Bun.write(hook, `#!/bin/sh\nprintf escaped > '${marker}'\n`); await chmod(hook, 0o755);
    await git(work, "config", "core.hooksPath", join(work, ".git", "hooks"));
    sandbox = await checkSandbox(work);
    expect(await assemblerContext(sandbox, ["value.ts", "new.test.ts"])).toEqual([{ path: "value.ts", content: "export const value = 2;\n" }, { path: "new.test.ts", content: "File does not exist yet" }]);
    const files = await snapshotApproved(sandbox, ["value.ts"]);
    await Bun.write(join(work, "value.ts"), "export const value = 999;\n");
    commit = await prepareApprovedCommit({ sourceUrl: source, baseSha: base, allowedPaths: ["value.ts"] }, files, "fake-publication-token");
    expect(await Bun.file(join(commit.directory, "value.ts")).text()).toBe("export const value = 2;\n");
    expect(await git(commit.directory, "rev-list", "--count", `${base}..${commit.sha}`)).toBe("1");
    expect(await git(commit.directory, "diff", "--name-only", `${base}..${commit.sha}`)).toBe("value.ts");
    // Reconstructing after an unknown push outcome must produce exactly the same commit.
    const retry = await prepareApprovedCommit({ sourceUrl: source, baseSha: base, allowedPaths: ["value.ts"] }, files, "fresh-publication-token");
    try { expect(retry.sha).toBe(commit.sha); expect(await git(commit.directory, "show", "-s", "--format=%ct", commit.sha)).toBe(await git(source, "show", "-s", "--format=%ct", base)); } finally { await retry.close(); }
    expect(await Bun.file(marker).exists()).toBe(false);
    expect(await Bun.file(join(commit.directory, ".git", "config")).text()).not.toContain("hooksPath");
  } finally { await commit?.close(); await sandbox?.close(); await rm(root, { recursive: true, force: true }); }
}, 15000);
