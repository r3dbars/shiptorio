import { Database } from "bun:sqlite";
import { readFileSync } from "node:fs";
/** Exercise the production reservation SQL using SQLite, as D1 does. */
export function budgetDb() {
  const sqlite = new Database(":memory:");
  sqlite.exec("CREATE TABLE installations(id INTEGER PRIMARY KEY, account_login TEXT); INSERT INTO installations VALUES(1, 'owner')");
  sqlite.exec(readFileSync(new URL("../migrations/0005_cost_guards.sql", import.meta.url), "utf8"));
  sqlite.exec("CREATE TABLE user_repos(repo TEXT, user_id INTEGER); INSERT INTO user_repos VALUES('owner/repo', 1)");
  const db = { prepare(sql: string) {
    const query = sqlite.query(sql);
    const statement = (values: any[]) => ({
      bind: (...args: any[]) => statement(args),
      first: async () => query.get(...values),
      all: async () => ({ results: query.all(...values) }),
      run: async () => query.run(...values),
    });
    return statement([]);
  } } as unknown as D1Database;
  return { db, sqlite };
}
export function sparkTestEnv() {
  return { META_API_KEY: "test", DB: budgetDb().db, budgetAccount: async () => "owner" };
}
