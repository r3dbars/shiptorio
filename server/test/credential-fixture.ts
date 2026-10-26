import { Database } from "bun:sqlite";
import { readFileSync } from "node:fs";
const migration = readFileSync(new URL("../migrations/0006_encrypted_credentials.sql", import.meta.url), "utf8");

/** Run the production credential SQL against SQLite, instead of mirroring its behavior in a mock. */
export function credentialDB(original?: { prepare(sql: string): unknown }) {
  const sqlite = new Database(":memory:");
  sqlite.exec(migration);
  return {
    sqlite,
    prepare(sql: string): any {
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
  let db = databases.get(source.DB);
  if (!db) { db = credentialDB(source.DB); databases.set(source.DB, db); }
  return new Proxy(env as object, { get(target, key, receiver) { return key === "DB" ? db : Reflect.get(target, key, receiver); } }) as T;
}
