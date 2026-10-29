// Opt-in test accounts. Never grants authority over a real repository.
import type { Hono } from "hono";
import { createSession, currentUser, endSession, readPrefs, saveReach, upsertUser } from "./accounts";
import { readSessionDetails } from "./session";
import { previewAccess, secureTransport } from "./access";
import { emptyProgress } from "@shiptorio/shared";
import { admit, ipScope } from "./signup";
import type { Env } from "./index";
import { delegateTestRequest, ISOLATED_TEST_CONTEXT } from "./test-delegation";
import { TEST_PERSONAS, type TestPersona, localTestHost as local, personaId, personaRepo, testUsersEnabled } from "./test-users-policy";
export { TEST_PERSONAS, personaId, personaRepo, testUsersEnabled } from "./test-users-policy";

export interface TestUsersEnv {
  TEST_USERS?: string; PUBLIC_URL?: string; TEST_FACTORY_KEY?: string; TEST_FACTORY?: Fetcher;
  DB: D1Database; SESSION_SECRET: string; APP_PASSWORD?: string; ALLOWED_LOGINS: string;
}
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
    env.DB.prepare("INSERT OR IGNORE INTO signup_allowlist(login,enabled,approved_by,factories,repos,runs_daily,spark_calls_daily,spark_tokens_daily,updated_at) VALUES (?,1,'test-fixture',3,3,?,?,?,?)").bind(p, p === "test-broke" ? 0 : 20, p === "test-broke" ? 0 : null, p === "test-broke" ? 0 : null, now),
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
    const resetPath = url.pathname === "/test/reset";
    // Production pays no extra cookie-HMAC cost. The shared account/access policy still
    // rejects reserved negative IDs, including old sockets and runner credentials.
    if (env.TEST_USERS !== "on" && !testPath && !resetPath) return next();
    const session = await readSessionDetails(env.SESSION_SECRET, c.req.header("cookie") ?? null);
    const negative = (session?.ref?.uid ?? 0) < 0;
    // Optional UI discovery must stay quiet on ordinary local/staging builds. It reveals no
    // identities and cannot mint a session; production still has no test discovery endpoint.
    if (!negative && !testUsersEnabled(env, url) && c.req.method === "GET" && url.pathname === "/test/users" && url.searchParams.get("format") === "json" && (local(url) || url.origin === "https://shiptorio.dev")) {
      c.header("Cache-Control", "no-store");
      return c.json({ personas: [] });
    }
    if ((testPath || resetPath || negative) && !testUsersEnabled(env, url)) return c.json({ error: "Test accounts are disabled here" }, 404);
    if (testPath || resetPath || negative) {
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
      return c.redirect(p === "test-guest" ? "/?source=sim&scenario=first-run&repo=you/demo-shop" : "/?source=live&onboard=repo", 303);
    }
    if (!negative) return resetPath ? c.json({ error: "Test session required" }, 403) : next();
    c.header("Cache-Control", "no-store");
    c.header("X-Content-Type-Options", "nosniff");
    const user = await currentUser(env, c.req.header("cookie") ?? null);
    const p = user?.login as TestPersona;
    if (!user || !TEST_PERSONAS.includes(p) || user.id !== personaId(p)) return c.json({ error: "Invalid test identity" }, 403);
    if (resetPath && !(env as TestUsersEnv & { [ISOLATED_TEST_CONTEXT]?: boolean })[ISOLATED_TEST_CONTEXT]) {
      if (c.req.method !== "POST" || c.req.header("origin") !== url.origin || url.search) return c.json({ error: "Invalid fixture reset" }, 403);
      if (local(url) || !env.TEST_FACTORY || (env.TEST_FACTORY_KEY?.length ?? 0) < 32) return c.json({ error: "Isolated reset service unavailable" }, 503);
      const response = await env.TEST_FACTORY.fetch(await delegateTestRequest(c.req.raw, user, env.TEST_FACTORY_KEY!));
      if (response.ok) await env.DB.batch([env.DB.prepare("DELETE FROM user_progress WHERE user_id=?").bind(user.id), env.DB.prepare("DELETE FROM user_prefs WHERE user_id=?").bind(user.id)]);
      return response;
    }
    // Set only by the private fixture entrypoint after verifying a scoped delegation.
    if ((env as TestUsersEnv & { [ISOLATED_TEST_CONTEXT]?: boolean })[ISOLATED_TEST_CONTEXT]) return next();
    if (url.pathname === "/api/flags" && !["GET", "HEAD"].includes(c.req.method)) return c.json({ error: "Test account operation is not permitted" }, 403);
    if (url.pathname === "/api/me") return c.json({ login: user.login, allowed: true, admin: false, guest: false, prefs: await readPrefs(env, user), installUrl: "/test/install" });
    if (url.pathname === "/test/install") {
      c.header("Content-Security-Policy", "default-src 'none'; form-action 'self'; frame-ancestors 'none'; base-uri 'none'");
      if (!["GET", "POST"].includes(c.req.method) || c.req.method === "POST" && c.req.header("origin") !== url.origin) return c.json({ error: "Invalid test install request" }, 403);
      if (!env.TEST_FACTORY || (env.TEST_FACTORY_KEY?.length ?? 0) < 32) return c.json({ error: "Isolated GitHub fixture is unavailable; no real installation was created" }, 503);
      if (local(url) && (env.TEST_FACTORY_KEY?.length ?? 0) >= 32) {
        return env.TEST_FACTORY.fetch(`http://test-fixture.invalid/install${url.search}`, { method: c.req.method, headers: { "x-shiptorio-test-hop": env.TEST_FACTORY_KEY! } });
      }
      return env.TEST_FACTORY.fetch(await delegateTestRequest(c.req.raw, user, env.TEST_FACTORY_KEY ?? ""));
    }
    const repo = personaRepo(p);
    if (url.pathname === "/api/repos") {
      if (!local(url) && env.TEST_FACTORY && (env.TEST_FACTORY_KEY?.length ?? 0) >= 32) return env.TEST_FACTORY.fetch(await delegateTestRequest(c.req.raw, user, env.TEST_FACTORY_KEY ?? ""));
      const owned = await env.DB.prepare("SELECT installation_id FROM user_repos WHERE user_id=? AND repo=?").bind(user.id, repo).first<{ installation_id: number }>();
      return c.json({ repos: owned ? [{ full_name: repo, fullName: repo, default_branch: "main", installation_id: owned.installation_id, blurb: "Isolated GitHub fixture" }] : [] });
    }
    const match = url.pathname.match(/^\/api\/repos\/([^/]+\/[^/]+)(?:\/|$)/);
    const sourceRead = ["/api/setup/status", "/api/sources"].includes(url.pathname) && c.req.method === "GET";
    const overviewRead = url.pathname === "/api/empire" && c.req.method === "GET" && !url.search;
    if (match || sourceRead || overviewRead) {
      if (!overviewRead && (match?.[1] ?? url.searchParams.get("repo")) !== repo || /\/runner(?:\/|$)/.test(url.pathname) && !(c.req.method === "GET" && url.pathname.endsWith("/runner/status"))) return c.json({ error: "Test accounts cannot access real repositories or runners" }, 403);
      // The local capability service is installed alongside Miniflare's outbound stubs. Keep
      // sockets inside workerd (a Node fetch bridge cannot preserve hibernating WebSockets).
      // A flag alone cannot enable this: both a private key and its service must answer.
      if (env.TEST_FACTORY && local(url) && (env.TEST_FACTORY_KEY?.length ?? 0) >= 32) {
        const ready = await env.TEST_FACTORY.fetch("http://test-fixture.invalid/ready", { method: "POST", headers: { "x-shiptorio-test-hop": env.TEST_FACTORY_KEY! } }).catch(() => null);
        if (ready?.status === 204) return next();
        return c.json({ error: "Local fixture boundary is unavailable" }, 503);
      }
      if (env.TEST_FACTORY && (env.TEST_FACTORY_KEY?.length ?? 0) >= 32) {
        return env.TEST_FACTORY.fetch(await delegateTestRequest(c.req.raw, user, env.TEST_FACTORY_KEY ?? ""));
      }
      return c.json({ error: "Isolated test factory is unavailable; no real provider request was made" }, 503);
    }
    if (url.pathname === "/github/installed" && c.req.method === "GET") return next(); // Redirect-only App callback for the already verified test persona.
    if (/^\/(?:connect|admin|setup|github)(?:\/|$)/.test(url.pathname) || /^\/api\/(?:runner|account|setup|sources|empire)/.test(url.pathname) || ["/auth/owner-session", "/auth/login"].includes(url.pathname)) return c.json({ error: "Test account operation is not permitted" }, 403);
    // Test accounts may use ordinary persisted preferences/progress and the built client only.
    if (url.pathname.startsWith("/api/") && !/^\/api\/(?:me(?:\/|$)|version$|health$|flags$|telemetry\/config$)/.test(url.pathname)) return c.json({ error: "Test account operation is not permitted" }, 403);
    return next();
  });
}
