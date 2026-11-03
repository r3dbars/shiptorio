import { expect, test } from "bun:test";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { pairingConfig, serviceConnectionOrigin } from "../src/service-config";

const config = (pairId: string, expires: number) => `SHIPTORIO_URL=https://shiptorio.com\nSHIPTORIO_RUNNER_TOKEN=${btoa(JSON.stringify({ repo: "r3dbars/shiptorio", pairId, expires }))}.test-signature\n`;
test("updating the service preserves renewed credentials but honors a new owner pairing", () => {
  const old = config("pair", 100), fresh = config("pair", 200);
  expect(pairingConfig(old, fresh)).toBe(fresh);
  expect(pairingConfig(config("new-pair", 150), fresh)).toBe(config("new-pair", 150));
  expect(pairingConfig(old, "broken")).toBe(old);
});
test.skipIf(process.env.SHIPTORIO_CHECK_SANDBOX === "1")("bundled background runner executes outside the repository with an explicit data root", async () => {
  const directory = await mkdtemp(resolve(tmpdir(), "shiptorio-runtime-"));
  try {
    const result = await Bun.build({ entrypoints: [resolve(import.meta.dir, "../src/cli.ts")], outdir: directory, target: "bun", naming: "runner.mjs" });
    expect(result.success).toBe(true);
    const root = resolve(directory, "private data");
    const p = Bun.spawn([process.execPath, resolve(directory, "runner.mjs"), "paths"], { cwd: directory, env: { PATH: "/usr/bin:/bin", HOME: directory, SHIPTORIO_RUNNER_ROOT: root }, stdout: "pipe", stderr: "pipe" });
    const [out, err, code] = await Promise.all([new Response(p.stdout).text(), new Response(p.stderr).text(), p.exited]);
    expect(err).toBe("");
    expect(code).toBe(0);
    expect(JSON.parse(out).root).toBe(root);
    const bin = resolve(directory, "bin");
    await mkdir(bin);
    for (const name of ["codex", "claude"]) await writeFile(resolve(bin, name), "#!/bin/sh\nexit 0\n", { mode: 0o700 });
    const onlyCodex = Bun.spawn([process.execPath, resolve(directory, "runner.mjs"), "paths", "--codex-only"], {
      cwd: directory, env: { PATH: `${bin}:/usr/bin:/bin`, HOME: directory, SHIPTORIO_RUNNER_ROOT: root }, stdout: "pipe", stderr: "pipe",
    });
    const selected = JSON.parse(await new Response(onlyCodex.stdout).text());
    expect(await onlyCodex.exited).toBe(0);
    expect(selected.harnesses).toEqual(["codex"]); // Even when Claude is installed, it cannot trigger sign-in prompts or claim jobs.
  } finally { await rm(directory, { recursive: true, force: true }); }
});


test("service resolves effective installed/workspace URL before importing any grant", () => {
  const installed = "SHIPTORIO_URL=https://shiptorio.dev\n";
  const workspace = "SHIPTORIO_URL=https://selfhost.example\n";
  expect(serviceConnectionOrigin(installed)).toBe("https://shiptorio.dev");
  expect(serviceConnectionOrigin(pairingConfig(workspace, installed))).toBe("https://selfhost.example");
  expect(() => serviceConnectionOrigin(installed, "https://shiptorio.com")).toThrow("another Shiptorio server");
  expect(serviceConnectionOrigin("", "https://shiptorio.com")).toBe("https://shiptorio.com");
  expect(serviceConnectionOrigin('SHIPTORIO_URL="https://shiptorio.dev"')).toBe("https://shiptorio.dev");
  for (const value of ["$SERVER", "https://shiptorio.com # trailing", "https://one.example\nSHIPTORIO_URL=https://two.example"]) {
    expect(() => serviceConnectionOrigin(`SHIPTORIO_URL=${value}`)).toThrow();
  }
});
