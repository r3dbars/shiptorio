import { expect, test } from "bun:test";
import { mkdtemp, mkdir, rm, symlink, realpath } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { jobWorkspace } from "../src/workspace";
const id = "12345678-1234-4234-8234-123456789abc";
test("jobs use fresh private directories, reject path escape and symlink roots, and clean up", async () => {
  const root = await realpath(await mkdtemp(join(tmpdir(), "shiptorio-workspace-test-")));
  try {
    await expect(jobWorkspace(root, "../../outside")).rejects.toThrow("UUID");
    const first = await jobWorkspace(root, id), second = await jobWorkspace(root, id);
    expect(first.directory).not.toBe(second.directory);
    expect(first.work.startsWith(join(root, ".work") + "/")).toBe(true);
    await mkdir(first.work); await Bun.write(join(first.work, "test"), "data");
    await first.close(); await second.close();
    expect(await Bun.file(join(first.work, "test")).exists()).toBe(false);
    await rm(join(root, ".work"), { recursive: true });
    await symlink(tmpdir(), join(root, ".work"));
    await expect(jobWorkspace(root, id)).rejects.toThrow("symlink");
  } finally { await rm(root, { recursive: true, force: true }); }
});
