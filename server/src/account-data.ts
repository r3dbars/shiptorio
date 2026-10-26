import type { FactoryState } from "@shiptorio/shared";
import type { PermitBook } from "./permits";
import { reposFor, type User, type RepoRow } from "./accounts";
import type { Env } from "./index";
import { linkedRepo } from "./sources/creds";

export async function repoHash(repo: string): Promise<string> {
  const hash = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(repo.toLowerCase()));
  return [...new Uint8Array(hash)].map(b => b.toString(16).padStart(2, "0")).join("");
}
export async function factoryDeleted(db: D1Database, repo: string): Promise<boolean> {
  const rows = await db.prepare("SELECT repo_hash FROM deleted_factories WHERE repo_hash = ?").bind(await repoHash(repo)).all();
  return rows.results.length > 0;
}
const factory = (env: Env, repo: string) => env.FACTORY.get(env.FACTORY.idFromName(repo.toLowerCase()));

/** Only personal installation owners can erase shared repository data. Membership is insufficient. */
export async function ownedRepos(env: Env, user: User): Promise<RepoRow[]> {
  if (user.dev) throw new Error("Account deletion is unavailable for the local development identity");
  return (await env.DB.prepare("SELECT r.full_name, r.installation_id, r.default_branch FROM repos r JOIN installations i ON i.id = r.installation_id WHERE lower(i.account_login) = ? ORDER BY r.full_name")
    .bind(user.login.toLowerCase()).all<RepoRow>()).results;
}

export interface AccountFactoryData {
  state: FactoryState | null;
  permits: PermitBook | null;
  research: FactoryState["research"] | null;
  logs: {thoughts: NonNullable<FactoryState["brain"]>["thoughts"]; approvals: {kind: string; scope: string; at: number; actionId: string}[]; stages: {itemId: string; stage: string; enteredAt: number; exitedAt?: number}[]};
}
export async function exportAccount(env: Env, user: User) {
  const repos = await reposFor(env, user);
  const factories = [];
  for (const repo of repos) factories.push({ repo: repo.full_name, data: JSON.parse(await factory(env, repo.full_name).exportAccountData()) as AccountFactoryData });
  const prefs = await env.DB.prepare("SELECT key, value, updated_at FROM user_prefs WHERE user_id = ?").bind(user.id).all();
  return { format: "shiptorio-account-v1", exportedAt: new Date().toISOString(), user: { id: user.id, login: user.login }, preferences: prefs.results, factories };
}

async function purgeKV(env: Env, repos: RepoRow[], login: string): Promise<void> {
  const names = new Set(repos.map(r => r.full_name.toLowerCase()));
  const keys = new Set<string>(repos.flatMap(r => [`cred:sentry:${r.full_name.toLowerCase()}`, `cred:posthog:${r.full_name.toLowerCase()}`]));
  // Enumerate first, delete second: deleting during pagination can skip keys.
  let cursor: string | undefined;
  do {
    const page = await env.CACHE.list({ cursor });
    for (const { name } of page.keys) {
      if ([...names].some(repo => name === `cred:sentry:${repo}` || name === `cred:posthog:${repo}` || name.includes(`:${repo}:`) || name.endsWith(`:${repo}`))
        || name.startsWith(`access:v1:${login.toLowerCase()}:`)) keys.add(name);
    }
    cursor = page.list_complete ? undefined : page.cursor;
  } while (cursor);
  for (const kind of ["sentry", "posthog"] as const) {
    if (names.has((await linkedRepo(env, kind)) ?? "r3dbars/shiptorio")) {
      keys.add(`cred:${kind}`); keys.add(`link:${kind}`);
    }
  }
  for (const key of keys) await env.CACHE.delete(key);
}

export async function deleteAccount(env: Env, user: User, confirmations: string[]) {
  const repos = await ownedRepos(env, user);
  const expected = repos.map(r => r.full_name.toLowerCase()).sort();
  if (JSON.stringify([...new Set(confirmations)].sort()) !== JSON.stringify(expected)) throw new Error("Type every owned repository name exactly to confirm deletion");
  // The archive goes only to the requesting browser, never into a retained server backup.
  const archive = await exportAccount(env, user);
  const now = Date.now();
  // Commit the durable stop before destructive work. Retries can finish partial cleanup.
  for (const repo of repos) await env.DB.prepare("INSERT OR IGNORE INTO deleted_factories (repo_hash, deleted_at) VALUES (?, ?)").bind(await repoHash(repo.full_name), now).run();
  for (const repo of repos) await factory(env, repo.full_name).eraseAccountData();
  await purgeKV(env, repos, user.login);
  const statements: D1PreparedStatement[] = [];
  const tables = new Set((await env.DB.prepare("SELECT name FROM sqlite_master WHERE type = 'table'").all<{name: string}>()).results.map(t => t.name));
  for (const repo of repos) {
    // Goal 3 uses installation/repository-bound encrypted envelopes in D1.
    if (tables.has("credentials")) statements.push(env.DB.prepare("DELETE FROM credentials WHERE scope = ?").bind(`installation:${repo.installation_id}:repo:${repo.full_name.toLowerCase()}`));
    if (tables.has("webhook_deliveries")) {
      const columns = await env.DB.prepare("PRAGMA table_info(webhook_deliveries)").all<{name: string}>();
      if (columns.results.some(c => c.name === "repo")) statements.push(env.DB.prepare("DELETE FROM webhook_deliveries WHERE repo = ?").bind(repo.full_name));
    }
    for (const table of ["pull_requests", "move_kind_rules", "user_repos"]) statements.push(env.DB.prepare(`DELETE FROM ${table} WHERE repo = ?`).bind(repo.full_name));
    statements.push(env.DB.prepare("DELETE FROM repos WHERE full_name = ?").bind(repo.full_name));
  }
  // Remove installs owned by this account, including ones with no remaining repos.
  const installs = await env.DB.prepare("SELECT id FROM installations WHERE lower(account_login) = ?").bind(user.login.toLowerCase()).all<{id: number}>();
  for (const { id } of installs.results) {
    statements.push(env.DB.prepare("DELETE FROM user_installations WHERE installation_id = ?").bind(id));
    statements.push(env.DB.prepare("DELETE FROM installations WHERE id = ?").bind(id));
  }
  if (tables.has("credentials")) statements.push(env.DB.prepare("DELETE FROM credentials WHERE lower(updated_by) = ?").bind(user.login.toLowerCase()));
  for (const table of ["sessions", "user_prefs", "user_repos", "user_installations"]) statements.push(env.DB.prepare(`DELETE FROM ${table} WHERE user_id = ?`).bind(user.id));
  statements.push(env.DB.prepare("DELETE FROM users WHERE id = ?").bind(user.id));
  const receipt = crypto.randomUUID();
  statements.push(env.DB.prepare("INSERT INTO account_deletion_receipts (id, completed_at, factory_count) VALUES (?, ?, ?)").bind(receipt, now, repos.length));
  await env.DB.batch(statements);
  return { deleted: true, receipt, archive };
}
