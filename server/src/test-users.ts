// Opt-in test accounts. Never grants authority over a real repository.
import type { Hono } from "hono";
import { createSession, currentUser, endSession, saveReach, upsertUser } from "./accounts";
import { readSessionDetails } from "./session";
import { previewAccess, secureTransport } from "./access";
import { emptyProgress } from "@shiptorio/shared";
import { admit, ipScope } from "./signup";
import type { Env } from "./index";

export const TEST_PERSONAS = ["test-newbie", "test-guest", "test-midgame", "test-broke", "test-blocked"] as const;
export type TestPersona = typeof TEST_PERSONAS[number];
export interface TestUsersEnv {
  TEST_USERS?: string; PUBLIC_URL?: string; TEST_FACTORY_KEY?: string; TEST_FACTORY?: Fetcher;
  DB: D1Database; SESSION_SECRET: string; APP_PASSWORD?: string; ALLOWED_LOGINS: string;
}
const local = (u: URL) => ["localhost", "127.0.0.1", "[::1]"].includes(u.hostname);
export function testUsersEnabled(env: Pick<TestUsersEnv, "TEST_USERS" | "PUBLIC_URL">, url: URL): boolean {
  if (env.TEST_USERS !== "on") return false;
  let canonical: URL;
  try { canonical = new URL(env.PUBLIC_URL ?? url.origin); } catch { return false; }
  if (local(url)) return local(canonical) && canonical.origin === url.origin;
  return url.origin === "https://shiptorio.dev" && canonical.origin === url.origin;
}
export const personaId = (p: TestPersona) => -9001 - TEST_PERSONAS.indexOf(p);
export const personaRepo = (p: TestPersona) => `test-fixture/${p}`;
export function testerLinks(env: Pick<TestUsersEnv, "TEST_USERS" | "PUBLIC_URL">, url: URL): string {
  if (!testUsersEnabled(env, url)) return "";
  return `<section aria-label="Test accounts"><h2>Sign in as tester</h2><p>Isolated fixtures only; these accounts cannot touch real repositories.</p><ul>${TEST_PERSONAS.map(p => `<li><a href="/test/login?as=${p}">${p}</a></li>`).join("")}</ul></section>`;
}
export async function seedTestUser(env: TestUsersEnv, p: TestPersona): Promise<void> {
  if (p === "test-guest") return;
  const id = personaId(p), now = Date.now();
  await upsertUser(env, { id, login: p, name: `Fixture: ${p}` }, now);
  // INSERT OR IGNORE preserves the player's test progress across logins.
  const progress = { ...emptyProgress(), ...(p === "test-midgame" ? { xp: 60, streak: 3, best: 3 } : {}) };
  await env.DB.batch([
    env.DB.prepare("INSERT OR IGNORE INTO signup_allowlist(login,enabled,approved_by,factories,repos,runs_daily,spark_calls_daily,spark_tokens_daily,updated_at) VALUES (?,1,'test-fixture',1,1,?,?,?,?)").bind(p, p === "test-broke" ? 0 : 20, p === "test-broke" ? 0 : null, p === "test-broke" ? 0 : null, now),
    env.DB.prepare("INSERT OR IGNORE INTO user_progress(user_id,value,updated_at) VALUES (?,?,?)").bind(id, JSON.stringify(progress), now),
  ]);
  if (p !== "test-newbie") {
    const installationId = 9000 + Math.abs(id), repo = personaRepo(p);
    await saveReach(env, id, { installations: [{ id: installationId, account: "test-fixture" }], repos: [{ repo, installationId, defaultBranch: "main" }] });
    await env.DB.prepare("UPDATE repos SET repo_id = ? WHERE full_name = ? AND repo_id IS NULL").bind(990000 + Math.abs(id), repo).run();
    if (p === "test-broke") await env.DB.prepare("INSERT OR IGNORE INTO spark_factory_budgets(repo,daily_nano_usd) VALUES (?,0)").bind(repo).run();
  }
}

/** Register BEFORE logging, authorization and factory middleware: fail closed before provider work. */
export function testUserRoutes(app: Hono<any>): void {
  app.use("*", async (c, next) => {
    const env = c.env as TestUsersEnv, url = new URL(c.req.url);
    const testPath = url.pathname === "/test/users" || url.pathname === "/test/login";
    const session = await readSessionDetails(env.SESSION_SECRET, c.req.header("cookie") ?? null);
    const negative = (session?.ref?.uid ?? 0) < 0;
    if ((testPath || negative) && !testUsersEnabled(env, url)) return c.json({ error: "Test accounts are disabled here" }, 404);
    if (testPath || negative) {
      const transport = secureTransport(c.req.raw);
      if (transport) return transport;
      const gated = await previewAccess(c.req.raw, env);
      if (gated) return gated;
    }
    if (testPath) {
      if (c.req.method !== "GET") return c.json({ error: "GET required" }, 405);
      c.header("Cache-Control", "no-store");
      c.header("X-Content-Type-Options", "nosniff");
      c.header("Content-Security-Policy", "default-src 'none'; style-src 'unsafe-inline'; form-action 'self'; frame-ancestors 'none'; base-uri 'none'");
      if (url.pathname === "/test/users") return url.searchParams.get("format") === "json" ? c.json({ personas: TEST_PERSONAS }) : c.html(`<!doctype html><html><meta name="viewport" content="width=device-width"><title>Shiptorio test accounts</title><body>${testerLinks(env, url)}</body></html>`);
      if (!await admit(env as Env, await ipScope(c.req.raw, "test-login"), 20, 60000, "test sign-in flood")) return c.json({ error: "Try again later" }, 429);
      const p = url.searchParams.get("as") as TestPersona;
      if (!TEST_PERSONAS.includes(p)) return c.json({ error: "Unknown test persona" }, 400);
      if (p === "test-guest") {
        await endSession(env, c.req.header("cookie") ?? null);
        c.header("Set-Cookie", "shiptorio_session=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0", { append: true });
      } else {
        await seedTestUser(env, p);
        c.header("Set-Cookie", await createSession(env, { id: personaId(p), login: p }, c.req.header("user-agent") ?? null), { append: true });
      }
      return c.redirect(p === "test-guest" ? "/?source=sim&scenario=first-run" : "/?source=live&onboard=repo", 303);
    }
    if (!negative) return next();
    const user = await currentUser(env, c.req.header("cookie") ?? null);
    const p = user?.login as TestPersona;
    if (!user || !TEST_PERSONAS.includes(p) || user.id !== personaId(p)) return c.json({ error: "Invalid test identity" }, 403);
    const repo = personaRepo(p);
    if (url.pathname === "/api/repos") {
      const owned = await env.DB.prepare("SELECT installation_id FROM user_repos WHERE user_id=? AND repo=?").bind(user.id, repo).first<{ installation_id: number }>();
      return c.json({ repos: owned ? [{ full_name: repo, fullName: repo, default_branch: "main", installation_id: owned.installation_id, blurb: "Isolated GitHub fixture" }] : [] });
    }
    const match = url.pathname.match(/^\/api\/repos\/([^/]+\/[^/]+)(?:\/|$)/);
    const sourceRead = ["/api/setup/status", "/api/sources"].includes(url.pathname) && c.req.method === "GET";
    if (match || sourceRead) {
      if ((match?.[1] ?? url.searchParams.get("repo")) !== repo || /\/runner(?:\/|$)/.test(url.pathname) && !(c.req.method === "GET" && url.pathname.endsWith("/runner/status"))) return c.json({ error: "Test accounts cannot access real repositories or runners" }, 403);
      // The local fixture service re-enters this same real Worker after installing the outbound
      // GitHub/Spark stubs. A flag alone cannot open this route: the service AND private hop key
      // are required. Remote staging always goes through its separate isolated service.
      if (env.TEST_FACTORY && local(url) && (env.TEST_FACTORY_KEY?.length ?? 0) >= 32 && c.req.header("x-shiptorio-test-hop") === env.TEST_FACTORY_KEY) return next();
      if (env.TEST_FACTORY) {
        const headers = new Headers();
        for (const name of ["cookie", "content-type", "origin", "upgrade", "sec-websocket-key", "sec-websocket-version"]) {
          const value = c.req.header(name); if (value) headers.set(name, value);
        }
        return env.TEST_FACTORY.fetch(new Request(c.req.url, { method: c.req.method, headers, body: ["GET", "HEAD"].includes(c.req.method) ? undefined : c.req.raw.body, redirect: "manual" }));
      }
      return c.json({ error: "Isolated test factory is unavailable; no real provider request was made" }, 503);
    }
    if (/^\/(?:connect|admin|setup|github)(?:\/|$)/.test(url.pathname) || /^\/api\/(?:runner|account|setup|sources|empire)/.test(url.pathname) || url.pathname === "/auth/owner-session") return c.json({ error: "Test account operation is not permitted" }, 403);
    // Test accounts may use ordinary persisted preferences/progress and the built client only.
    if (url.pathname.startsWith("/api/") && !/^\/api\/(?:me(?:\/|$)|version$|health$|flags$|telemetry\/config$)/.test(url.pathname)) return c.json({ error: "Test account operation is not permitted" }, 403);
    return next();
  });
}
