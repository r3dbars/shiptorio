import { Database } from "bun:sqlite";
import { readFileSync } from "node:fs";
const migration = readFileSync(new URL("../migrations/0006_encrypted_credentials.sql", import.meta.url), "utf8");

/** Run the production credential SQL against SQLite, instead of mirroring its behavior in a mock. */
export function credentialDB(original?: { prepare(sql: string): unknown }) {
  const sqlite = new Database(":memory:");
  sqlite.exec(migration);
  sqlite.exec("CREATE TABLE credential_test_repos (full_name TEXT, repo_id INTEGER, installation_id INTEGER); INSERT INTO credential_test_repos VALUES ('alice/shop', 501, 12), ('r3dbars/testing', 502, 1), ('example/shop', 503, 1), ('r3dbars/demo', 504, 1), ('owner/repo', 505, 1)");
  return {
    sqlite,
    prepare(sql: string): any {
      if (sql.startsWith("SELECT r.repo_id, r.installation_id FROM repos")) {
        let args: any[] = [];
        return { bind(...values: any[]) { args = values; return this; }, async first() { return sqlite.query("SELECT repo_id, installation_id FROM credential_test_repos WHERE full_name = ? AND installation_id = ?").get(...args); } };
      }
      if (sql.startsWith("SELECT r.full_name FROM repos")) {
        let args: any[] = [];
        return { bind(...values: any[]) { args = values; return this; }, async first() { return sqlite.query("SELECT full_name FROM credential_test_repos WHERE repo_id = ? AND installation_id = ?").get(...args); } };
      }
      if (!/\bcredentials\b/.test(sql)) return original!.prepare(sql);
      let values: any[] = [];
      const statement = {
        bind(...args: any[]) { values = args; return statement; },
        async first() { return sqlite.query(sql).get(...values); },
        async all() { return { results: sqlite.query(sql).all(...values) }; },
        async run() { const result = sqlite.query(sql).run(...values); return { success: true, meta: { changes: result.changes } }; },
      };
      return statement;
    },
  };
}
const databases = new WeakMap<object, ReturnType<typeof credentialDB>>();
export function credentialEnv<T>(env: T): T {
  const source = env as { DB: { prepare(sql: string): unknown } };
  if (!source.DB) return env; // Non-factory tests may exercise only storage-independent RPCs.
  let db = databases.get(source.DB);
  if (!db) { db = credentialDB(source.DB); databases.set(source.DB, db); }
  return new Proxy(env as object, { get(target, key, receiver) { return key === "DB" ? db : Reflect.get(target, key, receiver); } }) as T;
}
