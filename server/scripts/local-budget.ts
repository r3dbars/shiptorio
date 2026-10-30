// Standalone Spark smoke checks use a persistent local ledger; hosted calls always use D1.
import { Database } from "bun:sqlite";
import { mkdirSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import type { SparkEnv } from "../src/spark";
export function localBudget(): Pick<SparkEnv, "DB" | "budgetAccount"> {
  const dir = join(homedir(), ".cache", "shiptorio");
  mkdirSync(dir, { recursive: true, mode: 0o700 });
  const db = new Database(join(dir, "spark-check.sqlite"));
  db.exec("CREATE TABLE IF NOT EXISTS spark_usage(account TEXT, day TEXT, calls INTEGER DEFAULT 0, tokens INTEGER DEFAULT 0, PRIMARY KEY(account, day))");
  db.exec("CREATE TABLE IF NOT EXISTS admin_controls(scope TEXT PRIMARY KEY, paused INTEGER NOT NULL DEFAULT 0)"); // reserveSpark checks the admin pause (#353)
  return {
    budgetAccount: async () => "local-smoke-check",
    DB: { prepare(sql: string) {
      const query = db.query(sql);
      return { bind(...values: any[]) { return { first: async () => query.get(...values), run: async () => query.run(...values) }; } };
    } } as unknown as D1Database,
  };
}
