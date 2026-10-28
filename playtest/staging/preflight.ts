import assert from "node:assert/strict";

export const FIXTURE = { worker: "shiptorio-fixture", database: "bec7a5ae-817f-449f-926d-85eb2dc7cb65", kv: "8add9e00be2745c793bd2bd77cfc0b9a" };
export const fixtureSecrets = ["SESSION_SECRET", "APP_PASSWORD", "TEST_FACTORY_KEY", "GITHUB_WEBHOOK_SECRET", "GITHUB_APP_PRIVATE_KEY", "GITHUB_CLIENT_SECRET", "META_API_KEY"];
type Config = { name?: string; vars?: Record<string, unknown>; services?: { binding: string; service: string }[]; workers_dev?: boolean; preview_urls?: boolean; routes?: unknown[]; d1_databases?: { binding: string; database_id: string; database_name: string }[]; kv_namespaces?: { binding: string; id: string }[] };
export function assertFixtureConfig(production: Config, staging: Config, fixture: Config) {
  assert(production.name === "shiptorio" && production.vars?.PUBLIC_URL === "https://shiptorio.com", "Unexpected production target");
  assert(!Object.hasOwn(production.vars ?? {}, "TEST_USERS") && !production.services?.some(s => s.binding === "TEST_FACTORY"), "Production cannot enable testers");
  assert(staging.name === "shiptorio-staging" && staging.vars?.PUBLIC_URL === "https://shiptorio.dev" && staging.vars.TEST_USERS === "on", "Unexpected tester frontend");
  assert(staging.services?.filter(s => s.binding === "TEST_FACTORY" && s.service === FIXTURE.worker).length === 1 && staging.services.filter(s => s.binding === "TEST_FACTORY").length === 1, "Unexpected fixture service");
  assert(fixture.name === FIXTURE.worker && fixture.vars?.FIXTURE_INSTANCE === FIXTURE.worker && fixture.vars.PUBLIC_URL === "https://shiptorio.dev" && fixture.vars.TEST_USERS === "on", "Unexpected private fixture target");
  assert(fixture.workers_dev === false && fixture.preview_urls === false && fixture.routes?.length === 0 && !fixture.services?.length, "Fixture must have no public or outbound service bindings");
  assert(fixture.vars.ADMIN_LOGINS === "" && fixture.vars.ALLOWED_LOGINS === "", "Fixture cannot admit normal accounts");
  assert(fixtureSecrets.every(key => !Object.hasOwn(fixture.vars!, key)), "Fixture credentials must remain secrets");
  assert(fixture.d1_databases?.length === 1 && fixture.d1_databases[0].binding === "DB" && fixture.d1_databases[0].database_id === FIXTURE.database && fixture.d1_databases[0].database_name === FIXTURE.worker, "Unexpected fixture database");
  assert(fixture.kv_namespaces?.length === 1 && fixture.kv_namespaces[0].binding === "CACHE" && fixture.kv_namespaces[0].id === FIXTURE.kv, "Unexpected fixture cache");
  for (const config of [production, staging]) {
    assert(!config.d1_databases?.some(d => d.database_id === FIXTURE.database) && !config.kv_namespaces?.some(k => k.id === FIXTURE.kv), "Fixture overlaps application storage");
  }
}

/** Metadata only: never create resources, retrieve secret values or log API bodies. */
export async function inspectExistingFixture(account: string, token: string, send: typeof fetch = fetch) {
  assert(/^[a-f0-9]{32}$/.test(account) && token, "Cloudflare deployment credentials unavailable");
  const get = async (path: string, label: string): Promise<any> => {
    let response: Response;
    try { response = await send(`https://api.cloudflare.com/client/v4/accounts/${account}/${path}`, { headers: { authorization: `Bearer ${token}` } }); }
    catch { throw new Error(`Fixture preflight ${label}: metadata request failed`); }
    assert(response.ok, `Fixture preflight ${label}: HTTP ${response.status}`);
    let body: { success?: boolean; result?: unknown };
    try { body = await response.json(); } catch { throw new Error(`Fixture preflight ${label}: invalid metadata`); }
    assert(body.success === true, `Fixture preflight ${label}: metadata denied`);
    return body.result;
  };
  const database = await get(`d1/database/${FIXTURE.database}`, "database");
  assert(database?.uuid === FIXTURE.database && database.name === FIXTURE.worker, "Existing fixture database mismatch");
  const namespaces = await get("storage/kv/namespaces?per_page=1000", "cache");
  assert(Array.isArray(namespaces) && namespaces.some(k => k.id === FIXTURE.kv && k.title === "shiptorio-fixture-cache"), "Existing fixture cache missing or renamed");
  for (const [worker, required] of [[FIXTURE.worker, fixtureSecrets], ["shiptorio-staging", ["SESSION_SECRET", "APP_PASSWORD", "TEST_FACTORY_KEY"]]] as const) {
    const settings = await get(`workers/scripts/${worker}/settings`, worker);
    const names = new Set((settings?.bindings ?? []).filter((b: any) => b.type === "secret_text").map((b: any) => b.name));
    assert(required.every(name => names.has(name)), `Fixture preflight ${worker}: required secret names missing; provision securely before deployment`);
  }
  const exposure = await get(`workers/scripts/${FIXTURE.worker}/subdomain`, "private entry");
  assert(exposure?.enabled === false && exposure.previews_enabled === false, "Existing fixture has public subdomain access");
}

if (import.meta.main) {
  const { createRequire } = await import("node:module");
  const require = createRequire(new URL("../../server/package.json", import.meta.url));
  const { unstable_readConfig: read } = require("wrangler");
  const app = new URL("../../server/wrangler.jsonc", import.meta.url).pathname;
  assertFixtureConfig(read({ config: app }), read({ config: app, env: "staging" }), read({ config: new URL("wrangler.jsonc", import.meta.url).pathname }));
  await inspectExistingFixture(process.env.CLOUDFLARE_ACCOUNT_ID ?? "", process.env.CLOUDFLARE_API_TOKEN ?? "");
  console.log("Existing private fixture resources and required secret names verified; no resources or credentials created.");
}
