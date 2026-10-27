import { expect, test } from "bun:test";
import { mkdtempSync, mkdirSync, writeFileSync, symlinkSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { request } from "node:http";
import { gunzipSync } from "node:zlib";
// @ts-ignore Developer Node script is exercised through its real HTTP boundary.
import { benchmarkServer } from "../scripts/perf-server.mjs";

test("benchmark contains raw paths and symlinks while serving assets and SPA routes", async () => {
  const base = mkdtempSync(join(tmpdir(), "shiptorio-bench-"));
  const root = join(base, "dist"); mkdirSync(root); mkdirSync(join(base, "dist-private"));
  writeFileSync(join(root, "index.html"), "factory"); writeFileSync(join(root, "app.js"), "asset");
  writeFileSync(join(base, "private"), "must-not-leave-root");
  symlinkSync(join(base, "private"), join(root, "link"));
  symlinkSync(join(base, "dist-private"), join(root, "outside"));
  const server = benchmarkServer(root);
  await new Promise<void>(resolve => server.once("listening", resolve));
  const address = server.address();
  if (!address || typeof address === "string") throw Error("No listener");
  const get = (path: string) => new Promise<{status: number; body: string}>(resolve => {
    request({hostname: "127.0.0.1", port: address.port, path}, res => {
      const chunks: Buffer[] = [];
      res.on("data", chunk => chunks.push(chunk));
      res.on("end", () => { const bytes = Buffer.concat(chunks); resolve({status: res.statusCode!, body: (res.headers["content-encoding"] === "gzip" ? gunzipSync(bytes) : bytes).toString()}); });
    }).end();
  });
  try {
    expect(address.address).toBe("127.0.0.1");
    for (const path of ["/../private", "/%2e%2e/private", "/..%2fprivate", "/%2e%2e%2fprivate", "/../dist-private/private", "/link", "/outside/missing"]) {
      const result = await get(path); expect(result.status).toBe(403); expect(result.body).not.toContain("must-not-leave-root");
    }
    for (const path of ["/%", "/%00", "/%5c..%5cprivate"]) expect((await get(path)).status).toBe(400);
    expect(await get("/app.js?v=1")).toEqual({status: 200, body: "asset"});
    expect(await get("/nested/route")).toEqual({status: 200, body: "factory"});
    rmSync(join(root, "index.html")); symlinkSync(join(base, "private"), join(root, "index.html"));
    expect((await get("/missing")).status).toBe(403);
  } finally { await new Promise<void>(resolve => server.close(() => resolve())); rmSync(base, {recursive: true, force: true}); }
});
