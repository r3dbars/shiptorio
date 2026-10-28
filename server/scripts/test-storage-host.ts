// Host integration needs workerd's local TCP listener. Runner unit checks stay offline.
// CI check, Deploy and Staging require this command separately; never skip on bind failure.
import assert from "node:assert/strict";

const child = Bun.spawn(["node", `${import.meta.dir}/../test/fixtures/storage-batch/run.mjs`], {
  cwd: import.meta.dir, stdout: "pipe", stderr: "pipe", detached: true,
  env: {...process.env, WRANGLER_SEND_METRICS: "false"},
});
const stop = () => { try { process.kill(-child.pid, "SIGKILL"); } catch { /* Process group already exited. */ } };
let timedOut = false;
const timeout = setTimeout(() => { timedOut = true; stop(); }, 25000);
try {
  const [code, out, err] = await Promise.all([child.exited, new Response(child.stdout).text(), new Response(child.stderr).text()]);
  assert(!timedOut, "Storage host integration exceeded 25 seconds");
  assert.equal(code, 0, `Storage host integration failed\n${out}\n${err}`);
  // Require the real worker's receipt: a zero-test/no-output invocation cannot pass.
  const receipt = JSON.parse(out.trim().split("\n").at(-1)!);
  assert(receipt.chunks > 128);
  assert.deepEqual(receipt, {chunks: receipt.chunks, rollback: true, unicode: true, shrink: true, expiredMarkers: 257});
  console.log(`Storage host integration: 1 test passed (${receipt.chunks} Unicode chunks, rollback, shrink, retention)`);
} finally { clearTimeout(timeout); stop(); }
