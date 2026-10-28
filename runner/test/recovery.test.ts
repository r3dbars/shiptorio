import { expect, test } from "bun:test";
import { mkdtemp, mkdir, rm, realpath, stat, symlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { Backoff, recoverWorkspace, replayReceipts, retryable } from "../src/recovery";
import type { Job } from "../src/messages";
const job = (): Job => ({ id: crypto.randomUUID(), lease: crypto.randomUUID(), repo: "you/repo", harness: "codex", baseSha: "a".repeat(40), branch: "", plan: "Fix the bug", allowedPaths: ["value.ts"], token: "private-installation-token", deadline: Date.now() + 60000 });
const assignment = () => { const j = job(); j.branch = `shiptorio/runner-${j.id}`; return j; };

test("transport backoff grows, jitters, caps and wakes after sleep; success resets it", () => {
  const retry = new Backoff(() => 1);
  expect(retry.fail(1000)).toBe(1000); expect(retry.ready(1999)).toBe(false);
  expect(retry.fail(2000)).toBe(2000); expect(retry.fail(4000)).toBe(4000);
  for (let i = 0; i < 15; i++) expect(retry.fail(8000)).toBeLessThanOrEqual(60000);
  expect(retry.ready(10_000_000)).toBe(true);
  retry.reset(); expect(retry.ready(0)).toBe(true); expect(retry.fail(0)).toBe(1000);
  expect(new Backoff(() => 0).fail(0)).toBe(500);
  for (const e of [new TypeError("fetch failed"), { name: "TimeoutError" }, { status: 503 }, { status: 429 }, { code: "ECONNRESET" }]) expect(retryable(e)).toBe(true);
  for (const e of [{ status: 401 }, { status: 403 }, { status: 400 }, new Error("typecheck failed")]) expect(retryable(e)).toBe(false);
});

test("a restarted process resumes partial edits and checkpointed checks only on the same lease, without persisting tokens", async () => {
  const root = await realpath(await mkdtemp(resolve(tmpdir(), "shiptorio-recovery-")));
  try {
    const j = assignment(), first = await recoverWorkspace(root, j);
    await mkdir(first.work); await Bun.write(resolve(first.work, "value.ts"), "half finished");
    await first.checkpoint("initialized");
    const resumed = await recoverWorkspace(root, { ...j, token: "fresh-token" });
    expect(resumed.directory).toBe(first.directory); expect(resumed.state.initialized).toBe(true); expect(resumed.state.agentDone).toBe(false);
    expect(await Bun.file(resolve(resumed.work, "value.ts")).text()).toBe("half finished");
    await resumed.checkpoint("agentDone"); await resumed.freeze({ "value.ts": "Zm9v" });
    const checks = await recoverWorkspace(root, j);
    expect(checks.state.agentDone).toBe(true);
    await expect(checks.freeze({ "value.ts": "YmFy" })).rejects.toThrow("changed approved files");
    const journal = resolve(root, ".recovery", `${j.id}.json`);
    expect(await Bun.file(journal).text()).not.toContain(j.token);
    expect((await stat(journal)).mode & 0o777).toBe(0o600);
    for (const changed of [{ lease: crypto.randomUUID() }, { baseSha: "b".repeat(40) }, { repo: "other/repo" }, { allowedPaths: ["other.ts"] }]) await expect(recoverWorkspace(root, { ...j, ...changed })).rejects.toThrow("assignment changed");
    await checks.close(); expect(await Bun.file(journal).exists()).toBe(false);
  } finally { await rm(root, { recursive: true, force: true }); }
});

test("lost finish acknowledgments replay automatically for the right repo, then remove recovery state", async () => {
  const root = await realpath(await mkdtemp(resolve(tmpdir(), "shiptorio-receipt-")));
  try {
    const j = assignment(); await recoverWorkspace(root, j);
    const receipt = { jobId: j.id, lease: j.lease, ok: true, sha: "b".repeat(40), checks: ["typecheck", "test", "build"], summary: "Done" };
    await Bun.write(resolve(root, ".work", `${j.id}.receipt.json`), JSON.stringify(receipt));
    let sent = 0;
    await replayReceipts(root, "other/repo", async () => { sent++; }); expect(sent).toBe(0);
    await expect(replayReceipts(root, j.repo, async () => { throw new TypeError("offline"); })).rejects.toThrow("offline");
    await replayReceipts(root, j.repo, async data => { expect(data).toEqual(receipt); sent++; });
    await replayReceipts(root, j.repo, async () => { sent++; }); expect(sent).toBe(1);
    expect(await Bun.file(resolve(root, ".work", `${j.id}.receipt.json`)).exists()).toBe(true);
  } finally { await rm(root, { recursive: true, force: true }); }
});

test("recovery refuses symlinked workspace roots", async () => {
  const root = await realpath(await mkdtemp(resolve(tmpdir(), "shiptorio-recovery-link-")));
  try { await symlink(tmpdir(), resolve(root, ".recovery")); await expect(recoverWorkspace(root, assignment())).rejects.toThrow("symlink"); }
  finally { await rm(root, { recursive: true, force: true }); }
});

test("refresh recovery refuses a changed prior-head lease or base instead of reusing old proof", async () => {
  const root = await realpath(await mkdtemp(resolve(tmpdir(), "shiptorio-refresh-recovery-")));
  try {
    const j = { ...assignment(), reworkPr: 99, verifyBaseSha: "a".repeat(40), refreshBase: { expectedHeadSha: "b".repeat(40) } };
    const first = await recoverWorkspace(root, j);
    await expect(recoverWorkspace(root, { ...j, refreshBase: { expectedHeadSha: "c".repeat(40) } })).rejects.toThrow("assignment changed");
    await expect(recoverWorkspace(root, { ...j, baseSha: "d".repeat(40), verifyBaseSha: "d".repeat(40) })).rejects.toThrow("assignment changed");
    await first.close();
  } finally { await rm(root, { recursive: true, force: true }); }
});

test("updating for refresh jobs still resumes an existing normal-job recovery journal", async () => {
  const root = await realpath(await mkdtemp(resolve(tmpdir(), "shiptorio-legacy-recovery-")));
  try {
    const id = "12345678-1234-4234-8234-123456789abc";
    const j = { ...assignment(), id, lease: id, deadline: 60000, branch: `shiptorio/runner-${id}` };
    const first = await recoverWorkspace(root, j);
    const path = resolve(root, ".recovery", `${id}.json`);
    const journal = await Bun.file(path).json();
    // Persisted identity from the runner before base refresh existed (no trailing new field).
    journal.identity = '["12345678-1234-4234-8234-123456789abc","you/repo","12345678-1234-4234-8234-123456789abc","aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa","shiptorio/runner-12345678-1234-4234-8234-123456789abc","codex","Fix the bug",["value.ts"],60000,null,null,null]';
    await Bun.write(path, JSON.stringify(journal));
    expect((await recoverWorkspace(root, j)).directory).toBe(first.directory);
    await first.close();
  } finally { await rm(root, { recursive: true, force: true }); }
});
