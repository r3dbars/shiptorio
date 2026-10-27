// Actual Worker/D1/DO plus the same fail-closed GitHub and Spark stubs as Stranger E2E.
import { execFileSync } from "node:child_process";
import { generateKeyPairSync, randomBytes } from "node:crypto";
import { mkdtempSync, readdirSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { githubStub } from "../stranger/github-stub.mjs";
import { sparkStub } from "../stranger/spark-stub.mjs";
export async function localFactory(persona, origin) {
  const root = resolve(import.meta.dirname, "../.."), server = join(root, "server");
  const require = createRequire(join(server, "package.json"));
  const wrangler = require("wrangler");
  const { Miniflare, convertV4MiniflareOptions } = createRequire(require.resolve("wrangler"))("miniflare");
  const bundle = mkdtempSync(join(tmpdir(), "shiptorio-bot-"));
  execFileSync("npx", ["wrangler", "deploy", "../playtest/bot/worker.ts", "--config", "wrangler.jsonc", "--dry-run", "--outdir", bundle], { cwd: server, stdio: "ignore" });
  const { workerOptions } = wrangler.unstable_getMiniflareWorkerOptions(join(server, "wrangler.jsonc"));
  const { compatibilityDate, compatibilityFlags, kvNamespaces, d1Databases, durableObjects, assets } = workerOptions;
  const key = randomBytes(32).toString("hex"), hook = "bot-fixture-hook";
  const { privateKey } = generateKeyPairSync("rsa", { modulusLength: 2048, privateKeyEncoding: { type: "pkcs8", format: "pem" }, publicKeyEncoding: { type: "spki", format: "pem" } });
  let mf;
  const stub = githubStub({ origin, webhookSecret: hook, worker: (url, init) => mf.dispatchFetch(url, init) });
  const index = ["test-newbie", "test-guest", "test-midgame", "test-broke", "test-blocked"].indexOf(persona);
  stub.state.user = { id: -9001 - index, login: persona, name: persona, avatar_url: null };
  stub.state.repo = `test-fixture/${persona}`;
  stub.state.repoId = 990000 + Math.abs(stub.state.user.id);
  const spark = sparkStub();
  const bindings = { PUBLIC_URL: origin, TEST_USERS: "on", TEST_FACTORY_KEY: key, ALLOWED_LOGINS: persona,
    SESSION_SECRET: "isolated-bot-session", APP_PASSWORD: "isolated-bot-preview", GITHUB_APP_ID: "1", GITHUB_APP_PRIVATE_KEY: privateKey,
    GITHUB_CLIENT_ID: "Iv1.stub", GITHUB_CLIENT_SECRET: "stub-client-secret", GITHUB_WEBHOOK_SECRET: hook, GITHUB_APP_SLUG: "shiptorio-stub",
    META_API_KEY: "stub-meta-key", SPARK_DAILY_TOKENS: "5000000" };
  mf = new Miniflare(convertV4MiniflareOptions({ port: Number(new URL(origin).port), workers: [{ compatibilityDate, compatibilityFlags, kvNamespaces, d1Databases, durableObjects, assets,
    name: "shiptorio", rootPath: bundle, modules: true, scriptPath: join(bundle, "worker.js"), bindings,
    serviceBindings: { TEST_FACTORY: request => {
      const headers = new Headers(request.headers); headers.set("x-shiptorio-test-hop", key);
      return mf.dispatchFetch(new Request(request, { headers }));
    } },
    outboundService: request => new URL(request.url).host === "api.meta.ai" ? spark.outbound(request) : stub.outbound(request),
  }] }));
  await mf.ready;
  const db = await mf.getD1Database("DB");
  for (const file of readdirSync(join(server, "migrations")).filter(f => f.endsWith(".sql")).sort()) {
    const sql = wrangler.unstable_splitSqlQuery(readFileSync(join(server, "migrations", file), "utf8")).filter(s => s.trim());
    await db.batch(sql.map(s => db.prepare(s)));
  }
  return { stub, dispose: () => mf.dispose(), async seed() {
    if (["test-newbie", "test-guest"].includes(persona)) return;
    stub.state.installation = 9000 + Math.abs(stub.state.user.id);
    const r = await mf.dispatchFetch(`${origin}/_bot/seed`, { method: "POST", headers: { "x-shiptorio-test-hop": key, "content-type": "application/json" }, body: JSON.stringify({ persona, repo: stub.state.repo, installationId: stub.state.installation, repoId: stub.state.repoId }) });
    if (!r.ok) throw new Error(`Fixture seed failed: ${r.status}`);
  } };
}
