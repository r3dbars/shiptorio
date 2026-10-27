import { expect, test } from "bun:test";
import { configuration, configureSecrets, provision, resourceId, validate, type IO, type State } from "../scripts/selfhost";

const fresh = (): State => ({ name: "shiptorio-alice", account: "a".repeat(32), subdomain: "alice", login: "alice", secrets: [] });
const db = "12345678-1234-4234-8234-123456789012", kv = "b".repeat(32);
function harness() {
  const calls: { args: string[]; input?: string }[] = [];
  const saved: State[] = [];
  const io: IO = {
    wrangler: async (args, input) => {
      calls.push({ args, input });
      return args[0] === "d1" ? JSON.stringify({ database_id: db }) : `id = "${kv}"`;
    },
    save: async s => { saved.push(structuredClone(s)); },
    ask: async () => { throw new Error("Unexpected prompt"); }, log: () => {},
  };
  return { io, calls, saved };
}

test("self-host config contains only the owner's bindings and login, no production routes or repo pins", () => {
  const config = configuration({ ...fresh(), databaseId: db, namespaceId: kv });
  expect(config).toMatchObject({ account_id: "a".repeat(32), workers_dev: true, vars: { PUBLIC_URL: "https://shiptorio-alice.alice.workers.dev", ALLOWED_LOGINS: "alice", ADMIN_LOGINS: "alice" } });
  for (const forbidden of ["shiptorio.com", "r3dbars", "153f63dc", "routes", '"env"', "SENTRY_REPO", "POSTHOG_REPO"]) expect(JSON.stringify(config)).not.toContain(forbidden);
  for (const name of ["transcripted-feedback", "stack99-relay", "r3dbar-subscribe", "redbars", "../shiptorio", "shiptorio;echo x"]) expect(() => validate({ ...fresh(), name })).toThrow();
  expect(() => validate({ ...fresh(), account: "bad" })).toThrow();
  expect(() => validate({ ...fresh(), subdomain: "https://example.com" })).toThrow();
  expect(() => validate({ ...fresh(), login: "*" })).toThrow();
  expect(() => validate({ ...fresh(), namespaceId: "not-an-id" })).toThrow();
});

test("provision saves IDs immediately and resumes without creating duplicates", async () => {
  const { io, calls, saved } = harness(), state = fresh();
  await provision(state, io);
  expect(calls.map(c => c.args)).toEqual([
    ["d1", "create", "shiptorio-alice", "--update-config=false"],
    ["kv", "namespace", "create", "shiptorio-alice-cache", "--update-config=false"],
    ["d1", "migrations", "apply", "DB", "--remote"],
  ]);
  expect(saved[0].databaseId).toBe(db);
  expect(saved[0].namespaceId).toBeUndefined();
  expect(saved[1].namespaceId).toBe(kv);
  calls.length = 0;
  await provision(state, io);
  expect(calls.map(c => c.args)).toEqual([["d1", "migrations", "apply", "DB", "--remote"]]);
});

test("a KV failure preserves the D1 checkpoint and does not migrate or deploy", async () => {
  const { io, saved } = harness(), state = fresh(), real = io.wrangler;
  io.wrangler = async (...args) => { if (args[0][0] === "kv") throw new Error("Network down"); return real(...args); };
  await expect(provision(state, io)).rejects.toThrow("Network down");
  expect(saved).toHaveLength(1);
  expect(saved[0].databaseId).toBe(db);
});

test("generated secrets use stdin, progress contains only names, and resume never rotates keys", async () => {
  const { io, calls, saved } = harness(), state = fresh();
  await configureSecrets(state, io);
  expect(calls.map(c => c.args)).toEqual(["SESSION_SECRET", "CRED_MASTER_KEY", "APP_PASSWORD", "META_API_KEY"].map(k => ["secret", "put", k]));
  expect(calls[0].input).toMatch(/^[a-f0-9]{64}$/);
  expect(Buffer.from(calls[1].input!, "base64")).toHaveLength(32);
  expect(calls[2].input).toBeUndefined(); // Wrangler handles masked interactive entry.
  expect(JSON.stringify(saved)).not.toContain(calls[0].input!);
  calls.length = 0;
  await configureSecrets(state, io);
  expect(calls).toHaveLength(0);
});

test("failed secret upload is retried, while earlier generated secrets are retained", async () => {
  const { io } = harness(), state = fresh(), real = io.wrangler;
  io.wrangler = async (...args) => { if (args[0].includes("META_API_KEY")) throw new Error("Upload failed"); return real(...args); };
  await expect(configureSecrets(state, io)).rejects.toThrow("Upload failed");
  expect(state.secrets).toEqual(["SESSION_SECRET", "CRED_MASTER_KEY", "APP_PASSWORD"]);
});

test("Wrangler resource ID extraction supports JSON and TOML and fails closed on unrecognized output", () => {
  expect(resourceId(`database_id = "${db}"`, "d1")).toBe(db);
  expect(resourceId(`{"id":"${kv}"}`, "kv")).toBe(kv);
  expect(() => resourceId("created resource (no ID)", "d1")).toThrow();
});
