import { expect } from "bun:test";
import { chmod, link, mkdir, mkdtemp, realpath, rm, symlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { assembleCodex } from "../src/codex-assembler";
import { CODEX_EDIT_SCHEMA } from "../src/codex-edits";
import { assemblerContext, snapshotApproved } from "../src/publication";
import { checkSandbox } from "../src/sandbox";
import { resetVerifyBase } from "../src/verify";
import { nativeTest } from "./native-prerequisite";

nativeTest("Codex control schema ignores poisoned workspace paths and is read-only to the agent", async () => {
  const container = await realpath(await mkdtemp(join(tmpdir(), "shiptorio-control-")));
  const root = join(container, "job"), work = join(root, "checkout"), home = join(container, "home"), executable = join(container, "codex");
  const canary = join(container, "canary"), oldSchema = join(root, "codex-edit-schema.json");
  await mkdir(work, { recursive: true }); await mkdir(home);
  await Bun.write(canary, "outside unchanged");
  await Bun.write(join(work, "README.md"), "Original documentation.\n");
  const reply = { summary: "Improved documentation", edits: [{ path: "README.md", create: false, oldText: "Original", newText: "Clear" }] };
  const events = JSON.stringify({ type: "item.completed", item: { type: "agent_message", text: JSON.stringify(reply) } }) + '\n{"type":"turn.completed"}';
  await Bun.write(executable, `#!/bin/sh\nwhile [ "$#" -gt 0 ]; do if [ "$1" = "--output-schema" ]; then shift; schema="$1"; fi; shift; done\nprintf '%s' "$schema" > "$HOME/schema-path"\ncat "$schema" > "$HOME/schema-copy" || exit 91\nif (printf changed > "$schema") 2>/dev/null; then exit 92; fi\nprintf '%s\\n' '${events}'\n`);
  await chmod(executable, 0o700);
  const verification = await checkSandbox(work);
  try {
    for (const args of [["git", "init"], ["git", "add", "."], ["git", "-c", "user.name=Fixture", "-c", "user.email=fixture@example.invalid", "commit", "-m", "base"]]) expect((await verification.run(args)).code).toBe(0);
    for (const poison of [symlink, link]) {
      await poison(canary, oldSchema);
      const result = await assembleCodex({ root, work, home, executable, timeout: 5000, job: { plan: "Improve the README", allowedPaths: ["README.md"] }, files: [{ path: "README.md", content: "Original documentation.\n" }], verification });
      expect(result.code).toBe(0);
      expect(await Bun.file(canary).text()).toBe("outside unchanged");
      expect(JSON.parse(await Bun.file(join(home, "schema-copy")).text())).toEqual(CODEX_EDIT_SCHEMA);
      expect(await Bun.file(join(work, "README.md")).text()).toBe("Clear documentation.\n");
      expect(await Bun.file(await Bun.file(join(home, "schema-path")).text()).exists()).toBe(false);
      await rm(oldSchema);
      expect((await verification.run(["git", "checkout", "--", "README.md"])).code).toBe(0);
    }
  } finally { await verification.close(); await rm(container, { recursive: true, force: true }); }
});

nativeTest("trusted repository readers and cleanup do not execute project preloads", async () => {
  const work = await realpath(await mkdtemp(join(tmpdir(), "shiptorio-helper-")));
  let sandbox: Awaited<ReturnType<typeof checkSandbox>> | undefined;
  try {
    await Bun.write(join(work, "bunfig.toml"), 'preload = ["./preload.ts"]\n');
    await Bun.write(join(work, "preload.ts"), 'await Bun.write("preload-fired", "unexpected");');
    await Bun.write(join(work, "README.md"), "Source");
    sandbox = await checkSandbox(work);
    expect((await sandbox.run(["git", "init"])).code).toBe(0);
    await resetVerifyBase(sandbox, work);
    expect(await Bun.file(join(work, "preload-fired")).exists()).toBe(false);
    expect(await assemblerContext(sandbox, ["README.md"])).toEqual([{ path: "README.md", content: "Source" }]);
    expect(await snapshotApproved(sandbox, ["README.md"])).toEqual({ "README.md": Buffer.from("Source").toString("base64") });
    expect(await Bun.file(join(work, "preload-fired")).exists()).toBe(false);
    // Real repository execution still honors project configuration inside the sandbox.
    expect((await sandbox.run([process.execPath, "--no-env-file", "-e", "console.log('project')"])).code).toBe(0);
    expect(await Bun.file(join(work, "preload-fired")).exists()).toBe(true);
  } finally { await sandbox?.close(); await rm(work, { recursive: true, force: true }); }
});
