import { localBoundary } from "../src/local-files";
import { expect } from "bun:test";
import { link, mkdir, mkdtemp, readFile, realpath, rename, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { runLocalAssembler as assembleLocal } from "../src/local-model";
import { nativeTest } from "./native-prerequisite";

const config = { baseUrl: "http://127.0.0.1:11434/v1", model: "synthetic" };
const response = () => Response.json({ choices: [{ message: { content: JSON.stringify({ summary: "Edit", files: [{ path: "README.md", content: "changed" }] }) } }] });

nativeTest("local assembly cannot follow a checkout root replaced during the model wait", async () => {
  const root = await realpath(await mkdtemp(join(tmpdir(), "shiptorio-local-boundary-")));
  const work = join(root, "job", "checkout"), outside = join(root, "outside");
  await mkdir(work, { recursive: true }); await mkdir(outside);
  await writeFile(join(work, "README.md"), "source"); await writeFile(join(outside, "README.md"), "outside unchanged");
  try {
    const fetcher = (async () => { await rename(work, work + "-old"); await symlink(outside, work); return response(); }) as unknown as typeof fetch;
    await expect(runLocalAssembler({ plan: "Edit the README", allowedPaths: ["README.md"] }, work, config, fetcher)).rejects.toThrow();
    expect(await readFile(join(outside, "README.md"), "utf8")).toBe("outside unchanged");
  } finally { await rm(root, { recursive: true, force: true }); }
});

nativeTest("local assembly rejects host hardlinks before sending source to a model", async () => {
  const root = await realpath(await mkdtemp(join(tmpdir(), "shiptorio-local-link-")));
  const work = join(root, "checkout"), canary = join(root, "outside.md");
  await mkdir(work); await writeFile(canary, "outside unchanged"); await link(canary, join(work, "README.md"));
  let requests = 0;
  try {
    await expect(runLocalAssembler({ plan: "Edit the README", allowedPaths: ["README.md"] }, work, config, (async () => { requests++; return response(); }) as unknown as typeof fetch)).rejects.toThrow();
    expect(requests).toBe(0); expect(await readFile(canary, "utf8")).toBe("outside unchanged");
  } finally { await rm(root, { recursive: true, force: true }); }
});

nativeTest("local edits reject changed sources, late hardlinks, and parent swaps during the model wait", async () => {
  for (const change of ["content", "hardlink", "parent"] as const) {
    const root = await realpath(await mkdtemp(join(tmpdir(), "shiptorio-local-race-")));
    const work = join(root, "checkout"), outside = join(root, "outside");
    await mkdir(join(work, "docs"), { recursive: true }); await mkdir(outside);
    const path = change === "parent" ? "docs/README.md" : "README.md";
    await writeFile(join(work, path), "source"); await writeFile(join(outside, "README.md"), "outside unchanged");
    try {
      const fetcher = (async () => {
        if (change === "content") await writeFile(join(work, path), "newer source");
        else if (change === "hardlink") { await rm(join(work, path)); await link(join(outside, "README.md"), join(work, path)); }
        else { await rename(join(work, "docs"), join(work, "docs-old")); await symlink(outside, join(work, "docs")); }
        return Response.json({ choices: [{ message: { content: JSON.stringify({ summary: "Edit", files: [{ path, content: "changed" }] }) } }] });
      }) as unknown as typeof fetch;
      await expect(runLocalAssembler({ plan: "Edit the README", allowedPaths: [path] }, work, config, fetcher)).rejects.toThrow();
      expect(await readFile(join(outside, "README.md"), "utf8")).toBe("outside unchanged");
      if (change === "content") expect(await readFile(join(work, path), "utf8")).toBe("newer source");
    } finally { await rm(root, { recursive: true, force: true }); }
  }
});

nativeTest("local checkout boundary rejects a poisoned resumed root and a sibling source checkout swap", async () => {
  const root = await realpath(await mkdtemp(join(tmpdir(), "shiptorio-local-pinned-")));
  const work = join(root, "checkout"), source = join(root, "source.git");
  await mkdir(work); await mkdir(source);
  await writeFile(join(work, "README.md"), "source"); await writeFile(join(source, "README.md"), "source");
  try {
    const fetcher = (async () => { await rename(work, work + "-old"); await symlink(source, work); return response(); }) as unknown as typeof fetch;
    await expect(runLocalAssembler({ plan: "Edit the README", allowedPaths: ["README.md"] }, work, config, fetcher)).rejects.toThrow();
    expect(await readFile(join(source, "README.md"), "utf8")).toBe("source");
    await expect(localBoundary(work)).rejects.toThrow("assigned checkout");
  } finally { await rm(root, { recursive: true, force: true }); }
});

nativeTest("local edits carry three near-limit files over stdin without argument-string limits", async () => {
  const work = await realpath(await mkdtemp(join(tmpdir(), "shiptorio-local-large-")));
  const paths = ["a.md", "b.md", "c.md"], before = '"'.repeat(60_000), after = "y".repeat(60_000);
  try {
    for (const path of paths) await writeFile(join(work, path), before);
    const fetcher = (async () => Response.json({ choices: [{ message: { content: JSON.stringify({ summary: "Edit", files: paths.map(path => ({ path, content: after })) }) } }] })) as unknown as typeof fetch;
    expect((await runLocalAssembler({ plan: "Edit prose", allowedPaths: paths }, work, config, fetcher)).paths).toEqual(paths);
    for (const path of paths) expect(await readFile(join(work, path), "utf8")).toBe(after);
  } finally { await rm(work, { recursive: true, force: true }); }
});

async function runLocalAssembler(job: Parameters<typeof assembleLocal>[0], work: string, config: Parameters<typeof assembleLocal>[2], fetchImpl?: typeof fetch) {
  const sandbox = await localBoundary(work);
  try { return await assembleLocal(job, work, config, sandbox, fetchImpl); } finally { await sandbox.close(); }
}
