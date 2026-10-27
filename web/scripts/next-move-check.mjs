// "One more turn" check (#105): play the sim for 10 rockets and require a Next Move card on screen
// within 2s after every launch. Also saves desktop + phone screenshots of the card after the last launch.
//   bun run dev:web   then   node web/scripts/next-move-check.mjs [baseUrl] [outDir]
import { createRequire } from "node:module";
import { mkdirSync, writeFileSync } from "node:fs";

const require = createRequire(import.meta.url);
const { chromium } = require("@playwright/test");
const base = process.argv[2] ?? "http://localhost:5173";
const out = process.argv[3] ?? "playtest-results/next-move";
const ROCKETS = Number(process.env.ROCKETS ?? 10);
const WITHIN_MS = 2000;
const GIVE_UP_MS = 90_000; // no launch possible for this long = the game went quiet
mkdirSync(out, { recursive: true });

async function play(page, label) {
  await page.goto(`${base}/?source=sim&scenario=quiet-morning`);
  await page.waitForSelector(".dock");
  const launch = page.getByRole("button", { name: "Launch the PR on the pad" });
  const card = page.locator('section[aria-label="Next move"]');
  const results = [];
  for (let n = 1; n <= ROCKETS; n++) {
    const t0 = Date.now();
    // keep the factory moving the way a player would: take the suggested option until a PR is on the pad
    let viaCard = false; // a "Launch #N" card launches the same way the dock button does
    let launchedCard = ""; // that card's text: it must be replaced, not just still on screen
    while (!viaCard && !(await launch.isEnabled())) {
      if (Date.now() - t0 > GIVE_UP_MS) {
        await page.screenshot({ path: `${out}/${label}-stuck-${n}.png` });
        results.push({ rocket: n, ok: false, why: "no PR reached the pad in 90s" });
        return results;
      }
      const sugg = card.locator("button.rec").first();
      const nudge = (await card.first().getAttribute("data-nudge", { timeout: 200 }).catch(() => null)) ?? "";
      // station panels are bottom sheets on phones; the line moves without opening them
      if (!nudge.startsWith("station:") && (await sugg.count()) && (await sugg.isVisible())) {
        const text = (await sugg.innerText()).toLowerCase();
        // the "launch it" nudge clicks the same thing as the dock button; anything that opens a sheet we close again
        if (text.includes("launch")) {
          launchedCard = await card.first().innerText().catch(() => "");
          await sugg.click().catch(() => {});
          viaCard = true;
          break;
        } else {
          await sugg.click().catch(() => {});
          await page.keyboard.press("Escape");
          await page.locator('.sheet button[aria-label="Close"], .sp-close').first().click({ timeout: 300 }).catch(() => {});
        }
      }
      await page.waitForTimeout(400);
    }
    if (!viaCard) {
      // close any station panel left open (on phones it's a bottom sheet over the dock)
      for (let k = 0; k < 5 && (await page.locator(".stationpanel").count()); k++) {
        await page.locator(".sp-close").first().click({ timeout: 1000 }).catch(() => page.keyboard.press("Escape"));
        await page.waitForTimeout(300);
      }
      if (!(await launch.click({ timeout: 5000 }).then(() => true, () => false))) {
        n--; // the pad emptied under us (an auto-launch); try this rocket again
        continue;
      }
    }
    const at = Date.now();
    // a card counts once it's on screen and isn't the launch card we just answered. A stray tap can open a
    // station sheet on phones (it covers the card by design), so close one if it shows up while we wait.
    let seen = null;
    while (Date.now() - at < WITHIN_MS) {
      if (await page.locator(".stationpanel").count()) await page.locator(".sp-close").first().click({ timeout: 300 }).catch(() => {});
      const ok = await page.evaluate((stale) => {
        const el = document.querySelector('section[aria-label="Next move"]');
        return !!el && el.getBoundingClientRect().height > 0 && el.innerText !== stale;
      }, launchedCard || null);
      if (ok) {
        seen = Date.now() - at;
        break;
      }
      await page.waitForTimeout(50);
    }
    const title = seen !== null ? (await card.first().locator(".nm-title").innerText().catch(() => "")) : "";
    results.push({ rocket: n, ok: seen !== null, ms: seen, card: title });
    console.log(`${label} rocket ${n}: ${seen !== null ? `next move in ${seen}ms: ${title}` : "NO next move within 2s"}`);
    if (n === ROCKETS) {
      await page.waitForTimeout(1200);
      await page.screenshot({ path: `${out}/${label}-after-${n}.png` });
    }
  }
  return results;
}

const browser = await chromium.launch();
const report = {};
for (const [label, opts] of [
  ["desktop", { viewport: { width: 1440, height: 900 } }],
  ["phone", { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true }],
]) {
  if (process.env.ONLY && process.env.ONLY !== label) continue;
  const page = await (await browser.newContext(opts)).newPage();
  report[label] = await play(page, label);
}
await browser.close();
writeFileSync(`${out}/report.json`, JSON.stringify(report, null, 2));
const bad = Object.values(report).flat().filter((r) => !r.ok);
console.log(bad.length ? `FAIL: ${bad.length} launches without a next move` : `PASS: next move within ${WITHIN_MS}ms after all ${ROCKETS} rockets`);
process.exit(bad.length ? 1 : 0);
