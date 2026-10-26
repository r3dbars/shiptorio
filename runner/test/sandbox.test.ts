import { expect, test } from "bun:test";
import { mkdtemp, mkdir, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { checkSandbox } from "../src/sandbox";

test.skipIf(process.platform === "darwin")("unsupported verification platforms fail closed", async () => {
  await expect(checkSandbox(process.cwd())).rejects.toThrow("no configured OS sandbox");
});

test.skipIf(process.platform !== "darwin")("real OS sandbox blocks malicious tests and descendants from host files, credentials, writes and network", async () => {
  const root = await mkdtemp(join(tmpdir(), "shiptorio-isolation-test-"));
  const work = join(root, "checkout"); await mkdir(work);
  const canary = join(root, "host-secret"), outside = join(root, "outside-write");
  await Bun.write(canary, "fake-host-canary-do-not-read");
  let requests = 0;
  const server = Bun.serve({ port: 0, fetch() { requests++; return new Response("outside"); } });
  const saved = process.env.SHIPTORIO_RUNNER_TOKEN;
  process.env.SHIPTORIO_RUNNER_TOKEN = "fake-parent-credential";
  const sandbox = await checkSandbox(work);
  try {
    await Bun.write(join(work, "attack.test.ts"), `
import {test,expect} from "bun:test";
import {readFileSync,writeFileSync,symlinkSync,linkSync} from "node:fs";
test("host isolation",async()=>{
 expect(process.env.SHIPTORIO_RUNNER_TOKEN).toBeUndefined();
 expect(process.env.GITHUB_TOKEN).toBeUndefined();
 expect(process.env.CODEX_HOME).toBeUndefined();
 expect(process.env.HOME).not.toBe(${JSON.stringify(process.env.HOME)});
 expect(()=>readFileSync(${JSON.stringify(canary)},"utf8")).toThrow();
 expect(()=>writeFileSync(${JSON.stringify(outside)},"escaped")).toThrow();
 symlinkSync(${JSON.stringify(canary)},"link-secret");
 expect(()=>readFileSync("link-secret","utf8")).toThrow();
 expect(()=>linkSync(${JSON.stringify(canary)},"hardlink-secret")).toThrow();
 const child=Bun.spawn([process.execPath,"-e",${JSON.stringify(`import {readFileSync} from "node:fs";readFileSync(${JSON.stringify(canary)},"utf8")`)}],{stdout:"pipe",stderr:"pipe"});
 expect(await child.exited).not.toBe(0);
 await expect(fetch(${JSON.stringify(`http://127.0.0.1:${server.port}`)},{signal:AbortSignal.timeout(1000)})).rejects.toThrow();
 writeFileSync("allowed.txt","inside");
});`);
    const result = await sandbox.run([process.execPath, "test", "./attack.test.ts"]);
    expect(result.code).toBe(0);
    expect(result.err + result.out).toContain("1 pass");
    expect(result.err + result.out).not.toContain("fake-host-canary-do-not-read");
    expect(await readFile(join(work, "allowed.txt"), "utf8")).toBe("inside");
    expect(await Bun.file(outside).exists()).toBe(false);
    expect(requests).toBe(0);
    const git = await sandbox.run(["git", "init", "--initial-branch=main"]);
    expect(git.code).toBe(0);
    expect((await sandbox.run(["git", "status", "--short"])).code).toBe(0);
    const nested = await sandbox.run([process.execPath, "-e", `const p=Bun.spawn([process.execPath,"-e","console.log('nested-ok')"],{stdout:'inherit',stderr:'inherit'});process.exit(await p.exited)`]);
    expect(nested.code).toBe(0); expect(nested.out).toContain("nested-ok");
    await expect(sandbox.run([process.execPath, "run", "test"], work, { install: true })).rejects.toThrow("Only frozen dependency");
  } finally {
    if (saved === undefined) delete process.env.SHIPTORIO_RUNNER_TOKEN; else process.env.SHIPTORIO_RUNNER_TOKEN = saved;
    server.stop(true); await sandbox.close(); await rm(root, { recursive: true, force: true });
  }
}, 15000);
