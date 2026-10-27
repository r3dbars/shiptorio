import { expect, test } from "bun:test";
import { copyFile, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { nativePrerequisite } from "./native-prerequisite";

const linux = { platform: "linux", ci: false, nested: false, bwrap: true, git: true };

test("native prerequisites report absent local tools and never turn missing CI coverage green", () => {
  for (const missing of [{ bwrap: false }, { git: false }, { bwrap: false, git: false }]) {
    expect(nativePrerequisite({ ...linux, ...missing })).toMatchObject({ skip: true, reason: expect.stringContaining("NOT executed") });
    for (const nested of [false, true]) {
      expect(() => nativePrerequisite({ ...linux, ...missing, ci: true, nested })).toThrow("Mandatory real Linux boundary coverage");
    }
  }
  expect(nativePrerequisite(linux)).toEqual({ skip: false });
  expect(nativePrerequisite({ ...linux, ci: true })).toEqual({ skip: false });
  expect(nativePrerequisite({ ...linux, nested: true })).toEqual({ skip: true });
  // Preserve real Seatbelt execution even without Linux-only tools on macOS.
  expect(nativePrerequisite({ ...linux, platform: "darwin", ci: true, bwrap: false })).toEqual({ skip: false });
});

test("native fixture imports explicitly report local omissions and fail CI before tests can skip", async () => {
  const directory = await mkdtemp(join(tmpdir(), "shiptorio native fixture é 雪 "));
  try {
    const helper = join(directory, "native-prerequisite.ts");
    await copyFile(new URL("./native-prerequisite.ts", import.meta.url), helper);
    for (const ci of [false, true]) {
      const child = Bun.spawn([process.execPath, "-e", `
      Object.defineProperty(process, 'platform', { value: 'linux' });
      Bun.which = () => null;
      ${ci ? "process.env.CI = 'true'" : "delete process.env.CI"};
      process.env.SHIPTORIO_CHECK_SANDBOX = '1';
      await import(${JSON.stringify(pathToFileURL(helper).href)});
    `], { stdout: "pipe", stderr: "pipe" });
      const [code, stderr] = await Promise.all([child.exited, new Response(child.stderr).text()]);
      expect(code === 0).toBe(!ci);
      expect(stderr).toContain(ci ? "Mandatory real Linux boundary coverage" : "LOCAL PREREQUISITE SKIP");
    }
  } finally { await rm(directory, { recursive: true, force: true }); }
});
