// The stranger dry run: a brand-new GitHub account goes from the front door to a live factory on the
// real Worker (Miniflare, with D1, KV, the Factory DO and the built web app) and a pretend GitHub.
// Every step is timed; the run fails on the first step a stranger couldn't get past.
//
//   bun run build && node playtest/stranger/run.mjs        (STRANGER_OUT=dir keeps screenshots + timings)
//
// Friction log and what each step means: docs/context/new-user-path.md.

import { execFileSync } from "node:child_process";
import { generateKeyPairSync } from "node:crypto";
import { mkdirSync, readdirSync, readFileSync, writeFileSync, mkdtempSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { githubStub } from "./github-stub.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "../..");
const server = join(root, "server");
const out = process.env.STRANGER_OUT || mkdtempSync(join(tmpdir(), "stranger-"));
mkdirSync(out, { recursive: true });
// Miniflare and the config reader come with wrangler, so no extra install.
const requireFromServer = createRequire(join(server, "package.json"));
const wrangler = requireFromServer("wrangler");
const { Miniflare, convertV4MiniflareOptions } = createRequire(requireFromServer.resolve("wrangler"))("miniflare");
const pw = await import(process.env.PLAYWRIGHT_MODULE || "playwright");
const chromium = pw.chromium ?? pw.default.chromium;

const PORT = Number(process.env.STRANGER_PORT || 8799);
const origin = `http://localhost:${PORT}`;
const PASSWORD = "stranger-preview";
const WEBHOOK_SECRET = "stub-webhook-secret";

// 1. Bundle the Worker exactly as deploy would.
const bundle = mkdtempSync(join(tmpdir(), "stranger-bundle-"));
execFileSync("npx", ["wrangler", "deploy", "--dry-run", "--outdir", bundle], { cwd: server, stdio: "ignore" });

const { workerOptions } = wrangler.unstable_getMiniflareWorkerOptions(join(server, "wrangler.jsonc"));
const { privateKey } = generateKeyPairSync("rsa", { modulusLength: 2048, privateKeyEncoding: { type: "pkcs8", format: "pem" }, publicKeyEncoding: { type: "spki", format: "pem" } });
let mf;
const stub = githubStub({ origin, webhookSecret: WEBHOOK_SECRET, worker: (url, init) => mf.dispatchFetch(url, init) });
// Only the bindings this Worker uses; the rest of wrangler's option bag is empty defaults.
const { compatibilityDate, compatibilityFlags, kvNamespaces, d1Databases, durableObjects, assets } = workerOptions;
const worker = { compatibilityDate, compatibilityFlags, kvNamespaces, d1Databases, durableObjects, assets };
mf = new Miniflare(convertV4MiniflareOptions({ port: PORT, workers: [{
  ...worker,
  name: "shiptorio",
  rootPath: bundle,
  modules: true,
  scriptPath: join(bundle, "index.js"),
  bindings: {
    ...workerOptions.bindings,
    PUBLIC_URL: origin,
    ALLOWED_LOGINS: "fresh-stranger", // one explicitly approved fixture account; no wildcard signup bypass
    SESSION_SECRET: "stranger-session-secret-0123456789abcdef",
    APP_PASSWORD: PASSWORD,
    GITHUB_APP_ID: "1",
    GITHUB_APP_PRIVATE_KEY: privateKey,
    GITHUB_CLIENT_ID: "Iv1.stub",
    GITHUB_CLIENT_SECRET: "stub-client-secret",
    GITHUB_WEBHOOK_SECRET: WEBHOOK_SECRET,
    GITHUB_APP_SLUG: "shiptorio-stub",
  },
  outboundService: (request) => stub.outbound(request),
}] }));
await mf.ready;
const db = await mf.getD1Database("DB");
const migrations = join(server, "migrations");
for (const file of readdirSync(migrations).filter((f) => f.endsWith(".sql")).sort()) {
  const statements = wrangler.unstable_splitSqlQuery(readFileSync(join(migrations, file), "utf8")).filter((s) => s.trim());
  await db.batch(statements.map((s) => db.prepare(s)));
}
if (process.env.STRANGER_SETUP_URL !== "0") stub.state.setupUrl = `${origin}/github/installed`;

// 2. The stranger: a fresh browser profile, phone-ish laptop window, github.com answered by the stub.
const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
await context.route("https://github.com/**", (route) => stub.browser(route));
// Playwright can't intercept a redirect hop, so the Worker's 302 to github.com becomes a fresh navigation.
await context.route(`${origin}/auth/login*`, async (route) => {
  const res = await route.fetch({ maxRedirects: 0 });
  const to = res.headers().location ?? "/";
  if (!to.startsWith("https://github.com/")) return route.fulfill({ response: res });
  const cookies = res.headersArray().filter((h) => h.name.toLowerCase() === "set-cookie").map((h) => h.value);
  await route.fulfill({ status: 200, contentType: "text/html", headers: { "set-cookie": cookies.join("\n") }, body: `<script>location.href=${JSON.stringify(to)}</script>` });
});
const page = await context.newPage();
const consoleErrors = [];
const consoleWarnings = [];
const socketMessages = [];
let sawFactoryWork = false;
page.on("websocket", socket => {
  socket.on("framereceived", frame => { try { const value = JSON.parse(String(frame.payload)); if (value.state?.items?.length || value.patch?.items?.length) sawFactoryWork = true; socketMessages.push({ type: value.type, text: value.text, itemCount: value.state?.items?.length ?? value.patch?.items?.length, move: value.state?.move?.title ?? value.move?.title }); } catch {} });
  socket.on("close", () => socketMessages.push({ type: "socket-closed" }));
});
page.on("pageerror", (e) => consoleErrors.push(String(e)));
page.on("console", (m) => { if (m.type() === "error") consoleErrors.push(m.text()); if (m.type() === "warning") consoleWarnings.push(m.text().slice(0, 2000)); });
const apiErrors = [];
let repoPolls = 0;
page.on("request", (r) => { if (new URL(r.url()).pathname === "/api/repos") repoPolls++; });
page.on("response", (r) => { if (r.url().includes("/api/") && r.status() >= 400) apiErrors.push(`${r.status()} ${new URL(r.url()).pathname}`); });

const steps = [];
const report = {};
const t0 = Date.now();
async function step(name, fn) {
  const start = Date.now();
  try {
    await fn();
    steps.push({ name, ms: Date.now() - start, ok: true });
    await page.screenshot({ path: join(out, `${String(steps.length).padStart(2, "0")}-${name.replace(/\W+/g, "-")}.png`) }).catch(() => {});
  } catch (error) {
    steps.push({ name, ms: Date.now() - start, ok: false, error: String(error).split("\n")[0] });
    await page.screenshot({ path: join(out, `FAIL-${name.replace(/\W+/g, "-")}.png`) }).catch(() => {});
    throw error;
  }
}

let failed = null;
try {
  await step("front door: preview password", async () => {
    await page.goto(origin + "/");
    // The front door is intentionally public; the private-entry link leads to the password gate.
    if (await page.getByRole("link", { name: "Enter the factory", exact: true }).count()) await page.getByRole("link", { name: "Enter the factory", exact: true }).click();
    await page.getByLabel("Password").fill(PASSWORD);
    await page.getByRole("button", { name: "Enter the factory" }).click();
    await page.waitForURL((u) => u.pathname === "/" && !u.search.includes("check"));
  });
  await step("welcome tour shows, then skip", async () => {
    await page.getByRole("button", { name: "Skip" }).click({ timeout: 20000 });
  });
  await step("sign in with GitHub (real, not the sandbox)", async () => {
    await page.getByRole("button", { name: /sign in with github/i }).click({ timeout: 25000 }); // the sandbox map loads first and CI runners are slow
    await page.waitForURL((u) => u.searchParams.get("source") === "live" && u.searchParams.get("onboard") === "repo", { timeout: 10000 });
    await page.getByText(`Hey ${stub.state.user.login}`).waitFor({ timeout: 10000 });
  });
  await step("no repos yet: install the App", async () => {
    const install = page.getByRole("link", { name: /install shiptorio on a repo/i });
    await install.waitFor({ timeout: 10000 });
    // GitHub opens in a new tab; the Shiptorio tab keeps waiting for the repo
    const [github] = await Promise.all([context.waitForEvent("page"), install.click()]);
    await github.getByRole("button", { name: "Install" }).click();
    await github.waitForLoadState();
    report.installLandedOn = github.url();
    await github.close();
  });
  await step("back in Shiptorio, repo is listed by itself", async () => {
    await page.getByRole("button", { name: new RegExp(stub.state.repo) }).waitFor({ timeout: 45000 });
  });
  await step("open the factory", async () => {
    await page.getByRole("button", { name: new RegExp(stub.state.repo) }).click();
    await page.waitForURL((u) => u.searchParams.get("repo") === stub.state.repo, { timeout: 10000 });
    // the live map is up when the top bar shows and the factory has its folders
    await page.locator(".topbar").waitFor({ timeout: 30000 });
  });
  await step("real factory work reaches the agent handoff", async () => {
    await page.getByText(/plug in claude or chatgpt/i).first().or(page.getByRole("region", { name: "Power", exact: true })).first().waitFor({ timeout: 20000 });
    // A sheet opened by URL alone is insufficient: real signed-install backlog must reach the browser.
    await new Promise((resolve, reject) => {
      const poll = setInterval(() => { if (sawFactoryWork) { clearInterval(poll); clearTimeout(deadline); resolve(); } }, 25);
      const deadline = setTimeout(() => { clearInterval(poll); reject(new Error("No real factory backlog arrived over the live socket")); }, 10000);
    });
    report.powerOpenedAutomatically = await page.getByRole("region", { name: "Power", exact: true }).isVisible();
  });
  await step("the agent handoff reaches Power, not a dead end", async () => {
    // Current onboarding opens Power immediately on a first repo; older flows use the suggested card.
    if (!report.powerOpenedAutomatically) await page.getByRole("button", { name: /connect a local agent/i }).click();
    await page.getByRole("region", { name: "Power", exact: true }).waitFor({ timeout: 5000 });
  });
  // Past here a stranger needs the runner on their own computer (Codex goal 11, PR #166) and a real
  // Spark key, then the first rocket: see docs/context/new-user-path.md for what's left.
} catch (error) {
  failed = error;
  // what the server knew when the stranger got stuck
  const rows = async (sql) => (await db.prepare(sql).all()).results;
  report.db = {
    users: await rows("SELECT id, login FROM users"),
    user_repos: await rows("SELECT * FROM user_repos"),
    repos: await rows("SELECT * FROM repos"),
    webhook_deliveries: await rows("SELECT source, delivery_id, state FROM webhook_deliveries"),
  };
  report.page = { repoPolls, apiErrors, consoleErrors, consoleWarnings, socketMessages, url: page.url(), text: (await page.locator("body").innerText().catch(() => "")).slice(0, 1500) };
  console.log(JSON.stringify({ db: report.db, page: report.page }, null, 1));
}

Object.assign(report, { totalMs: Date.now() - t0, steps, consoleErrors, apiErrors, repoPolls, githubCalls: stub.state.calls, out });
writeFileSync(join(out, "timings.json"), JSON.stringify(report, null, 2));
for (const s of steps) console.log(`${s.ok ? "✓" : "✗"} ${s.name.padEnd(52)} ${(s.ms / 1000).toFixed(1)}s${s.error ? `  ${s.error}` : ""}`);
console.log(`total ${(report.totalMs / 1000).toFixed(1)}s · screenshots and timings.json in ${out}`);
await browser.close();
await mf.dispose();
process.exit(failed ? 1 : 0);
