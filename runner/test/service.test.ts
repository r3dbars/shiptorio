import { expect, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { pairingConfig } from "../src/service-config";

const config = (pairId: string, expires: number) => `SHIPTORIO_URL=https://shiptorio.com\nSHIPTORIO_RUNNER_TOKEN=${btoa(JSON.stringify({ repo: "r3dbars/shiptorio", pairId, expires }))}.test-signature\n`;
test("updating the service preserves renewed credentials but honors a new owner pairing", () => {
  const old = config("pair", 100), fresh = config("pair", 200);
  expect(pairingConfig(old, fresh)).toBe(fresh);
  expect(pairingConfig(config("new-pair", 150), fresh)).toBe(config("new-pair", 150));
  expect(pairingConfig(old, "broken")).toBe(old);
});
test("bundled background runner executes outside the repository with an explicit data root", async () => {
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
  } finally { await rm(directory, { recursive: true, force: true }); }
});
