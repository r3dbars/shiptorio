// Accessibility audit: axe-core on the deck (web/deck.html), the game players actually see, in a real browser.
// Run with the dev server up (bun run dev:web), then: node web/test/a11y/audit.mjs [baseUrl]
// Exits non-zero on any serious or critical violation, or a card button without a name.
// Screenshots land in web/test/a11y/out/. CHROMIUM_PATH=/path/to/chrome picks a browser binary.
import { readFileSync, mkdirSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

// Use the Playwright package declared at the workspace root, including in a fresh install.
const { chromium } = createRequire(import.meta.url)("@playwright/test");
const here = dirname(fileURLToPath(import.meta.url));
const axe = readFileSync(createRequire(import.meta.url).resolve("axe-core/axe.min.js"), "utf8");
const base = process.argv[2] ?? "http://localhost:5173/";
const out = join(here, "out");
mkdirSync(out, { recursive: true });

const DESK = { width: 1280, height: 720 };
const PHONE = { width: 390, height: 844 };
const CARD = ".ic-card:not(.ic-ghost)";

// name, query, viewport, how many story approvals to make first, whether a card must be on screen
const SCREENS = [
  ["story-first-card", "deck.html?speed=4&seed=1", DESK, 0, true],
  ["story-first-card-phone", "deck.html?speed=4&seed=1", PHONE, 0, true],
  ["story-second-card", "deck.html?speed=4&seed=1", DESK, 1, true],
  ["story-third-card", "deck.html?speed=4&seed=1", DESK, 2, true],
  ["sim-ship-it", "deck.html?source=sim&speed=4", DESK, 0, true],
  ["sim-ship-it-phone", "deck.html?source=sim&speed=4", PHONE, 0, true],
  ["demo", "deck.html?source=demo", DESK, 0, false],
];

const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
let bad = 0;
for (const [name, q, viewport, approvals, needsCard] of SCREENS) {
  const page = await browser.newPage({ viewport });
  page.setDefaultTimeout(40000);
  await page.goto(base + q);
  try {
    for (let i = 0; i < approvals; i++) {
      const title = await page.locator(`${CARD} h2`).textContent({ timeout: 40000 });
      await page.locator(`${CARD} button.approve:not([disabled])`).click();
      await page.waitForFunction((t) => document.querySelector(".ic-card:not(.ic-ghost) h2")?.textContent !== t, title);
    }
    if (needsCard) await page.waitForSelector(`${CARD} button.approve:not([disabled])`);
    else await page.waitForTimeout(3000);
    await page.waitForTimeout(800);
  } catch (e) {
    console.log(`✗ ${name}: could not open (${e.message.split("\n")[0]})`);
    bad++;
    await page.close();
    continue;
  }
  await page.screenshot({ path: join(out, `${name}.png`) });
  // Fades are finished first: a caption halfway in or out isn't text anyone has to read.
  await page.addStyleTag({ content: "*{transition:none !important; animation:none !important}" });
  await page.waitForTimeout(100);
  await page.addScriptTag({ content: axe });
  const res = await page.evaluate(() => window.axe.run(document, { resultTypes: ["violations"] }));
  const serious = res.violations.filter((v) => v.impact === "serious" || v.impact === "critical");
  // The card's two buttons are the whole game: each needs a name a screen reader can say.
  const unnamed = needsCard ? await page.evaluate(() =>
    [...document.querySelectorAll(".ic-card:not(.ic-ghost) button")].filter((b) => !(b.getAttribute("aria-label") || b.textContent || "").trim()).length) : 0;
  console.log(`${serious.length || unnamed ? "✗" : "✓"} ${name}: ${serious.length} serious/critical, ${res.violations.length - serious.length} minor${unnamed ? `, ${unnamed} unnamed card buttons` : ""}`);
  for (const v of res.violations) {
    console.log(`   [${v.impact}] ${v.id}: ${v.help}`);
    for (const n of v.nodes.slice(0, 4)) console.log(`      ${n.target.join(" ")}  ${(n.failureSummary ?? "").split("\n").slice(1, 2).join("").trim().slice(0, 140)}`);
  }
  bad += serious.length + unnamed;
  await page.close();
}
await browser.close();
process.exit(bad ? 1 : 0);
