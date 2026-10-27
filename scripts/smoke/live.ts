/** Same unauthenticated probes for local production-mode Workers and Deploy CI.
 * bun scripts/smoke/live.ts https://shiptorio.com <expected commit SHA>
 * Local: disable DEV_LOGIN and configure APP_PASSWORD, SESSION_SECRET, GITHUB_CLIENT_ID.
 */
export async function smoke(base: string, sha: string, attempts = 12, delayMs = 5000): Promise<void> {
  const origin = new URL(base).origin;
  const request = (path: string, init: RequestInit = {}) => fetch(`${origin}${path}`, {
    ...init, redirect: "manual", signal: AbortSignal.timeout(10_000),
    headers: { "cache-control": "no-cache", ...init.headers },
  });
  const check = (ok: boolean, message: string) => { if (!ok) throw new Error(message); };
  // Allow propagation only for the version; a broken route is a deployment failure.
  let live = "unavailable";
  for (let i = 0; i < attempts; i++) {
    try {
      const response = await request("/api/version");
      live = response.status === 200 ? (await response.json() as { commit: string }).commit : `HTTP ${response.status}`;
    } catch { live = "unavailable or invalid JSON"; }
    if (live === sha) break;
    console.error(`Live commit ${live}; waiting for ${sha}`);
    if (i + 1 < attempts) await Bun.sleep(delayMs);
  }
  check(live === sha, `/api/version: expected ${sha}, got ${live}`);

  const access = await request("/access");
  check(access.status === 200, `GET /access: expected 200, got ${access.status}`);
  const html = await access.text();
  check(/<form\b[^>]*method=["']post["'][^>]*action=["']\/access["']/i.test(html)
    && /<input\b[^>]*name=["']password["'][^>]*type=["']password["']/i.test(html),
  "GET /access: missing password POST form");

  const wrong = await request("/access", { method: "POST", headers: { origin, "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ password: `smoke-wrong-${crypto.randomUUID()}` }) });
  check(wrong.status === 401, `POST /access wrong password: expected 401, got ${wrong.status}`);
  await wrong.body?.cancel();

  const login = await request("/auth/login");
  const location = login.headers.get("location");
  let github = false;
  try { const target = new URL(location!); github = target.protocol === "https:" && target.hostname === "github.com"; } catch { /* absent/relative redirect */ }
  check([301, 302, 303, 307, 308].includes(login.status) && github,
    `/auth/login: expected redirect to https://github.com, got ${login.status} ${location}`);
  await login.body?.cancel();

  for (const [path, status] of [["/", 200], ["/?source=live&repo=r3dbars%2Fshiptorio", 401], ["/api/repos", 401]] as const) {
    const response = await request(path);
    check(response.status === status, `${path}: expected ${status}, got ${response.status}`);
    await response.body?.cancel();
  }
  // Preserve the original transport check (plain HTTP is meaningful only for HTTPS deployments).
  if (origin.startsWith("https:")) {
    const response = await fetch(`${origin.replace("https:", "http:")}/`, { redirect: "manual", signal: AbortSignal.timeout(10_000) });
    check([301, 308].includes(response.status) && response.headers.get("location") === `${origin}/`,
      `HTTP /: expected redirect to ${origin}/, got ${response.status} ${response.headers.get("location")}`);
    await response.body?.cancel();
  }
  console.log(`Live smoke passed: ${origin} at ${sha}; access form, wrong password, GitHub login, landing, private gates, HTTPS`);
}

if (import.meta.main) {
  const [base, sha] = Bun.argv.slice(2);
  if (!base || !sha) { console.error("Usage: bun scripts/smoke/live.ts <base URL> <expected commit SHA>"); process.exit(2); }
  try { await smoke(base, sha); } catch (error) { console.error(`::error::Live smoke failed: ${error instanceof Error ? error.message : error}`); process.exit(1); }
}
