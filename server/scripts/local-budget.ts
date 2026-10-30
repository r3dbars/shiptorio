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
  db.exec("CREATE TABLE IF NOT EXISTS spark_factory_budgets(repo TEXT PRIMARY KEY, daily_nano_usd INTEGER NOT NULL)");
  db.exec("CREATE TABLE IF NOT EXISTS spark_factory_calls(id TEXT PRIMARY KEY, repo TEXT, day TEXT, model TEXT, input_tokens INTEGER DEFAULT 0, output_tokens INTEGER DEFAULT 0, cached_tokens INTEGER DEFAULT 0, nano_usd INTEGER, settled INTEGER DEFAULT 0, account TEXT)");
  return {
    budgetAccount: async () => "local-smoke-check",
    DB: { prepare(sql: string) {
      const query = db.query(sql);
      return { bind(...values: any[]) { return { first: async () => query.get(...values), run: async () => query.run(...values) }; } };
    } } as unknown as D1Database,
  };
}
