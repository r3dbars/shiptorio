// The stranger E2E suite: a brand-new GitHub account goes from the front door to a live factory on the
// real Worker (Miniflare, with D1, KV, the Factory DO and the built web app) and a pretend GitHub.
// Every step is timed; the run fails on the first step a stranger couldn't get past.
// GitHub, Spark and local build output are fixtures. No real credentials or remote writes.
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
import assert from "node:assert/strict";
import { setTimeout as delay } from "node:timers/promises";
import { sparkStub } from "./spark-stub.mjs";
import { githubStub } from "./github-stub.mjs";
import { decodeFactoryFrame } from "./factory-frame.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "../..");
const server = join(root, "server");
const out = process.env.STRANGER_OUT || mkdtempSync(join(tmpdir(), "stranger-"));
mkdirSync(out, { recursive: true });
// Miniflare and the config reader come with wrangler, so no extra install.
const requireFromServer = createRequire(join(server, "package.json"));
const wrangler = requireFromServer("wrangler");
const { Miniflare, convertV4MiniflareOptions } = createRequire(requireFromServer.resolve("wrangler"))("miniflare");
const pw = await import(process.env.PLAYWRIGHT_MODULE || "@playwright/test");
const chromium = pw.chromium ?? pw.default.chromium;

const PORT = Number(process.env.STRANGER_PORT || 8799);
const UI_TIMEOUT = 60000; // CI renders the 3D map in software; bound UI waits separately from factory work.
const origin = `http://localhost:${PORT}`;
const PASSWORD = "stranger-preview";
const WEBHOOK_SECRET = "stub-webhook-secret";

// 1. Bundle the Worker exactly as deploy would.
const bundle = mkdtempSync(join(tmpdir(), "stranger-bundle-"));
execFileSync("npx", ["wrangler", "deploy", "--dry-run", "--outdir", bundle], { cwd: server, stdio: "ignore" });

const { workerOptions } = wrangler.unstable_getMiniflareWorkerOptions(join(server, "wrangler.jsonc"));
const { privateKey } = generateKeyPairSync("rsa", { modulusLength: 2048, privateKeyEncoding: { type: "pkcs8", format: "pem" }, publicKeyEncoding: { type: "spki", format: "pem" } });
let mf, browser, context, heartbeatTimer, heartbeatPending;
const runnerErrors = [];
try {
const spark = sparkStub();
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
    META_API_KEY: "stub-meta-key",
    SPARK_DAILY_TOKENS: "5000000",
    GITHUB_APP_ID: "1",
    GITHUB_APP_PRIVATE_KEY: privateKey,
    GITHUB_CLIENT_ID: "Iv1.stub",
    GITHUB_CLIENT_SECRET: "stub-client-secret",
    GITHUB_WEBHOOK_SECRET: WEBHOOK_SECRET,
    GITHUB_APP_SLUG: "shiptorio-stub",
  },
  outboundService: (request) => new URL(request.url).host === "api.meta.ai" ? spark.outbound(request) : stub.outbound(request),
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
browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
await context.tracing.start({ screenshots: false, snapshots: true });
await context.route("https://github.com/**", (route) => stub.browser(route));
// Playwright can't intercept a redirect hop, so the Worker's 302 to github.com becomes a fresh navigation.
await context.route(`${origin}/auth/login*`, async (route) => {
  const res = await route.fetch({ maxRedirects: 0 });
  const to = res.headers().location ?? "/";
  if (!to.startsWith("https://github.com/")) return route.fulfill({ response: res });
  const cookies = res.headersArray().filter((h) => h.name.toLowerCase() === "set-cookie").map((h) => h.value);
  await route.fulfill({ status: 200, contentType: "text/html", headers: { "set-cookie": cookies.join("\n") }, body: `<script>location.href=${JSON.stringify(to)}</script>` });
});
context.setDefaultTimeout(UI_TIMEOUT);
// Observe native sockets and cut only the real approval gesture, before its click
// handler sends. No factory state/command is injected and no network errors are ignored.
await context.addInitScript(() => {
  const Native = window.WebSocket;
  window.__approvalTransport = { sockets: [], snapshots: [], cutNext: false, cut: null };
  window.WebSocket = class extends Native {
    constructor(...args) {
      super(...args);
      if (!new URL(String(args[0]), location.href).pathname.endsWith("/factory")) return;
      const trace = window.__approvalTransport;
      trace.sockets.push(this);
      this.addEventListener("message", event => {
        try { if (JSON.parse(event.data).type === "snapshot") trace.snapshots.push({ socket: trace.sockets.indexOf(this), at: performance.now() }); } catch { /* Native pong is not a snapshot. */ }
      });
    }
  };
  document.addEventListener("pointerdown", event => {
    const trace = window.__approvalTransport, button = event.target.closest?.("button");
    if (!trace.cutNext || !button || !/Approve and build with Codex/i.test(button.getAttribute("aria-label") ?? button.textContent)) return;
    trace.cutNext = false;
    const socket = trace.sockets.findLast(socket => socket.readyState === Native.OPEN);
    if (!socket) throw new Error("Approval interruption needs a live factory socket");
    socket.close(4000, "Stranger approval interruption");
    trace.cut = { trusted: event.isTrusted, at: performance.now(), readyState: socket.readyState, socket: trace.sockets.indexOf(socket) };
  }, true);
});
const page = await context.newPage();
const consoleErrors = [];
const expectedAnonymousErrors = [];
let signedIn = false;
const consoleWarnings = [];
const socketMessages = [];
let sawFactoryWork = false;
let factoryState = {};
let firstFactoryOpenedAt = 0, firstFactoryStateAt = 0;
page.on("websocket", socket => {
  socket.on("framereceived", frame => {
    try {
      const decoded = decodeFactoryFrame(frame.payload);
      if (decoded.heartbeat) return;
      const value = decoded.message;
      if (value.type === "snapshot") {
        factoryState = value.state;
        if (firstFactoryOpenedAt && !firstFactoryStateAt && value.state.repo === stub.state.repo) firstFactoryStateAt = Date.now();
      }
      if (value.type === "move") factoryState.move = value.move;
      if (value.type === "move_resolved" && factoryState.move?.id === value.moveId) factoryState.move = null;
      if (value.type === "deck") factoryState.deck = value.deck;
      if (value.type === "patch") {
        const { items, ...rest } = value.patch;
        Object.assign(factoryState, rest);
        if (items) {
          const byId = new Map((factoryState.items ?? []).map(i => [i.id, i]));
          for (const item of items) byId.set(item.id, item);
          factoryState.items = [...byId.values()];
        }
      }
      if (factoryState.items?.length) sawFactoryWork = true;
      socketMessages.push({ type: value.type, text: value.text, itemCount: factoryState.items?.length, move: factoryState.move?.title });
    } catch (error) { consoleErrors.push(`Invalid factory frame: ${error}`); }
  });
  socket.on("close", () => socketMessages.push({ type: "socket-closed" }));
});
page.on("pageerror", (e) => consoleErrors.push(String(e)));
page.on("console", (m) => { if (m.type() === "error") { if (!signedIn && /401/.test(m.text())) expectedAnonymousErrors.push(m.text()); else consoleErrors.push(`${m.text()} at ${JSON.stringify(m.location())}`); } if (m.type() === "warning") consoleWarnings.push(m.text().slice(0, 2000)); });
const apiErrors = [];
let repoPolls = 0;
page.on("request", (r) => { if (new URL(r.url()).pathname === "/api/repos") repoPolls++; });
page.on("response", (r) => { if (r.url().includes("/api/") && r.status() >= 400) { const path = new URL(r.url()).pathname; if (!signedIn && r.status() === 401 && path === "/api/repos") expectedAnonymousErrors.push(`401 ${path}`); else apiErrors.push(`${r.status()} ${path}`); } });

const steps = [];
const report = {};
const item = () => factoryState.items?.find(i => i.id === "gh-1");
async function until(label, check, timeout = 45000) {
  const end = Date.now() + timeout;
  while (Date.now() < end) { const result = await check(); if (result) return result; await delay(100); }
  throw new Error(`Timed out: ${label}`);
}
async function api(path, body, token) {
  const response = await context.request.post(origin + path, { data: body, headers: { origin, ...(token ? { authorization: `Bearer ${token}` } : {}) } });
  assert.equal(response.ok(), true, `${path}: ${response.status()} ${await response.text()}`);
  return response.json();
}
async function clickMove(name) {
  const card = await until(`decision option ${name}`, () => factoryState.deck?.find(m => m.options.some(o => name.test(o.label))));
  // The Needs you card (on by default) shows one card: Later the others until ours is up. Continue is the tab
  // on its right edge, other options sit under Details.
  if (await page.locator(".acard").count()) {
    const acard = page.locator(".acard").filter({ hasText: card.title });
    for (let i = 0; i < 20 && !await acard.count(); i++) {
      const later = page.locator(".acard").filter({ hasNotText: card.title }).locator(".alater");
      if (await later.count()) await later.first().click({ timeout: UI_TIMEOUT });
      await page.waitForTimeout(1000);
    }
    const go = acard.getByRole("button", { name });
    if (!await go.count()) await acard.locator(".atog").click({ timeout: UI_TIMEOUT });
    await go.first().click({ timeout: UI_TIMEOUT });
    return;
  }
  if (factoryState.move?.id === card.id) {
    await page.getByRole("region", { name: "Next move", exact: true }).getByRole("button", { name }).click({ timeout: UI_TIMEOUT });
    return;
  }
  if (!await page.getByRole("button", { name: /^Activity, / }).isVisible()) await page.getByRole("button", { name: /^Menu/ }).click();
  await page.getByRole("button", { name: /^Activity, / }).click();
  const tray = page.getByRole("complementary", { name: "Activity", exact: true });
  const visibleCard = tray.locator(".tcard").filter({ has: page.getByRole("button", { name: card.title }) });
  await visibleCard.getByRole("button", { name: card.title }).click();
  await visibleCard.getByRole("button", { name }).click();
  await page.keyboard.press("Escape");
}
let runnerToken, job;
const t0 = Date.now();
// Failure detail stays bounded and fixture-only: scalars as-is, objects as their type and size, never request/env objects.
const scalar = (v) => (v === null || typeof v !== "object" ? v : `[${Array.isArray(v) ? `array(${v.length})` : "object"}]`);
async function step(name, fn) {
  const start = Date.now();
  try {
    await fn();
    steps.push({ name, ms: Date.now() - start, ok: true });
    console.log(`PASS ${name}`);
    await page.screenshot({ path: join(out, `${String(steps.length).padStart(2, "0")}-${name.replace(/\W+/g, "-")}.png`) }).catch(() => {});
  } catch (error) {
    // Keep the whole failure: the first line alone loses an assertion's actual/expected and its source line.
    const detail = { message: String(error?.message ?? error), stack: error?.stack, actual: scalar(error?.actual), expected: scalar(error?.expected), operator: error?.operator };
    const state = { deck: factoryState?.deck?.map(m => ({ id: m.id, title: m.title, options: m.options?.map(o => o.label) })), move: factoryState?.move?.id, pulls: stub.state.pulls.length, merges: stub.state.merges.length, cards: await page.locator(".acard .att").allTextContents().catch(() => []) };
    steps.push({ name, ms: Date.now() - start, ok: false, error: String(error).split("\n")[0], detail, state });
    console.error(`FAIL ${name}\n${detail.stack ?? detail.message}\nactual: ${JSON.stringify(detail.actual)}\nexpected: ${JSON.stringify(detail.expected)}\nstate: ${JSON.stringify(state)}`);
    await page.screenshot({ path: join(out, `FAIL-${name.replace(/\W+/g, "-")}.png`) }).catch(() => {});
    throw error;
  }
}

let failed = null;
try {
  await step("front door: preview password", async () => {
    await page.goto(origin + "/");
    // The front door is intentionally public; the private-entry link leads to the password gate.
    const entry = page.getByRole("link", { name: /^(Sign in|Enter the factory)$/i });
    if (await entry.count()) await entry.first().click();
    await page.getByLabel("Password").fill(PASSWORD);
    await page.getByRole("button", { name: "Enter the factory" }).click();
    await page.waitForURL((u) => u.pathname === "/" && !u.search.includes("check"));
  });
  await step("welcome tour shows, then skip", async () => {
    await page.getByRole("button", { name: "Skip" }).click({ timeout: UI_TIMEOUT });
  });
  await step("play first: the demo shop, no sign-in", async () => {
    await page.waitForURL((u) => u.searchParams.get("source") === "sim" && u.searchParams.get("repo") === "you/demo-shop", { timeout: UI_TIMEOUT });
    await page.locator(".floorcard").waitFor({ timeout: UI_TIMEOUT });
  });
  await step("sign in with GitHub (real, not the sandbox)", async () => {
    // the floor card's "Use your repo" chip is the unlock; the sandbox map loads first and CI runners are slow
    await page.getByRole("link", { name: /sign in with github/i }).first().click({ timeout: UI_TIMEOUT });
    await page.waitForURL((u) => u.searchParams.get("source") === "live" && u.searchParams.get("onboard") === "repo", { timeout: UI_TIMEOUT });
    await page.getByText(`Hey ${stub.state.user.login}`).waitFor({ timeout: UI_TIMEOUT });
    signedIn = true;
  });
  await step("no repos yet: install the App", async () => {
    const install = page.getByRole("link", { name: /install shiptorio on a repo/i });
    await install.waitFor({ timeout: UI_TIMEOUT });
    // GitHub opens in a new tab; the Shiptorio tab keeps waiting for the repo
    const [github] = await Promise.all([context.waitForEvent("page"), install.click()]);
    await github.getByRole("button", { name: "Install" }).click();
    await github.waitForLoadState();
    report.installLandedOn = github.url();
    await github.close();
  });
  await step("back in Shiptorio, repo is listed by itself", async () => {
    await page.getByRole("button", { name: new RegExp(stub.state.repo) }).waitFor({ timeout: UI_TIMEOUT });
  });
  await step("open the factory", async () => {
    firstFactoryOpenedAt = Date.now();
    await page.getByRole("button", { name: new RegExp(stub.state.repo) }).click();
    await page.waitForURL((u) => u.searchParams.get("repo") === stub.state.repo, { timeout: UI_TIMEOUT });
    await until("first real factory snapshot", () => firstFactoryStateAt, 10000);
    report.firstFactoryStateMs = firstFactoryStateAt - firstFactoryOpenedAt;
    assert.ok(report.firstFactoryStateMs < 10000, `First factory state took ${report.firstFactoryStateMs}ms (budget 10000ms)`);
    // the live map is up when the floor card (top-left HUD) shows and the factory has its folders
    await page.locator(".floorcard").waitFor({ timeout: UI_TIMEOUT });
  });
  await step("real factory work reaches the agent handoff", async () => {
    await page.getByText(/plug in claude or chatgpt/i).first().or(page.getByRole("region", { name: "Power", exact: true })).first().waitFor({ timeout: UI_TIMEOUT });
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
    await page.getByRole("region", { name: "Power", exact: true }).waitFor({ timeout: UI_TIMEOUT });
  });
  await step("signed issue arrives once, even on delivery retry", async () => {
    await stub.issueArrives();
    await until("signed issue delivery processed", async () => (await db.prepare("SELECT state FROM webhook_deliveries WHERE delivery_id = ?").bind("stranger-issue-1").first())?.state === "done");
    await until("issue ore over live socket", () => item());
    assert.equal(factoryState.items.filter(i => i.id === "gh-1").length, 1);
  });
  await step("pair a fixture runner through device approval", async () => {
    const device = await api("/api/runner-device/start", {});
    const pairing = await context.newPage();
    await pairing.goto(device.verificationUri);
    await pairing.getByLabel("Repository (owner/name)").fill(stub.state.repo);
    const [approval] = await Promise.all([pairing.waitForResponse(r => r.request().method() === "POST" && new URL(r.url()).pathname === "/runner/pair", { timeout: UI_TIMEOUT }), pairing.getByRole("button", { name: "Connect this repo" }).click()]);
    assert.equal(approval.ok(), true, `Pair approval: ${approval.status()} ${await approval.text()} request=${JSON.stringify({ origin: await approval.request().headerValue("origin") })}`);
    await pairing.getByText("Machine approved", { exact: true }).waitFor();
    await pairing.close();
    const paired = await api("/api/runner-device/poll", { code: device.code, secret: device.secret });
    runnerToken = paired.token;
    assert.ok(runnerToken, "Device approval must deliver a runner token");
    // A real idle runner keeps advertising presence while the player reads the plan.
    // Slow software-rendered CI must not accidentally simulate an unplugged runner.
    heartbeatTimer = setInterval(() => {
      if (heartbeatPending) return;
      heartbeatPending = api(`/api/runner/${stub.state.repo}/heartbeat`, { harnesses: ["codex"] }, runnerToken)
        .catch(error => runnerErrors.push(String(error))).finally(() => { heartbeatPending = null; });
    }, 10000);
    assert.equal((await api(`/api/runner/${stub.state.repo}/claim`, { harnesses: ["codex"] }, runnerToken)).job, null);
    // Return to the floor after the onboarding Power sheet.
    await page.keyboard.press("Escape");
  });
  await step("Spark proposes a plan; no build before approval", async () => {
    await clickMove(/Plan with Codex/i);
    await until("Spark plan approval", () => factoryState.deck?.some(m => m.options?.some(o => o.id === "approve")));
    assert.equal((await api(`/api/runner/${stub.state.repo}/claim`, { harnesses: ["codex"] }, runnerToken)).job, null, "no runner job before the plan is approved");
    assert.equal(stub.state.pulls.length, 0, "no PR before approval");
    await page.evaluate(() => { window.__approvalTransport.cutNext = true; });
    await clickMove(/Approve and build with Codex/i);
    const interrupted = await page.evaluate(() => window.__approvalTransport.cut);
    assert.ok(interrupted?.trusted, "a real player gesture must trigger the interruption");
    assert.notEqual(interrupted.readyState, 1, "the approval click must occur after its socket starts closing");
    await page.waitForFunction(() => {
      const trace = window.__approvalTransport;
      return trace.cut && trace.snapshots.some(snapshot => snapshot.socket !== trace.cut.socket && snapshot.at > trace.cut.at);
    }, null, {timeout: UI_TIMEOUT});
    report.approvalReconnect = { ...interrupted, freshSnapshot: true };
    job = await until("approved runner job", async () => (await api(`/api/runner/${stub.state.repo}/claim`, { harnesses: ["codex"] }, runnerToken)).job);
    assert.equal((await api(`/api/runner/${stub.state.repo}/claim`, { harnesses: ["codex"] }, runnerToken)).job, null, "another claim cannot dispatch a second build while this lease is active");
    assert.equal(job.itemId, "gh-1", `approved job is for gh-1, got ${job.itemId}`);
    assert.equal(job.baseSha, stub.state.baseSha, "job built on the base sha");
    assert.deepEqual(job.allowedPaths, ["src/cart.ts", "test/cart.test.ts"]);
    assert.ok(job.steps.some(s => s.tool === "read_issue"));
    assert.ok(job.steps.some(s => s.tool === "read_file"));
    assert.ok(job.steps.some(s => s.tool === "assign_job"));
  });
  await step("runner publishes a PR with receipts on the approved head", async () => {
    // Subscription CLI and GitHub git transport are external fixtures. Production finishRunner
    // verifies branch/head, allowed diff, lease and proof before opening the PR itself.
    stub.state.branches[job.branch] = stub.state.headSha;
    const receipt = { jobId: job.id, lease: job.lease, ok: true, sha: stub.state.headSha, summary: "Applied SAVE10 with regression coverage.", checks: ["typecheck", "test", "build"], proof: { baseSha: job.baseSha, headSha: stub.state.headSha, failsOnBase: true, passesOnHead: true, command: "bun test test/cart.test.ts", logTail: "fixture: base fails, head passes" } };
    const result = await api(`/api/runner/${stub.state.repo}/finish`, receipt, runnerToken);
    assert.equal(result.prUrl, `https://github.com/${stub.state.repo}/pull/7`);
    assert.equal(stub.state.pulls.length, 1);
    assert.match(stub.state.pulls[0].body, /Closes #1/);
    assert.match(stub.state.pulls[0].body, new RegExp(`shiptorio-proof:${stub.state.headSha}`));
    await until("PR at CI inspector", () => item()?.state === "inspecting");
    assert.equal(item().inspection.stages.find(s => s.gate === "ci").state, "pending");
    assert.equal(stub.state.merges.length, 0);
  });
  await step("stale green CI cannot advance the current PR", async () => {
    const delivery = await stub.completeChecks("success", stub.state.baseSha);
    await until("stale CI delivery processed", async () => (await db.prepare("SELECT state FROM webhook_deliveries WHERE delivery_id = ?").bind(delivery).first())?.state === "done");
    assert.equal(item().inspection.stages.find(s => s.gate === "ci").state, "pending");
    assert.equal(stub.state.merges.length, 0);
  });
  await step("current-head CI, verify bay and Spark review pass", async () => {
    await stub.completeChecks("success");
    await until("all automated gauntlet stages", () => item()?.state === "on_pad");
    for (const gate of ["ci", "verify", "ai"]) assert.equal(item().inspection.stages.find(s => s.gate === gate).state, "passed", gate);
    assert.match(item().inspection.stages.find(s => s.gate === "verify").reason, /reproduced on base and passed on head/i);
    assert.ok(spark.calls.includes("review"));
    assert.ok(stub.state.comments.some(c => c.body?.includes("AI review passed")));
    assert.equal(item().inspection.humanApproved, false);
    assert.equal(stub.state.merges.length, 0);
  });
  await step("Launch card merges only after the player holds the red button", async () => {
    await until("Launch card over socket", () => factoryState.deck?.some(m => m.title.startsWith("Launch #7")));
    const card = factoryState.deck.find(m => m.title.startsWith("Launch #7"));
    assert.equal(card.evidence.length, 3);
    assert.ok(card.evidence.every(stamp => stamp.ok));
    // The Needs you card: launching is the big red button, held down until the ring fills.
    const launchCard = page.locator(".acard").filter({ hasText: card.title });
    for (let i = 0; i < 20 && !await launchCard.count(); i++) {
      const later = page.locator(".acard").filter({ hasNotText: card.title }).locator(".alater");
      if (await later.count()) await later.first().click({ timeout: UI_TIMEOUT });
      await page.waitForTimeout(1000);
    }
    const red = launchCard.getByRole("button", { name: /^Hold to launch: / });
    const box = await red.boundingBox({ timeout: UI_TIMEOUT });
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    assert.equal(stub.state.merges.length, 0, "nothing merged before the press");
    await page.mouse.down(); await page.waitForTimeout(250); await page.mouse.up(); // a tap is not consent
    await page.waitForTimeout(1500);
    assert.equal(stub.state.merges.length, 0, "a short tap must not launch");
    // Hold until the ring fills. It fills per rendered frame, so a slow CI browser takes longer than 800 ms.
    await page.mouse.down();
    await until("rocket launched while held", () => item()?.state === "launched" || stub.state.merges.length > 0);
    await page.mouse.up();
    await until("rocket launched", () => item()?.state === "launched");
    assert.equal(stub.state.merges.length, 1, "one merge after the hold");
    assert.equal(stub.state.merges[0].sha, stub.state.headSha, "merged the approved head");
    assert.equal(item().inspection.humanApproved, true, "human approval recorded");
    assert.equal(item().inspection.stages.find(s => s.gate === "human").state, "passed", "human gate passed");
    report.finalItem = item();
  });
  await step("no silent provider fallback or browser errors", async () => {
    assert.deepEqual(stub.state.unexpected, []);
    assert.deepEqual(spark.unexpected, []);
    assert.deepEqual(apiErrors, []);
    assert.deepEqual(runnerErrors, []);
    assert.deepEqual(consoleErrors, []);
    for (const kind of ["triage", "scope", "plan", "review"]) assert.ok(spark.calls.includes(kind), kind);
  });
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

Object.assign(report, { totalMs: Date.now() - t0, steps, consoleErrors, apiErrors, repoPolls, expectedAnonymousErrors, runnerErrors, githubCalls: stub.state.calls, sparkCalls: spark.calls, unexpected: stub.state.unexpected, sparkUnexpected: spark.unexpected, factoryState, out });
writeFileSync(join(out, "timings.json"), JSON.stringify(report, null, 2));
for (const s of steps) console.log(`${s.ok ? "✓" : "✗"} ${s.name.padEnd(52)} ${(s.ms / 1000).toFixed(1)}s${s.error ? `  ${s.error}` : ""}`);
console.log(`total ${(report.totalMs / 1000).toFixed(1)}s · screenshots and timings.json in ${out}`);
process.exitCode = failed ? 1 : 0;
} finally {
  clearInterval(heartbeatTimer);
  await heartbeatPending;
  if (context) await context.tracing.stop({ path: join(out, "trace.zip") }).catch(() => {});
  await browser?.close();
  await mf?.dispose();
}

// The current 2D product has its own newcomer walk; keep it in the same CI check.
if (!process.exitCode) await import('./deck-first-run.mjs');
