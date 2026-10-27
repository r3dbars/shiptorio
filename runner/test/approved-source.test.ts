import { expect, test } from "bun:test";
import { mkdtemp, mkdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { fetchApprovedSource } from "../src/approved-source";
import { prepareApprovedCommit } from "../src/publication";

async function fixture() {
  const root = await mkdtemp(join(tmpdir(), "shiptorio source é 雪 "));
  const source = join(root, "repository moved main"), destination = join(root, "approved source.git");
  await mkdir(source);
  const env = { PATH: process.env.PATH, HOME: root, GIT_CONFIG_NOSYSTEM: "1", GIT_CONFIG_GLOBAL: "/dev/null", GIT_TERMINAL_PROMPT: "0" };
  const git = async (args: string[], cwd = source) => {
    const p = Bun.spawn(["git", "-c", "core.hooksPath=/dev/null", ...args], { cwd, env, stdout: "pipe", stderr: "pipe" });
    const [out, err, code] = await Promise.all([new Response(p.stdout).text(), new Response(p.stderr).text(), p.exited]);
    if (code) throw new Error(`Fixture git failed: ${err}`);
    return out.trim();
  };
  const commit = async (text: string) => {
    await Bun.write(join(source, "value.ts"), text);
    await git(["add", "value.ts"]);
    await git(["-c", "user.name=Test", "-c", "user.email=test@example.invalid", "commit", "-m", text]);
    return git(["rev-parse", "HEAD"]);
  };
  await git(["init", "--initial-branch=main"]);
  const ancestor = await commit("ancestor"), base = await commit("approved"), proof = await commit("proof"), latest = await commit("main advanced");
  await git(["branch", "unrelated", latest]); await git(["tag", "unrelated-tag", ancestor]);
  return { root, source, destination, git, ancestor, base, proof, latest, url: pathToFileURL(source).href };
}

test("approved source fetch keeps both exact older bases but no unrelated refs or history", async () => {
  const f = await fixture();
  try {
    await fetchApprovedSource(f.git, f.destination, f.url, [f.base, f.proof, f.base], true);
    expect(await f.git(["rev-parse", "--is-bare-repository"], f.destination)).toBe("true");
    expect(await f.git(["for-each-ref", "--format=%(refname)"], f.destination)).toBe("");
    expect(await f.git(["cat-file", "-p", `${f.base}:value.ts`], f.destination)).toBe("approved");
    expect(await f.git(["cat-file", "-p", `${f.proof}:value.ts`], f.destination)).toBe("proof");
    for (const absent of [f.ancestor, f.latest]) await expect(f.git(["cat-file", "-e", absent], f.destination)).rejects.toThrow();
    const checkout = join(f.root, "worktree é 雪");
    await f.git(["worktree", "add", "--detach", checkout, f.base], f.destination);
    expect(await Bun.file(join(checkout, "value.ts")).text()).toBe("approved");
    const proofTree = join(f.root, "proof checkout");
    await f.git(["worktree", "add", "--detach", proofTree, f.proof], f.destination);
    expect(await Bun.file(join(proofTree, "value.ts")).text()).toBe("proof");
  } finally { await rm(f.root, { recursive: true, force: true }); }
});

test("invalid or non-commit approved objects fail closed", async () => {
  let calls = 0;
  const run = async () => { calls++; return ""; };
  for (const commits of [[], ["main"], ["-bad"], ["a".repeat(39)], ["A".repeat(40)]]) {
    await expect(fetchApprovedSource(run, "/unused", "file:///unused", commits)).rejects.toThrow("Invalid approved source commit");
  }
  expect(calls).toBe(0);
  const f = await fixture();
  try {
    const blob = await f.git(["rev-parse", `${f.base}:value.ts`]);
    await expect(fetchApprovedSource(f.git, f.destination, f.url, [blob], true)).rejects.toThrow();
  } finally { await rm(f.root, { recursive: true, force: true }); }
});

test("trusted publication uses the approved older base and still pushes a deterministic scoped commit", async () => {
  const f = await fixture();
  const commits: Awaited<ReturnType<typeof prepareApprovedCommit>>[] = [];
  try {
    const job = { sourceUrl: f.url, baseSha: f.base, allowedPaths: ["value.ts"] };
    const files = { "value.ts": Buffer.from("approved change").toString("base64") };
    for (let i = 0; i < 2; i++) commits.push(await prepareApprovedCommit(job, files));
    const result = commits[0]!;
    expect(commits[1]!.sha).toBe(result.sha);
    expect(await f.git(["rev-parse", "HEAD^"], result.directory)).toBe(f.base);
    expect(await f.git(["diff", "--name-only", `${f.base}..HEAD`], result.directory)).toBe("value.ts");
    expect(await f.git(["for-each-ref", "--format=%(refname)"], result.directory)).toBe("");
    for (const absent of [f.ancestor, f.proof, f.latest]) await expect(f.git(["cat-file", "-e", absent], result.directory)).rejects.toThrow();
    const branch = "shiptorio/runner-11111111-1111-1111-1111-111111111111";
    await result.push(branch);
    expect(await f.git(["rev-parse", branch])).toBe(result.sha);
    expect(await f.git(["rev-parse", "main"])).toBe(f.latest);
    await expect(result.push("main")).rejects.toThrow("Invalid publication branch");
  } finally { for (const commit of commits) await commit.close(); await rm(f.root, { recursive: true, force: true }); }
});
