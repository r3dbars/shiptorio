// A player, not an admin: navigation and visible buttons only. Fixture setup is separate.
import { chromium } from "@playwright/test";
import { mkdir, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { resolve, join } from "node:path";
import { safeReportFailure, safeReportValue } from "./safe-report.mjs";
import { localFactory } from "./local.mjs";
import { playerAction, fixtureCardIntent, fixtureDecisionDeck } from "./player-action.mjs";
import { createLaunchTracker } from "./launch-tracker.mjs";
import { botAdmissionPath, prepareBotPersona, deckFixtureIdentity, FIXTURE_INSTALL, isFixtureInstallPage } from "./setup.mjs";
const args = process.argv.slice(2).filter(x => x !== "--");
const option = (key, fallback) => { const i = args.indexOf(key); return i < 0 ? fallback : args[i + 1]; };
const persona = option("--persona", "test-newbie");
if (!/^test-(newbie|guest|midgame|broke|blocked)$/.test(persona)) throw new Error("Unknown persona");
const url = new URL(option("--url", "http://localhost:8809"));
if (!(url.origin === "https://shiptorio.dev" || ["localhost", "127.0.0.1"].includes(url.hostname))) throw new Error("Bot refuses production and unknown hosts");
const out = resolve(option("--out", `playtest/out/${new Date().toISOString().replace(/[:.]/g, "-")}-${persona}`));
await mkdir(out, { recursive: true });
const local = ["localhost", "127.0.0.1"].includes(url.hostname);
const steps = [], failures = [], frictions = [], actions = [];
const friction = text => { if (!frictions.includes(text)) frictions.push(text); };
const launchTracker = createLaunchTracker({ origin: url.origin, repo: `test-fixture/${persona}` });
let fixture, browser, lastPage;
try {
  if (local) fixture = await localFactory(persona, url.origin);
  browser = await chromium.launch({ headless: true, ...(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : { channel: "chromium" }), ...(process.platform === "linux" ? { args: ["--use-angle=swiftshader", "--enable-webgl", "--enable-unsafe-swiftshader"] } : {}) });
  for (const width of [390, 1280]) {
    // The pixel deck animates every frame; under CI software GL that starves page.screenshot.
    const context = await browser.newContext({ viewport: { width, height: width === 390 ? 844 : 800 }, reducedMotion: "reduce" });
    if (fixture) await context.route("https://github.com/**", route => fixture.stub.browser(route));
    else await context.route("https://github.com/**", async route => {
      if (route.request().url() === FIXTURE_INSTALL) await route.fulfill({ status: 302, headers: { location: `${url.origin}/test/install` } });
      else { failures.push("Unexpected GitHub navigation outside the isolated fixture"); await route.abort(); }
    });
    await context.route(`${url.origin}/api/me`, async route => {
      const response = await route.fetch();
      if (!response.ok()) { await route.fulfill({ response }); return; }
      await route.fulfill({ response, json: deckFixtureIdentity(await response.json(), persona) });
    });
    const page = await context.newPage();
    lastPage = page;
    page.setDefaultTimeout(60000);
    const viewportLaunch = launchTracker.viewport(width);
    let wireDeck = [];
    const wireItems = new Map();
    const launchConfirmed = viewportLaunch.promise;
    const noFactoryReceipt = new Promise(() => {});
    const inFactory = () => new URL(page.url()).searchParams.get("repo") === `test-fixture/${persona}`;
    page.on("websocket", socket => {
      const observe = viewportLaunch.socket(socket.url());
      socket.on("framereceived", frame => {
        try {
          const message = JSON.parse(String(frame.payload));
          observe(message);
          wireDeck = fixtureDecisionDeck(wireDeck, message);
          for (const item of message.state?.items ?? message.patch?.items ?? []) wireItems.set(item.id, item.state);
        }
        catch { /* Non-JSON heartbeat frames have no game state. */ }
      });
    });
    let admitted = false;
    const admissionPath = botAdmissionPath({ local, persona, width });
    page.on("pageerror", error => failures.push(`JS: ${error.message}`));
    page.on("console", msg => { if (msg.type() === "error" && (admitted || !/401/.test(msg.text()))) failures.push(`Console: ${msg.text()}`); });
    page.on("response", response => { if (response.url().startsWith(url.origin) && response.status() >= 400 && !(!admitted && response.status() === 401 && new URL(response.url()).pathname === admissionPath)) failures.push(`HTTP ${response.status()} ${new URL(response.url()).pathname}`); });
    let lastChange = Date.now(), previous = "", number = 0;
    const capture = async label => {
      const file = `${width}-${String(++number).padStart(2, "0")}-${label.replace(/[^a-z0-9-]+/gi, "-").slice(0, 60)}.png`;
      console.log(`Capture ${width}px: ${label}`);
      await page.waitForLoadState("domcontentloaded");
      if (new URL(page.url()).origin === url.origin && new URL(page.url()).pathname === "/deck") await page.locator('[data-deck-ready="1"]').waitFor({ timeout: 30000 });
      await page.screenshot({ path: join(out, file), timeout: 60000 }); steps.push({ width, label, file, url: page.url() });
    };
    await prepareBotPersona({ page, context, origin: url.origin, persona, local, width,
      password: local ? "isolated-bot-preview" : process.env.SHIPTORIO_TEST_PASSWORD });
    admitted = true;
    if (fixture) { console.log("Seeding isolated persona"); await fixture.seed(); console.log("Persona seeded"); }
    // The product is the 2D deck. Never silently exercise the retired root UI.
    await page.goto(`${url.origin}/deck?source=live`);
    await page.locator('[data-deck-ready="1"]').waitFor({ timeout: 30000 });
    await capture("signed-in");
    const deadline = Date.now() + Number(option("--duration", "180")) * 1000;
    while (Date.now() < deadline) {
      const text = await page.locator("body").innerText();
      if (viewportLaunch.confirmed && inFactory()) { await capture("launch-confirmed-over-socket"); break; }
      const fingerprint = createHash("sha256").update(text).digest("hex");
      if (fingerprint !== previous) { previous = fingerprint; lastChange = Date.now(); }
      if (Date.now() - lastChange > 60_000) { failures.push(`Stuck for 60 seconds at ${width}px: ${text.slice(0, 500)}`); await capture("stuck"); break; }
      const visible = async locator => (await locator.count()) && await locator.first().isVisible();
      const launch = page.locator(".ic-card:not(.ic-ghost).hold button.approve, button.alaunch");
      const go = page.locator(".ic-card:not(.ic-ghost):not(.hold) button.approve, .acard button.ago, button.ci-act.do");
      const later = page.locator(".ic-card:not(.ic-ghost) button.later, .acard button.alater, button.ci-act.later");
      const play = page.getByRole("button", { name: /^(Play|Skip|Enter the factory)$/i });
      const repo = page.getByRole("button", { name: new RegExp(`^(Use this repo|test-fixture/${persona})$`) });
      const installButton = page.getByRole("button", { name: "Install", exact: true });
      const install = page.getByRole("link", { name: /install shiptorio on a repo/i });
      const closeSheet = page.locator(".sheet").getByRole("button", { name: "Close", exact: true });
      const checkin = page.getByRole("button", { name: /^Check in/i });
      const menu = page.getByRole("button", { name: /^Menu:/ });
      let stuck = false;
      const completed = await playerAction(async () => {
      if (await visible(launch)) {
        await launch.first().focus(); await page.keyboard.down("Space");
        try { await launch.first().waitFor({ state: "hidden", timeout: 10000 }); }
        finally { await page.keyboard.up("Space"); }
        await capture("held-launch");
      } else if (await visible(installButton)) {
        const target = new URL(page.url());
        if (!(target.origin === url.origin && target.pathname === "/test/install") && !(local && target.origin === "https://github.com")) throw new Error("Refusing non-fixture install target");
        await Promise.all([
          page.waitForURL(current => current.origin === url.origin && current.pathname !== "/test/install", { timeout: 30000, waitUntil: "domcontentloaded" }),
          installButton.click(),
        ]);
        await page.goto(`${url.origin}/deck?source=live`);
        await page.locator('[data-deck-ready="1"]').waitFor({ timeout: 30000 });
        await capture("installed-fixture");
      } else if (await visible(go) && /^Connect GitHub/.test(await go.first().innerText())) {
        await Promise.all([page.waitForURL(current => isFixtureInstallPage(current, url.origin), { timeout: 30000, waitUntil: "domcontentloaded" }), go.first().click()]);
        await capture("github-install");
      } else if (await visible(play)) { await play.first().click(); await capture("play"); }
      else if (await visible(repo)) {
        if (fixture) await fixture.startRunner((await context.cookies()).map(c => `${c.name}=${c.value}`).join("; "));
        await Promise.all([page.waitForURL(current => current.searchParams.get("repo") === `test-fixture/${persona}`, { timeout: 30000 }), repo.first().click()]);
        await page.locator('[data-deck-ready="1"]').waitFor({ timeout: 30000 });
        await capture("open-repo");
      }
      else if (await visible(install)) {
        const installUrl = new URL(await install.first().getAttribute("href"), url.origin);
        if (installUrl.origin !== url.origin || installUrl.pathname !== "/test/install") throw new Error("Refusing non-fixture install target");
        const next = context.waitForEvent("page"); await install.first().click(); const tab = await next;
        await tab.getByRole("button", { name: "Install", exact: true }).click(); await tab.close(); await capture("installed-fixture");
        await repo.first().waitFor({ state: "visible", timeout: 60000 });
      } else if (await visible(closeSheet)) { await closeSheet.first().click(); await capture("return-to-factory"); }
      else if (/Factory job budget reached/i.test(text) && await visible(later)) { friction(`${width}px: suggested plan hit the active-job budget; used Later to reach other work`); await later.first().click(); await capture("later-busy-plan"); }
      else if (await visible(go)) {
        const label = await go.first().innerText();
        const title = await go.first().evaluate(button => button.closest(".ic-card")?.querySelector(".ic-title")?.textContent ?? "");
        const move = wireDeck.find(move => move.title === title);
        const option = move?.options.find(option => option.recommended);
        const intent = fixtureCardIntent(label, title, option?.actions.map(action => action.tool) ?? []);
        if (intent !== "wait") {
          actions.push({ width, title, label, intent, moveId: move?.id ?? null, tools: option?.actions.map(action => action.tool) ?? [], items: Object.fromEntries(wireItems) });
          await go.first().click(); await capture(intent);
        }
      }
      else if (await visible(later)) { await later.first().click(); await capture("later"); }
      else if (await visible(checkin) && await checkin.first().isEnabled()) { friction(`${width}px: no direct card action was visible; opened Check in to find waiting work`); await checkin.first().click(); await capture("open-check-in"); }
      else if (await visible(menu) && await menu.first().getAttribute("aria-expanded") === "false") { friction(`${width}px: opened Menu to find the next player action`); await menu.first().click(); await capture("open-menu"); }
      else if (Date.now() - lastChange > 60_000) { failures.push(`Stuck for 60 seconds at ${width}px: ${text.slice(0, 500)}`); await capture("stuck"); stuck = true; }
      }, inFactory() ? launchConfirmed : noFactoryReceipt);
      if (completed) { await capture("launch-confirmed-over-socket"); break; }
      if (stuck) break;
      // Wake on a real UI state change, with a bounded polling deadline for long jobs.
      await page.waitForFunction(before => document.body.innerText !== before, text, { timeout: 5000 }).catch(error => {
        if (error.name !== "TimeoutError") throw error;
      });
    }
    if (persona === "test-newbie" && !viewportLaunch.confirmed) failures.push(`No confirmed Launch receipt at ${width}px`);
    await capture("final"); await context.close();
  }
  if (fixture?.stub.state.unexpected.length) failures.push(...fixture.stub.state.unexpected.map(p => `Unexpected provider request: ${p}`));
  if (fixture?.runnerErrors.length) failures.push(...fixture.runnerErrors);
  if (fixture && persona === "test-newbie" && fixture.stub.state.merges.length === 0) failures.push("Fixture loop did not reach a player-approved Launch");
  if (persona === "test-newbie" && !launchTracker.observedLaunch) failures.push("No new launched state arrived from the real factory socket");
} catch (error) {
  failures.push(safeReportFailure(error));
  if (lastPage && !lastPage.isClosed()) {
    failures.push(`Screen: ${(await lastPage.locator("body").innerText().catch(() => "unavailable")).slice(0, 1500)}`);
    await lastPage.screenshot({ path: join(out, "failure.png"), timeout: 5000 }).catch(() => {});
  }
}
finally {
  const unique = [...new Set(failures.map(safeReportFailure))];
  const fingerprint = createHash("sha256").update(unique.slice().sort().join("\n")).digest("hex").slice(0, 16);
  const report = { persona, origin: url.origin, fixture: local, fixturePRs: fixture?.stub.state.pulls.length ?? null,
    fixtureMerges: fixture?.stub.state.merges.length ?? null, observedLaunch: launchTracker.observedLaunch, viewportLaunches: launchTracker.results(), receiptAttached: fixture?.stub.state.pulls.some(pr => pr.body?.includes("shiptorio-proof:")) ?? false,
    steps, actions, frictions, failures: unique, fingerprint, passed: !unique.length };
  await writeFile(join(out, "report.json"), JSON.stringify(safeReportValue(report), null, 2));
  await writeFile(join(out, "report.md"), `# Player bot: ${persona}\n\nOrigin: ${url.origin}. ${local ? "Real local Worker with GitHub/Spark fixtures; not production proof." : "Staging browser run."}\n\n${unique.length ? "FAIL" : "PASS"}\n\n${unique.map(f => `- ${f}`).join("\n")}\n\n## Extra steps observed\n\n${frictions.length ? frictions.map(f => `- ${f}`).join("\n") : "None."}\n\n## Screenshots\n\n${steps.map(s => `- ${s.width}px: ${s.label} — [screenshot](${s.file})`).join("\n")}\n`);
  console.log(JSON.stringify({ report: join(out, "report.md"), failures: unique.length, fingerprint }));
  if (unique.length) process.exitCode = 1;
  await browser?.close();
  if (fixture) await Promise.race([fixture.dispose(), new Promise(resolve => setTimeout(resolve, 5000))]);
}
