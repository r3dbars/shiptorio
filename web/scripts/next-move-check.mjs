// "One more turn" check (#105): play the sim for 10 rockets and require a Next Move card on screen
// within 2s after every launch. Also saves desktop + phone screenshots of the card after the last launch.
//   bun run dev:web   then   node web/scripts/next-move-check.mjs [baseUrl] [outDir]
import { createRequire } from "node:module";
import { mkdirSync, writeFileSync } from "node:fs";

const require = createRequire(import.meta.url);
const { chromium } = require("playwright");
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
    while (!(await launch.isEnabled())) {
      if (Date.now() - t0 > GIVE_UP_MS) {
        await page.screenshot({ path: `${out}/${label}-stuck-${n}.png` });
        results.push({ rocket: n, ok: false, why: "no PR reached the pad in 90s" });
        return results;
      }
      const sugg = card.locator("button.rec").first();
      if ((await sugg.count()) && (await sugg.isVisible())) {
        const text = (await sugg.innerText()).toLowerCase();
        // the "launch it" nudge clicks the same thing as the dock button; anything that opens a sheet we close again
        if (!text.includes("launch")) {
          await sugg.click().catch(() => {});
          await page.keyboard.press("Escape");
          await page.locator('.sheet button[aria-label="Close"], .station-panel button[aria-label="Close"]').first().click({ timeout: 300 }).catch(() => {});
        }
      }
      await page.waitForTimeout(400);
    }
    await launch.click();
    const at = Date.now();
    const seen = await card.first().waitFor({ state: "visible", timeout: WITHIN_MS }).then(() => Date.now() - at, () => null);
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
