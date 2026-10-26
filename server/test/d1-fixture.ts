import { REQUIRED_PERMISSIONS } from "../src/github-lifecycle";
import { Database } from "bun:sqlite";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { createSession, upsertUser, type AccountsEnv } from "../src/accounts";

// A real SQLite database behind the slice of the D1 API the Worker uses, with every migration applied.
export function testD1(): D1Database {
  const db = new Database(":memory:");
  const dir = join(import.meta.dir, "../migrations");
  for (const file of readdirSync(dir).filter((f) => f.endsWith(".sql")).sort()) db.exec(readFileSync(join(dir, file), "utf8"));
  const statement = (sql: string, args: unknown[] = []) => ({
    sql, args,
    bind: (...next: unknown[]) => statement(sql, next),
    first: async <T>() => (db.query(sql).get(...(args as never[])) ?? null) as T | null,
    all: async <T>() => ({ results: db.query(sql).all(...(args as never[])) as T[] }),
    run: async () => { const r = db.query(sql).run(...(args as never[])); return { meta: { changes: r.changes } }; },
  });
  return {
    prepare: (sql: string) => statement(sql),
    batch: async (list: ReturnType<typeof statement>[]) => db.transaction(() => list.map((s) => ({meta: db.query(s.sql).run(...(s.args as never[]))})))(),
  } as unknown as D1Database;
}

/** Signs a GitHub user in the way /auth/callback does and returns their Cookie header value. */
export async function signedInCookie(env: AccountsEnv, login: string, repos: string[] = [], id = Math.floor(Math.random() * 1e9)): Promise<string> {
  await upsertUser(env, { id, login });
  for (const repo of repos) {
    await env.DB.prepare("INSERT OR IGNORE INTO installations (id, account_login) VALUES (1, 'test')").run();
    await env.DB.prepare("INSERT OR IGNORE INTO repos (full_name, installation_id) VALUES (?, 1)").bind(repo.toLowerCase()).run();
    await env.DB.prepare("INSERT OR IGNORE INTO user_installations (user_id, installation_id, account_login) VALUES (?, 1, 'test')").bind(id).run();
  }
  await env.DB.prepare("UPDATE installations SET permissions = ? WHERE id = 1 AND permissions IS NULL").bind(JSON.stringify(REQUIRED_PERMISSIONS)).run();
  await env.DB.prepare("UPDATE repos SET repo_id = rowid WHERE repo_id IS NULL").run();
  for (const repo of repos) await env.DB.prepare("INSERT INTO user_repos (user_id, repo, installation_id) VALUES (?, ?, 1)").bind(id, repo.toLowerCase()).run();
  return (await createSession(env, { id, login }, null)).split(";")[0];
}
