import { expect, test } from "bun:test";
import { mkdtemp, mkdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { prepareApprovedCommit } from "../src/publication";

// Real Git transport, no provider calls, live branch or runner process involved.
test("base refresh replaces only the leased factory branch with one trusted commit and recovers a lost acknowledgment", async () => {
  const root = await mkdtemp(join(tmpdir(), "shiptorio-refresh-test-"));
  const source = join(root, "source"), remote = join(root, "remote.git");
  await mkdir(source);
  const git = async (cwd: string, ...args: string[]) => {
    const p = Bun.spawn(["git", ...args], { cwd, env: { PATH: process.env.PATH, HOME: root, GIT_CONFIG_NOSYSTEM: "1", GIT_CONFIG_GLOBAL: "/dev/null", GIT_AUTHOR_DATE: "2026-10-26T01:02:03Z", GIT_COMMITTER_DATE: "2026-10-26T01:02:03Z" }, stdout: "pipe", stderr: "pipe" });
    const [out, err, code] = await Promise.all([new Response(p.stdout).text(), new Response(p.stderr).text(), p.exited]);
    if (code) throw new Error(err); return out.trim();
  };
  const branch = "shiptorio/runner-00000000-0000-4000-8000-000000000001";
  const commit = async (message: string) => { await git(source, "add", "."); await git(source, "-c", "user.name=Test", "-c", "user.email=test@example.invalid", "commit", "-m", message); return git(source, "rev-parse", "HEAD"); };
  let publication: Awaited<ReturnType<typeof prepareApprovedCommit>> | undefined;
  try {
    await git(source, "init", "--initial-branch=main");
    await Bun.write(join(source, "value.ts"), "export const value = 1;\n");
    const originalBase = await commit("base");
    await git(root, "init", "--bare", remote);
    await git(source, "push", remote, "HEAD:refs/heads/main");
    await git(source, "checkout", "-b", branch);
    await Bun.write(join(source, "value.ts"), "export const value = 2;\n");
    const oldHead = await commit("old fix");
    await git(source, "push", remote, `HEAD:refs/heads/${branch}`);
    await git(source, "checkout", "main");
    await Bun.write(join(source, "unrelated.ts"), "export const untouched = true;\n");
    const newBase = await commit("main advanced");
    await git(source, "push", remote, "HEAD:refs/heads/main");
    const job = { sourceUrl: remote, baseSha: newBase, allowedPaths: ["value.ts"], refreshBase: { expectedHeadSha: oldHead } };
    const files = { "value.ts": Buffer.from("export const value = 2;\n").toString("base64") };
    publication = await prepareApprovedCommit(job, files);
    expect(await git(publication.directory, "show", "-s", "--format=%P", publication.sha)).toBe(newBase);
    expect(await git(publication.directory, "diff", "--name-only", `${newBase}..HEAD`)).toBe("value.ts");
    expect(await git(publication.directory, "show", "HEAD:unrelated.ts")).toContain("untouched");
    await publication.push(branch);
    expect(await git(remote, "rev-parse", `refs/heads/${branch}`)).toBe(publication.sha);
    expect(await git(remote, "rev-parse", "refs/heads/main")).toBe(newBase);
    await publication.push(branch); // Same deterministic SHA after an unknown acknowledgment.
    const replay = await prepareApprovedCommit(job, files);
    try { expect(replay.sha).toBe(publication.sha); await replay.push(branch); } finally { await replay.close(); }
    // A new human/agent head must survive even though the original approval was valid.
    await git(source, "checkout", "-b", "other", originalBase);
    await Bun.write(join(source, "value.ts"), "export const value = 3;\n");
    const concurrent = await commit("someone else changed the branch");
    await git(source, "push", "--force", remote, `HEAD:refs/heads/${branch}`);
    await expect(publication.push(branch)).rejects.toThrow("changed; approve a fresh plan");
    expect(await git(remote, "rev-parse", `refs/heads/${branch}`)).toBe(concurrent);
    await expect(publication.push("main")).rejects.toThrow("Invalid publication branch");
  } finally { await publication?.close(); await rm(root, { recursive: true, force: true }); }
}, 20000);
