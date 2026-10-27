import { nativeBoundary } from "./native-prerequisite";
import { expect, test } from "bun:test";
import { mkdtemp, mkdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { checkSandbox } from "../src/sandbox";
test.skipIf(process.platform !== "linux" || nativeBoundary.skip)("Linux sandbox isolates host files, credentials, descendants and network", async () => {
  const root = await mkdtemp(join(tmpdir(), "shiptorio-linux-test-")), work = join(root, "work"); await mkdir(work);
  const secret = join(root, "host-secret"); await Bun.write(secret, "private-canary");
  const server = Bun.serve({ port: 0, fetch: () => new Response("outside") });
  const saved = process.env.SHIPTORIO_RUNNER_TOKEN; process.env.SHIPTORIO_RUNNER_TOKEN = "secret";
  let sandbox: Awaited<ReturnType<typeof checkSandbox>> | undefined;
  try {
    sandbox = await checkSandbox(work);
    const attack = `import {readFileSync,writeFileSync} from "node:fs";
if(process.env.SHIPTORIO_RUNNER_TOKEN)throw Error("credential leaked");
try{readFileSync(${JSON.stringify(secret)});throw Error("host readable")}catch(e){if(e.message==="host readable")throw e}
try{writeFileSync(${JSON.stringify(join(root, "escaped"))},"escape")}catch{} // A private tmpfs may accept this path; the host file must stay absent below.
try{await fetch("http://127.0.0.1:${server.port}",{signal:AbortSignal.timeout(500)});throw Error("network open")}catch(e){if(e.message==="network open")throw e}
const child=Bun.spawn([process.execPath,"-e",${JSON.stringify(`require("node:fs").readFileSync(${JSON.stringify(secret)})`)}],{stdout:"ignore",stderr:"ignore"});
if(await child.exited===0)throw Error("child escaped");writeFileSync("allowed","ok");console.log("isolated");`;
    const result = await sandbox.run([process.execPath, "-e", attack]);
    expect(result.code, result.err).toBe(0); expect(result.out).toContain("isolated");
    expect(await Bun.file(join(work, "allowed")).text()).toBe("ok");
    expect(await Bun.file(join(root, "escaped")).exists()).toBe(false);
    expect((await sandbox.run(["git", "init", "--initial-branch=main"])).code).toBe(0);
    await expect(sandbox.run([process.execPath, "run", "test"], work, { install: true })).rejects.toThrow("Only frozen dependency");
  } finally { if (saved === undefined) delete process.env.SHIPTORIO_RUNNER_TOKEN; else process.env.SHIPTORIO_RUNNER_TOKEN = saved; server.stop(true); await sandbox?.close(); await rm(root, { recursive: true, force: true }); }
});
