// A player, not an admin: navigation and visible buttons only. Fixture setup is separate.
import { chromium } from "@playwright/test";
import { mkdir, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { resolve, join } from "node:path";
import { localFactory } from "./local.mjs";
const args = process.argv.slice(2).filter(x => x !== "--");
const option = (key, fallback) => { const i = args.indexOf(key); return i < 0 ? fallback : args[i + 1]; };
const persona = option("--persona", "test-newbie");
if (!/^test-(newbie|guest|midgame|broke|blocked)$/.test(persona)) throw new Error("Unknown persona");
const url = new URL(option("--url", "http://localhost:8809"));
if (!(url.origin === "https://shiptorio.dev" || ["localhost", "127.0.0.1"].includes(url.hostname))) throw new Error("Bot refuses production and unknown hosts");
const out = resolve(option("--out", `playtest/out/${new Date().toISOString().replace(/[:.]/g, "-")}-${persona}`));
await mkdir(out, { recursive: true });
const local = ["localhost", "127.0.0.1"].includes(url.hostname);
const steps = [], failures = [], frictions = [];
const friction = text => { if (!frictions.includes(text)) frictions.push(text); };
let observedLaunch = false;
let fixture, browser, lastPage;
try {
  if (local) fixture = await localFactory(persona, url.origin);
  browser = await chromium.launch({ headless: true, ...(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : { channel: "chromium" }), ...(process.platform === "linux" ? { args: ["--use-angle=swiftshader", "--enable-webgl", "--enable-unsafe-swiftshader"] } : {}) });
  for (const width of [390, 1280]) {
    const context = await browser.newContext({ viewport: { width, height: width === 390 ? 844 : 800 } });
    if (fixture) await context.route("https://github.com/**", route => fixture.stub.browser(route));
    const page = await context.newPage();
    lastPage = page;
    page.setDefaultTimeout(60000);
    const seenItems = new Map();
    page.on("websocket", socket => socket.on("framereceived", frame => {
      try {
        const event = JSON.parse(String(frame.payload));
        const items = event.type === "snapshot" ? event.state?.items : event.type === "patch" ? event.patch?.items : [];
        for (const item of items ?? []) {
          if (item.state === "launched" && seenItems.has(item.id) && seenItems.get(item.id) !== "launched") observedLaunch = true;
          seenItems.set(item.id, item.state);
        }
      } catch { /* Non-JSON heartbeat frames have no game state. */ }
    }));
    let admitted = false;
    page.on("pageerror", error => failures.push(`JS: ${error.message}`));
    page.on("console", msg => { if (msg.type() === "error" && (admitted || !/401/.test(msg.text()))) failures.push(`Console: ${msg.text()}`); });
    page.on("response", response => { if (response.url().startsWith(url.origin) && response.status() >= 400 && !(!admitted && response.status() === 401 && new URL(response.url()).pathname === "/test/login")) failures.push(`HTTP ${response.status()} ${new URL(response.url()).pathname}`); });
    let lastChange = Date.now(), previous = "", number = 0;
    const capture = async label => {
      const file = `${width}-${String(++number).padStart(2, "0")}-${label.replace(/[^a-z0-9-]+/gi, "-").slice(0, 60)}.png`;
      console.log(`Capture ${width}px: ${label}`);
      await page.screenshot({ path: join(out, file), timeout: 60000 }); steps.push({ width, label, file, url: page.url() });
    };
    await page.goto(`${url.origin}/test/login?as=${persona}`);
    if (await page.getByLabel("Password", { exact: true }).count()) {
      const password = local ? "isolated-bot-preview" : process.env.SHIPTORIO_TEST_PASSWORD;
      if (!password) throw new Error("Staging preview password is required in SHIPTORIO_TEST_PASSWORD");
      await page.getByLabel("Password", { exact: true }).fill(password);
      await Promise.all([
        page.waitForURL(current => current.pathname === "/" && current.searchParams.has("source"), { timeout: 20000 }),
        page.getByRole("button", { name: /Enter the factory/ }).click(),
      ]);
    }
    const login = await page.goto(`${url.origin}/test/login?as=${persona}`);
    if (login && login.status() >= 400) throw new Error(`Test login unavailable: HTTP ${login.status()}`);
    if (!local && width === 390) {
      const reset = await page.evaluate(async () => { const r = await fetch("/test/reset", { method: "POST" }); return { ok: r.ok, status: r.status }; });
      if (!reset.ok) throw new Error(`Isolated staging reset unavailable: HTTP ${reset.status}`);
      await page.goto(`${url.origin}/test/login?as=${persona}`);
    }
    admitted = true;
    if (fixture) { console.log("Seeding isolated persona"); await fixture.seed(); console.log("Persona seeded"); }
    await capture("signed-in");
    const deadline = Date.now() + Number(option("--duration", "180")) * 1000;
    while (Date.now() < deadline) {
      const text = await page.locator("body").innerText();
      if (observedLaunch && new URL(page.url()).searchParams.has("repo")) { await capture("launch-confirmed-over-socket"); break; }
      const fingerprint = createHash("sha256").update(text).digest("hex");
      if (fingerprint !== previous) { previous = fingerprint; lastChange = Date.now(); }
      const visible = async locator => (await locator.count()) && await locator.first().isVisible();
      const launch = page.locator("button.alaunch");
      const go = page.locator(".acard button.ago, button.ci-act.do");
      const later = page.locator(".acard button.alater, button.ci-act.later");
      const play = page.getByRole("button", { name: /^(Play|Skip|Enter the factory)$/i });
      const repo = page.getByRole("button", { name: new RegExp(`test-fixture/${persona}`) });
      const install = page.getByRole("link", { name: /install shiptorio on a repo/i });
      const closeSheet = page.locator(".sheet").getByRole("button", { name: "Close", exact: true });
      const checkin = page.getByRole("button", { name: /^Check in/i });
      const menu = page.getByRole("button", { name: /^Menu:/ });
      if (await visible(launch)) {
        await launch.first().focus(); await page.keyboard.down("Space"); await page.waitForTimeout(1000); await page.keyboard.up("Space"); await capture("held-launch");
      } else if (await visible(play)) { await play.first().click(); await capture("play"); }
      else if (await visible(repo)) {
        if (fixture) await fixture.startRunner((await context.cookies()).map(c => `${c.name}=${c.value}`).join("; "));
        await repo.first().click(); await capture("open-repo");
        await page.keyboard.press("Escape");
      }
      else if (await visible(install)) {
        const installUrl = new URL(await install.first().getAttribute("href"), url.origin);
        if (installUrl.origin !== url.origin || installUrl.pathname !== "/test/install") throw new Error("Refusing non-fixture install target");
        const next = context.waitForEvent("page"); await install.first().click(); const tab = await next;
        await tab.getByRole("button", { name: "Install", exact: true }).click(); await tab.close(); await capture("installed-fixture");
        await repo.first().waitFor({ state: "visible", timeout: 60000 });
      } else if (await visible(closeSheet)) { await closeSheet.first().click(); await capture("return-to-factory"); }
      else if (/Factory job budget reached/i.test(text) && await visible(later)) { friction(`${width}px: suggested plan hit the active-job budget; used Later to reach other work`); await later.first().click(); await capture("later-busy-plan"); }
      else if (await visible(go)) { await go.first().click(); await capture("continue"); }
      else if (await visible(later)) { await later.first().click(); await capture("later"); }
      else if (await visible(checkin) && await checkin.first().isEnabled()) { friction(`${width}px: no direct card action was visible; opened Check in to find waiting work`); await checkin.first().click(); await capture("open-check-in"); }
      else if (await visible(menu) && await menu.first().getAttribute("aria-expanded") === "false") { friction(`${width}px: opened Menu to find the next player action`); await menu.first().click(); await capture("open-menu"); }
      else if (Date.now() - lastChange > 60_000) { failures.push(`Stuck for 60 seconds at ${width}px: ${text.slice(0, 500)}`); await capture("stuck"); break; }
      await page.waitForTimeout(1000);
    }
    await capture("final"); await context.close();
  }
  if (fixture?.stub.state.unexpected.length) failures.push(...fixture.stub.state.unexpected.map(p => `Unexpected provider request: ${p}`));
  if (fixture?.runnerErrors.length) failures.push(...fixture.runnerErrors);
  if (fixture && persona === "test-newbie" && fixture.stub.state.merges.length === 0) failures.push("Fixture loop did not reach a player-approved Launch");
  if (persona === "test-newbie" && !observedLaunch) failures.push("No new launched state arrived from the real factory socket");
} catch (error) {
  failures.push(String(error));
  if (lastPage && !lastPage.isClosed()) {
    failures.push(`Screen: ${(await lastPage.locator("body").innerText().catch(() => "unavailable")).slice(0, 1500)}`);
    await lastPage.screenshot({ path: join(out, "failure.png"), timeout: 5000 }).catch(() => {});
  }
}
finally {
  const unique = [...new Set(failures)];
  const fingerprint = createHash("sha256").update(unique.slice().sort().join("\n")).digest("hex").slice(0, 16);
  const report = { persona, origin: url.origin, fixture: local, fixturePRs: fixture?.stub.state.pulls.length ?? null,
    fixtureMerges: fixture?.stub.state.merges.length ?? null, observedLaunch, receiptAttached: fixture?.stub.state.pulls.some(pr => pr.body?.includes("shiptorio-proof:")) ?? false,
    steps, frictions, failures: unique, fingerprint, passed: !unique.length };
  await writeFile(join(out, "report.json"), JSON.stringify(report, null, 2));
  await writeFile(join(out, "report.md"), `# Player bot: ${persona}\n\nOrigin: ${url.origin}. ${local ? "Real local Worker with GitHub/Spark fixtures; not production proof." : "Staging browser run."}\n\n${unique.length ? "FAIL" : "PASS"}\n\n${unique.map(f => `- ${f}`).join("\n")}\n\n## Extra steps observed\n\n${frictions.length ? frictions.map(f => `- ${f}`).join("\n") : "None."}\n\n## Screenshots\n\n${steps.map(s => `- ${s.width}px: ${s.label} — [screenshot](${s.file})`).join("\n")}\n`);
  console.log(JSON.stringify({ report: join(out, "report.md"), failures: unique.length, fingerprint }));
  if (unique.length) process.exitCode = 1;
  await browser?.close();
  if (fixture) await Promise.race([fixture.dispose(), new Promise(resolve => setTimeout(resolve, 5000))]);
}
