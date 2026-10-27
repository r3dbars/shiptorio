import { expect, test } from "bun:test";
import { mkdtemp, mkdir, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { checkSandbox } from "../src/sandbox";

test.skipIf(process.platform === "darwin" || process.platform === "linux")("unsupported verification platforms fail closed", async () => {
  await expect(checkSandbox(process.cwd())).rejects.toThrow("no configured OS sandbox");
});

test.skipIf(process.platform !== "darwin" || process.env.SHIPTORIO_CHECK_SANDBOX === "1")("real OS sandbox blocks malicious tests and descendants from host files, credentials, writes and network", async () => {
  const root = await mkdtemp(join(tmpdir(), "shiptorio-isolation-test-"));
  const work = join(root, "checkout"); await mkdir(work);
  const canary = join(root, "host-secret"), outside = join(root, "outside-write");
  await Bun.write(canary, "fake-host-canary-do-not-read");
  let requests = 0;
  const server = Bun.serve({ port: 0, fetch() { requests++; return new Response("outside"); } });
  const outsideProcess = Bun.spawn([process.execPath, "-e", "setInterval(()=>{},1000)"], { env: { SHIPTORIO_RUNNER_TOKEN: "fake-sibling-credential" }, stdout: "ignore", stderr: "ignore" });
  const saved = process.env.SHIPTORIO_RUNNER_TOKEN;
  process.env.SHIPTORIO_RUNNER_TOKEN = "fake-parent-credential";
  const sandbox = await checkSandbox(work);
  try {
    await Bun.write(join(work, "attack.test.ts"), `
import {test,expect} from "bun:test";
import {readFileSync,writeFileSync,symlinkSync,linkSync} from "node:fs";
import {dlopen,ptr} from "bun:ffi";
test("host isolation",async()=>{
 const localDate = new Date(2026, 9, 26, 9);
 expect(Number.isFinite(localDate.getTime())).toBe(true);
 expect([localDate.getFullYear(), localDate.getMonth(), localDate.getDate(), localDate.getHours()]).toEqual([2026, 9, 26, 9]);
 expect(process.env.SHIPTORIO_RUNNER_TOKEN).toBeUndefined();
 expect(process.env.GITHUB_TOKEN).toBeUndefined();
 expect(process.env.CODEX_HOME).toBeUndefined();
 expect(process.env.CLAUDE_CONFIG_DIR).toBeUndefined();
 const lib=dlopen("/usr/lib/libSystem.B.dylib",{sysctl:{args:["ptr","u32","ptr","ptr","ptr","u64"],returns:"i32"}});
 const mib=new Int32Array([1,49,${outsideProcess.pid}]);const size=new BigUint64Array([1048576n]);const data=Buffer.alloc(1048576);
 const status=lib.symbols.sysctl(ptr(mib),3,ptr(data),ptr(size),null,0);
 expect(data.includes("fake-sibling-credential")).toBe(false);
 expect(status).not.toBe(0);
 expect(()=>process.kill(${outsideProcess.pid},"SIGTERM")).toThrow();
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
    if (result.code) throw new Error(`OS probe failed: ${result.err.slice(-4000)}`);
    expect(result.code).toBe(0);
    expect(result.err + result.out).toContain("1 pass");
    expect(result.err + result.out).not.toContain("fake-host-canary-do-not-read");
    expect(await readFile(join(work, "allowed.txt"), "utf8")).toBe("inside");
    expect(await Bun.file(outside).exists()).toBe(false);
    expect(requests).toBe(0);
    expect(outsideProcess.exitCode).toBeNull();
    const git = await sandbox.run(["git", "init", "--initial-branch=main"]);
    expect(git.code).toBe(0);
    expect((await sandbox.run(["git", "status", "--short"])).code).toBe(0);
    const nested = await sandbox.run([process.execPath, "-e", `const p=Bun.spawn([process.execPath,"-e","console.log('nested-ok')"],{stdout:'inherit',stderr:'inherit'});process.exit(await p.exited)`]);
    expect(nested.code).toBe(0); expect(nested.out).toContain("nested-ok");
    await expect(sandbox.run([process.execPath, "run", "test"], work, { install: true })).rejects.toThrow("Only frozen dependency");
  } finally {
    if (saved === undefined) delete process.env.SHIPTORIO_RUNNER_TOKEN; else process.env.SHIPTORIO_RUNNER_TOKEN = saved;
    outsideProcess.kill();
    server.stop(true); await sandbox.close(); await rm(root, { recursive: true, force: true });
  }
}, 15000);

test.skipIf(process.platform !== "darwin" || process.env.SHIPTORIO_CHECK_SANDBOX === "1")("agent boundary exposes only its dedicated auth home and kills descendants", async () => {
  const root = await mkdtemp(join(tmpdir(), "shiptorio-agent-test-"));
  const work = join(root, "job"), home = join(root, "auth"), secret = join(root, "host-secret");
  await mkdir(work); await mkdir(home);
  await Bun.write(secret, "host-canary"); await Bun.write(join(home, "auth.json"), "dedicated-login");
  const sandbox = await checkSandbox(work, { home, executable: process.execPath });
  try {
    const result = await sandbox.run([process.execPath, "-e", `
      import {readFileSync,writeFileSync} from "node:fs";
      if(readFileSync(process.env.HOME+"/auth.json","utf8")!=="dedicated-login")throw Error("auth missing");
      for(const p of [${JSON.stringify(secret)},${JSON.stringify(join(process.env.HOME!, ".ssh/id_rsa"))}]){try{readFileSync(p);process.exit(9)}catch{}}
      if(process.env.SSH_AUTH_SOCK||process.env.SHIPTORIO_RUNNER_TOKEN||process.env.AWS_SECRET_ACCESS_KEY)process.exit(8);
      try{writeFileSync(${JSON.stringify(join(root, "escaped"))},"bad");process.exit(7)}catch{}
      const p=Bun.spawn([process.execPath,"-e","setTimeout(()=>Bun.write('descendant-marker','bad'),500)"],{stdout:"ignore",stderr:"ignore"});
      console.log("agent-boundary-ok"); process.exit(0);
    `]);
    expect(result.code).toBe(0); expect(result.out).toContain("agent-boundary-ok");
    await Bun.sleep(650);
    expect(await Bun.file(join(work, "descendant-marker")).exists()).toBe(false);
    await expect(sandbox.run([process.execPath, "-e", ""], root)).rejects.toThrow("escapes");
    const timed = await sandbox.run([process.execPath, "-e", "setInterval(()=>{},1000)"], work, { timeout: 30 });
    expect(timed.timedOut).toBe(true); expect(timed.code).not.toBe(0);
  } finally { await sandbox.close(); await rm(root, { recursive: true, force: true }); }
});
