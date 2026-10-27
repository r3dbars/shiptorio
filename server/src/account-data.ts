import { accountIdentity } from "./account-identity";
import { purgeInstallationTokens } from "./github";
import { repoAccess, type AccessUser } from "./authorization";
import { securityObjectName } from "./rate-limit";
import type { FactoryState } from "@shiptorio/shared";
import type { PermitBook } from "./permits";
import { reposFor, type User, type RepoRow } from "./accounts";
import type { Env } from "./index";
import { linkedRepo } from "./sources/creds";

export { repoHash, factoryDeleted } from "./account-lifecycle";
import { repoHash } from "./account-lifecycle";
/** Account reads and erasure must not wake/migrate a factory or require GitHub availability. */
async function accountObjectName(env: Env, repo: string) {
  const row = await env.DB.prepare("SELECT * FROM repos WHERE full_name = ?").bind(repo.toLowerCase()).first<{repo_id?: number | null}>();
  return row?.repo_id ? `repo:${row.repo_id}` : repo.toLowerCase();
}
export async function accountFactory(env: Env, repo: string) {
  return env.FACTORY.get(env.FACTORY.idFromName(await accountObjectName(env, repo)));
}

/** Only personal installation owners can erase shared repository data. Membership is insufficient. */
export async function ownedRepos(env: Env, user: User): Promise<(RepoRow & {repo_id?: number | null})[]> {
  if (user.dev) throw new Error("Account deletion is unavailable for the local development identity");
  return (await env.DB.prepare("SELECT r.* FROM repos r JOIN installations i ON i.id = r.installation_id WHERE i.account_id = ? AND i.account_type = 'User' ORDER BY r.full_name")
    .bind(user.id).all<RepoRow & {repo_id?: number | null}>()).results;
}

export interface AccountFactoryData {
  state: FactoryState | null;
  permits: PermitBook | null;
  research: FactoryState["research"] | null;
  logs: {thoughts: NonNullable<FactoryState["brain"]>["thoughts"]; approvals: {kind: string; scope: string; at: number; actionId: string}[]; stages: {itemId: string; stage: string; enteredAt: number; exitedAt?: number}[]; taps?: Record<string, unknown>[]};
}
export async function accountRepos(env: Env, user: User): Promise<RepoRow[]> {
  const repos = await reposFor(env, user);
  if (user.dev) return repos;
  const allowed: RepoRow[] = [];
  for (const repo of repos) if (await repoAccess(env, user as AccessUser, repo.full_name)) allowed.push(repo);
  return allowed;
}
async function kvJSON<T>(env: Env, keys: string[]): Promise<Map<string, T>> {
  const rows = new Map<string, T>();
  for (let i = 0; i < keys.length; i += 100) {
    const batch = await env.CACHE.get<T>(keys.slice(i, i + 100), "json");
    for (const [key, value] of batch) if (value !== null) rows.set(key, value);
  }
  return rows;
}
async function retainedActivity(env: Env, user: User, repos: RepoRow[]) {
  const logs: Record<string, unknown>[] = [];
  const names = new Set(repos.map(r => r.full_name.toLowerCase()));
  let cursor: string | undefined;
  do {
    const page = await env.CACHE.list({prefix: "ops:events:all:", cursor});
    const entries = await kvJSON<Record<string, unknown>>(env, page.keys.map(k => k.name));
    for (const {name} of page.keys) {
      const entry = entries.get(name);
      if (entry && (entry.userId === accountIdentity(user.id) || names.has(String(entry.repo).toLowerCase()))) logs.push(entry);
    }
    cursor = page.list_complete ? undefined : page.cursor;
  } while (cursor);
  return logs;
}
export async function exportAccount(env: Env, user: User) {
  const repos = await accountRepos(env, user);
  // Owners retain export/delete access to their archived data after GitHub access ends.
  if (!user.dev) for (const owned of await ownedRepos(env, user)) if (!repos.some(r => r.full_name === owned.full_name)) repos.push(owned);
  const factories = [];
  for (const repo of repos) factories.push({ repo: repo.full_name, data: JSON.parse(await (await accountFactory(env, repo.full_name)).exportAccountData()) as AccountFactoryData });
  const prefs = await env.DB.prepare("SELECT key, value, updated_at FROM user_prefs WHERE user_id = ?").bind(user.id).all();
  const exportTables = new Set((await env.DB.prepare("SELECT name FROM sqlite_master WHERE type = 'table'").all<{name: string}>()).results.map(t => t.name));
  const progress = exportTables.has("user_progress") ? await env.DB.prepare("SELECT value, updated_at FROM user_progress WHERE user_id = ?").bind(user.id).first() : null;
  const profile = await env.DB.prepare("SELECT id, login, name, avatar_url, created_at, last_login_at FROM users WHERE id = ?").bind(user.id).first();
  const installations = (await env.DB.prepare("SELECT installation_id, account_login FROM user_installations WHERE user_id = ?").bind(user.id).all()).results;
  const activity = await retainedActivity(env, user, repos);
  return { profile, installations, progress, activity, format: "shiptorio-account-v1", exportedAt: new Date().toISOString(), user: { id: user.id, login: user.login }, preferences: prefs.results, factories };
}

async function purgeKV(env: Env, repos: (RepoRow & {repo_id?: number | null})[], userId: number): Promise<void> {
  const names = new Set(repos.map(r => r.full_name.toLowerCase()));
  const keys = new Set<string>(repos.flatMap(r => [`cred:sentry:${r.full_name.toLowerCase()}`, `cred:posthog:${r.full_name.toLowerCase()}`, `cred:support:${r.full_name.toLowerCase()}`]));
  for (const repo of repos) if (repo.repo_id) keys.add(`cred:support:${repo.installation_id}:${repo.repo_id}`);
  // Enumerate first, delete second: deleting during pagination can skip keys.
  let cursor: string | undefined;
  do {
    const page = await env.CACHE.list({ cursor });
    const operational = await kvJSON<{userId?: string; repo?: string}>(env, page.keys.filter(k => k.name.startsWith("ops:")).map(k => k.name));
    for (const { name } of page.keys) {
      if (name.startsWith("ops:")) {
        const entry = operational.get(name);
        if (entry && (entry.userId === accountIdentity(userId) || names.has(entry.repo?.toLowerCase() ?? ""))) keys.add(name);
      }
      if ([...names].some(repo => name === `cred:sentry:${repo}` || name === `cred:posthog:${repo}` || name.includes(`:${repo}:`) || name.endsWith(`:${repo}`))
        || name.startsWith("access:v2:") && name.endsWith(`:${userId}`)) keys.add(name);
    }
    cursor = page.list_complete ? undefined : page.cursor;
  } while (cursor);
  for (const kind of ["sentry", "posthog"] as const) {
    // Erasure uses the captured historical owner, even after its active repository row is gone.
    // Credential resolution deliberately refuses such inactive/unpinned aliases.
    const historicalLink = await env.CACHE.get(`link:${kind}`);
    if (names.has((historicalLink ?? await linkedRepo(env, kind))?.toLowerCase() ?? "r3dbars/shiptorio")) {
      keys.add(`cred:${kind}`); keys.add(`link:${kind}`);
    }
  }
  const pending = [...keys];
  for (let i = 0; i < pending.length; i += 50) await Promise.all(pending.slice(i, i + 50).map(key => env.CACHE.delete(key)));
}

export async function deleteAccount(env: Env, user: User, confirmations: string[]) {
  const repos = await ownedRepos(env, user);
  const expected = repos.map(r => r.full_name.toLowerCase()).sort();
  if (JSON.stringify([...new Set(confirmations)].sort()) !== JSON.stringify(expected)) throw new Error("Type every owned repository name exactly to confirm deletion");
  // The archive goes only to the requesting browser, never into a retained server backup.
  const installs = await env.DB.prepare("SELECT id FROM installations WHERE account_id = ? AND account_type = 'User'").bind(user.id).all<{id: number}>();
  const archive = await exportAccount(env, user);
  // Revoked GitHub reach must not prevent an owner from archiving their own stored data.
  for (const repo of repos) if (!archive.factories.some(f => f.repo === repo.full_name)) archive.factories.push({repo: repo.full_name, data: JSON.parse(await (await accountFactory(env, repo.full_name)).exportAccountData()) as AccountFactoryData});
  const now = Date.now();
  // Commit the durable stop before destructive work. Retries can finish partial cleanup.
  for (const repo of repos) {
    const identifiers = [repo.full_name, ...[repo.full_name.toLowerCase(), await accountObjectName(env, repo.full_name)].map(name => `object:${env.FACTORY.idFromName(name).toString()}`)];
    for (const identifier of identifiers) await env.DB.prepare("INSERT OR IGNORE INTO deleted_factories (repo_hash, deleted_at) VALUES (?, ?)").bind(await repoHash(identifier), now).run();
  }
  for (const {id} of installs.results) {
    await env.DB.prepare("INSERT OR IGNORE INTO deleted_factories (repo_hash, deleted_at) VALUES (?, ?)").bind(await repoHash(`installation:${id}`), now).run();
    purgeInstallationTokens(id);
  }
  await env.FACTORY.get(env.FACTORY.idFromName("github-installations")).pruneAccountDeliveries(installs.results.map(i => i.id), user.id);
  for (const repo of repos) {
    const primary = await accountFactory(env, repo.full_name);
    await primary.eraseAccountData();
    // Lifecycle migration leaves a frozen legacy pointer; erase that object as well.
    await env.FACTORY.get(env.FACTORY.idFromName(repo.full_name.toLowerCase())).eraseAccountData();
  }
  await purgeKV(env, repos, user.id);
  for (const subject of [`user:${user.id}`, `user:${user.login.toLowerCase()}`]) {
    await env.FACTORY.get(env.FACTORY.idFromName(await securityObjectName(subject))).eraseAccountData();
  }
  const statements: D1PreparedStatement[] = [];
  const tables = new Set((await env.DB.prepare("SELECT name FROM sqlite_master WHERE type = 'table'").all<{name: string}>()).results.map(t => t.name));
  for (const repo of repos) {
    // Goal 3 uses installation/repository-bound encrypted envelopes in D1.
    if (tables.has("credentials")) statements.push(env.DB.prepare("DELETE FROM credentials WHERE scope = ?").bind(`installation:${repo.installation_id}:repo:${repo.full_name.toLowerCase()}`));
    if (tables.has("webhook_deliveries")) {
      const columns = await env.DB.prepare("PRAGMA table_info(webhook_deliveries)").all<{name: string}>();
      if (columns.results.some(c => c.name === "repo")) statements.push(env.DB.prepare("DELETE FROM webhook_deliveries WHERE repo = ?").bind(repo.full_name));
    }
    const dataKeys = [repo.full_name, ...(repo.repo_id ? [`repo:${repo.repo_id}`] : [])];
    for (const dataKey of dataKeys) for (const table of ["pull_requests", "move_kind_rules", "card_taps", "user_repos"]) statements.push(env.DB.prepare(`DELETE FROM ${table} WHERE repo = ?`).bind(dataKey));
    if (repo.repo_id) {
      statements.push(env.DB.prepare("DELETE FROM credentials WHERE scope GLOB ?").bind(`archived:repo:${repo.repo_id}:installation:*`));
      statements.push(env.DB.prepare("DELETE FROM credentials WHERE scope = ?").bind(`installation:${repo.installation_id}:repo-id:${repo.repo_id}`));
    }
    statements.push(env.DB.prepare("DELETE FROM repos WHERE full_name = ?").bind(repo.full_name));
  }
  // Remove installs owned by this account, including ones with no remaining repos.

  for (const { id } of installs.results) {
    statements.push(env.DB.prepare("DELETE FROM webhook_deliveries WHERE installation_id = ?").bind(id));
    statements.push(env.DB.prepare("DELETE FROM user_installations WHERE installation_id = ?").bind(id));
    statements.push(env.DB.prepare("DELETE FROM installations WHERE id = ?").bind(id));
  }
  for (const table of ["sessions", "user_prefs", "user_repos", "user_installations"]) statements.push(env.DB.prepare(`DELETE FROM ${table} WHERE user_id = ?`).bind(user.id));
  if (tables.has("user_progress")) statements.push(env.DB.prepare("DELETE FROM user_progress WHERE user_id = ?").bind(user.id));
  statements.push(env.DB.prepare("DELETE FROM users WHERE id = ?").bind(user.id));
  const login = user.login.toLowerCase();
  // Signup, usage and lifecycle ledgers must not outlive the account either.
  for (const table of ["signup_allowlist", "signup_resources", "github_authorization_revocations"]) if (tables.has(table)) statements.push(env.DB.prepare(`DELETE FROM ${table} WHERE login = ?`).bind(login));
  if (tables.has("signup_waitlist")) statements.push(env.DB.prepare("DELETE FROM signup_waitlist WHERE kind = 'github' AND identity = ?").bind(login));
  if (tables.has("signup_allowlist")) statements.push(env.DB.prepare("UPDATE signup_allowlist SET approved_by = '[deleted account]' WHERE lower(approved_by) = ?").bind(login));
  if (tables.has("signup_invites")) statements.push(env.DB.prepare("DELETE FROM signup_invites WHERE lower(created_by) = ? OR lower(redeemed_by) = ?").bind(login, login));
  const quotaScopes = [`runs:${login}`, `install:${login}`, ...repos.map(r => `webhook:sentry:${r.full_name}`), ...installs.results.map(i => `webhook:github:${i.id}`)];
  for (const table of ["signup_counters", "signup_abuse"]) if (tables.has(table)) for (const scope of quotaScopes) statements.push(env.DB.prepare(`DELETE FROM ${table} WHERE scope = ?`).bind(scope));
  if (tables.has("spark_usage")) statements.push(env.DB.prepare("DELETE FROM spark_usage WHERE account = ?").bind(`user:${user.id}`));
  if (tables.has("factory_budget_owners")) statements.push(env.DB.prepare("DELETE FROM factory_budget_owners WHERE user_id = ?").bind(user.id));
  for (const repo of repos) if (tables.has("factory_budget_owners")) statements.push(env.DB.prepare("DELETE FROM factory_budget_owners WHERE repo = ?").bind(repo.full_name));
  for (const install of installs.results) if (tables.has("api_limits")) statements.push(env.DB.prepare("DELETE FROM api_limits WHERE scope = ?").bind(`github:installation:${install.id}`));
  for (const repo of repos) for (const table of ["spark_factory_calls", "spark_factory_budgets"]) if (tables.has(table)) statements.push(env.DB.prepare(`DELETE FROM ${table} WHERE repo = ?`).bind(repo.full_name));
  const receipt = crypto.randomUUID();
  statements.push(env.DB.prepare("INSERT INTO account_deletion_receipts (id, completed_at, factory_count) VALUES (?, ?, ?)").bind(receipt, now, repos.length));
  await env.DB.batch(statements);
  return { deleted: true, receipt, archive };
}
