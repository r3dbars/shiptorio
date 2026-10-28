import { expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import ts from "typescript";
import { assertFixtureConfig, FIXTURE, fixtureSecrets, inspectExistingFixture } from "./preflight";
import { probeStagingFixture } from "./probe";

const read = (path: string) => ts.parseConfigFileTextToJson(path, readFileSync(new URL(path, import.meta.url), "utf8")).config;
const configs = () => { const app = read("../../server/wrangler.jsonc"); return [app, app.env.staging, read("./wrangler.jsonc")] as const; };
test("committed staging deployment keeps production disabled and fixture storage/private entry isolated", () => {
  const [prod, stage, fixture] = configs();
  expect(() => assertFixtureConfig(prod, stage, fixture)).not.toThrow();
  const unsafe = [
    (p: any) => { p.vars.TEST_USERS = "on"; },
    (p: any) => { p.services = [{ binding: "TEST_FACTORY", service: FIXTURE.worker }]; },
    (_p: any, s: any) => { s.vars.PUBLIC_URL = "https://shiptorio.com"; },
    (_p: any, s: any) => { s.services[0].service = "shiptorio"; },
    (_p: any, _s: any, f: any) => { f.workers_dev = true; },
    (_p: any, _s: any, f: any) => { f.preview_urls = true; },
    (_p: any, _s: any, f: any) => { f.routes = ["shiptorio.dev/*"]; },
    (_p: any, _s: any, f: any) => { f.services = [{ binding: "OUT", service: "shiptorio" }]; },
    (p: any, _s: any, f: any) => { f.d1_databases[0].database_id = p.d1_databases[0].database_id; },
    (_p: any, s: any, f: any) => { f.kv_namespaces[0].id = s.kv_namespaces[0].id; },
    (_p: any, _s: any, f: any) => { f.vars.SESSION_SECRET = "never-a-var"; },
  ];
  for (const change of unsafe) { const c = structuredClone([prod, stage, fixture]); change(c[0], c[1], c[2]); expect(() => assertFixtureConfig(c[0], c[1], c[2])).toThrow(); }
});

function metadata(overrides: Record<string, unknown> = {}) {
  const calls: string[] = [];
  const send = (async (input: RequestInfo | URL, init?: RequestInit) => {
    expect(init?.method ?? "GET").toBe("GET");
    const path = new URL(String(input)).pathname.replace(/^\/client\/v4/, "").replace(/^\/accounts\/[a-f0-9]{32}\//, ""); calls.push(path);
    const result = Object.hasOwn(overrides, path) ? overrides[path] : path.startsWith("d1/") ? { uuid: FIXTURE.database, name: FIXTURE.worker }
      : path === "storage/kv/namespaces" ? [{ id: FIXTURE.kv, title: "shiptorio-fixture-cache" }]
      : path.endsWith("/subdomain") ? { enabled: false, previews_enabled: false }
      : path === "workers/domains" ? [{ hostname: "shiptorio.com", zone_id: "b".repeat(32), service: "shiptorio" }, { hostname: "shiptorio.dev", zone_id: "c".repeat(32), service: "shiptorio-staging" }]
      : path.startsWith("/zones/") ? []
      : { bindings: fixtureSecrets.map(name => ({ name, type: "secret_text" })) };
    return Response.json({ success: true, result });
  }) as unknown as typeof fetch;
  return { calls, send };
}
test("remote preflight reads only metadata and refuses missing resources, secrets and public entry", async () => {
  const good = metadata(); await inspectExistingFixture("a".repeat(32), "test-only-token", good.send); expect(good.calls).toHaveLength(8);
  for (const [path, value] of [
    [`d1/database/${FIXTURE.database}`, { uuid: "wrong", name: FIXTURE.worker }],
    ["storage/kv/namespaces", []],
    [`workers/scripts/${FIXTURE.worker}/settings`, { bindings: [] }],
    ["workers/scripts/shiptorio-staging/settings", { bindings: [{ name: "TEST_FACTORY_KEY", type: "plain_text" }] }],
    [`workers/scripts/${FIXTURE.worker}/subdomain`, { enabled: true, previews_enabled: false }],
    ["workers/domains", [{ service: FIXTURE.worker, hostname: "unexpected.example" }]],
    [`/zones/${"b".repeat(32)}/workers/routes`, [{ script: FIXTURE.worker }]],
  ] as const) await expect(inspectExistingFixture("a".repeat(32), "test-only-token", metadata({ [path]: value }).send)).rejects.toThrow();
});

test("signed staging probe keeps the preview gate and performs no install/reset/build/launch", async () => {
  const paths: string[] = [];
  const send = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(String(input)); expect(url.origin).toBe("https://shiptorio.dev"); paths.push(url.pathname);
    expect(init?.redirect).toBe("manual");
    if (url.pathname === "/access") { expect(init?.method).toBe("POST"); return new Response(null, { status: 303, headers: { "set-cookie": "shiptorio_access=fixture; HttpOnly" } }); }
    expect(init?.method ?? "GET").toBe("GET");
    if (url.pathname === "/test/login") return new Response(null, { status: 303, headers: { "set-cookie": "shiptorio_session=fixture; HttpOnly" } });
    if (url.pathname === "/test/install") return new Response('<form action="/test/install?confirm=1">');
    return init?.headers ? Response.json({ login: "test-newbie", admin: false, guest: false }) : new Response(null, { status: 401 });
  }) as unknown as typeof fetch;
  await probeStagingFixture("fixture-password", send);
  expect(paths).toEqual(["/api/me", "/access", "/test/login", "/api/me", "/test/install"]);
  const missing = (async () => new Response(null, { status: 503 })) as unknown as typeof fetch;
  await expect(probeStagingFixture("fixture-password", missing)).rejects.toThrow("preview gate");
  await expect(probeStagingFixture("private-canary", (async () => { throw Error("private-canary"); }) as unknown as typeof fetch)).rejects.toThrow("credentials were not logged");
});

test("staging workflow validates existing resources before writes and bot secrets stay on trusted dev source", () => {
  const parse = (file: string) => Bun.YAML.parse(readFileSync(new URL(file, import.meta.url), "utf8")) as any;
  const workflow = parse("../../.github/workflows/staging.yml");
  expect(workflow.jobs.deploy.if).toContain("github.ref == 'refs/heads/dev'");
  const steps = workflow.jobs.deploy.steps as { name?: string; run?: string }[];
  const preflight = steps.findIndex(s => s.run === "bun playtest/staging/preflight.ts");
  const fixture = steps.findIndex(s => s.name === "Update existing private fixture");
  const staging = steps.findIndex(s => s.name === "Deploy isolated staging");
  expect(preflight).toBeGreaterThan(-1); expect(fixture).toBeGreaterThan(preflight); expect(staging).toBeGreaterThan(fixture);
  expect(steps[fixture].run).toContain("--config playtest/staging/wrangler.jsonc");
  expect(steps.map(s => s.run ?? "").join("\n")).not.toMatch(/\b(?:create|secret\s+(?:put|bulk))\b/);
  const bot = parse("../../.github/workflows/playtest-bot.yml");
  expect(bot.on.workflow_dispatch.inputs.verify_staging.default).toBe(false);
  expect(bot.jobs.staging.if).toContain("github.ref == 'refs/heads/dev'");
  expect(bot.jobs.staging.if).toContain("vars.TEST_USERS_STAGING_READY == 'true'");
  expect(bot.jobs.staging.steps[0].with).toMatchObject({ ref: "dev", "persist-credentials": false });
  expect(bot.on).not.toHaveProperty("pull_request");
});
