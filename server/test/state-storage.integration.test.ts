import { expect, it } from "bun:test";

it("round-trips >128 Unicode chunks and rolls back a later batch in real local DO storage", async () => {
  // A separate Node process isolates Wrangler from the cloudflare:workers mocks used by unit tests.
  const child = Bun.spawn(["node", `${import.meta.dir}/fixtures/storage-batch/run.mjs`], {
    cwd: import.meta.dir, stdout: "pipe", stderr: "pipe", env: {...process.env, WRANGLER_SEND_METRICS: "false"},
  });
  const timeout = setTimeout(() => child.kill(), 25000);
  const [code, out, err] = await Promise.all([child.exited, new Response(child.stdout).text(), new Response(child.stderr).text()])
    .finally(() => clearTimeout(timeout));
  expect({code, output: code ? `${out}\n${err}` : "passed"}).toEqual({code: 0, output: "passed"});
  expect(out).toContain('"rollback":true');
}, 30000);
