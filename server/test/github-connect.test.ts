import { afterEach, expect, test } from "bun:test";
import { authCallback, login } from "../src/auth";
import { currentUser } from "../src/accounts";
import { testD1 } from "./d1-fixture";

const originalFetch = globalThis.fetch;
afterEach(() => { globalThis.fetch = originalFetch; });
const env = () => ({ DB: testD1(), SESSION_SECRET: "connect-test-session", ALLOWED_LOGINS: "player", GITHUB_CLIENT_ID: "client", GITHUB_CLIENT_SECRET: "client-secret", PUBLIC_URL: "https://shiptorio.dev" });
const url = new URL("https://shiptorio.dev/auth/callback?code=code&state=state");
const request = () => new Request(url, { headers: { cookie: "shiptorio_oauth_state=state" } });

test("missing GitHub configuration returns a clear retry page rather than a broken redirect", async () => {
  const response = await login(new URL("https://shiptorio.dev/auth/login"), { ...env(), GITHUB_CLIENT_ID: "" } as never);
  expect(response.status).toBe(503);
  expect(response.headers.get("location")).toBeNull();
  expect(await response.text()).toContain("GitHub sign-in is not configured");
});

test("cancelled OAuth keeps a clear path back without creating a session", async () => {
  const target = new URL("https://shiptorio.dev/auth/callback?error=access_denied&state=state");
  const response = await authCallback(new Request(target, { headers: { cookie: "shiptorio_oauth_state=state" } }), target, env() as never);
  expect(response.status).toBe(400);
  expect(await response.text()).toContain("You cancelled GitHub sign-in");
  expect(response.headers.get("set-cookie")).toBeNull();
});

test("invalid state never contacts GitHub, even for a cancelled callback", async () => {
  let calls = 0;
  globalThis.fetch = (async () => { calls++; throw new Error("should not call GitHub"); }) as unknown as typeof fetch;
  const target = new URL("https://shiptorio.dev/auth/callback?error=access_denied&state=wrong");
  expect((await authCallback(new Request(target, { headers: { cookie: "shiptorio_oauth_state=state" } }), target, env() as never)).status).toBe(400);
  expect(calls).toBe(0);
});

for (const failure of ["http", "json", "network", "timeout"] as const) test(`OAuth ${failure} failure is actionable and does not leak provider details`, async () => {
  const e = env();
  globalThis.fetch = (async () => {
    if (failure === "http") return new Response("private-provider-detail", { status: 503 });
    if (failure === "json") return new Response("private-provider-detail");
    if (failure === "timeout") throw new DOMException("private-provider-detail", "TimeoutError");
    throw new Error("private-provider-detail");
  }) as unknown as typeof fetch;
  const response = await authCallback(request(), url, e as never);
  expect(response.status).toBe(503);
  const body = await response.text();
  expect(body).toContain("Try again"); expect(body).not.toContain("private-provider-detail");
  expect(response.headers.get("cache-control")).toBe("no-store");
  expect((await e.DB.prepare("SELECT COUNT(*) n FROM sessions").first<{n:number}>())?.n).toBe(0);
});

test("repository discovery failure cannot silently sign in with an empty or partial repository list", async () => {
  const e = env();
  globalThis.fetch = (async (input: RequestInfo | URL) => {
    const path = String(input);
    if (path.includes("/access_token")) return Response.json({ access_token: "connect-discovery-failure" });
    if (path.endsWith("/user")) return Response.json({ id: 53, login: "player" });
    return new Response("private-provider-detail", { status: 502 });
  }) as unknown as typeof fetch;
  const response = await authCallback(request(), url, e as never);
  expect(response.status).toBe(503);
  expect(await response.text()).toContain("Try again");
  expect(response.headers.get("set-cookie")).toBeNull();
});

test("successful GitHub sign-in keeps normal session and repository discovery with a bounded provider signal", async () => {
  const e = env(), signals: AbortSignal[] = [];
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    if (init?.signal) signals.push(init.signal);
    const path = String(input);
    if (path.includes("/access_token")) return Response.json({ access_token: "connect-discovery-success" });
    if (path.endsWith("/user")) return Response.json({ id: 54, login: "player" });
    if (path.includes("/user/installations")) return Response.json({ installations: [] });
    throw new Error("unexpected provider request");
  }) as unknown as typeof fetch;
  const response = await authCallback(request(), url, e as never);
  expect(response.status).toBe(302);
  expect(signals).toHaveLength(3);
  expect(signals.every(s => !s.aborted)).toBe(true);
  const session = response.headers.getSetCookie().find(c => c.startsWith("shiptorio_session="))!;
  expect(await currentUser(e, session)).toEqual({ id: 54, login: "player" });
});
