// Accessibility audit: axe-core on the key screens of the sim, in a real browser.
// Run with the dev server up (bun run dev:web), then: node web/test/a11y/audit.mjs [baseUrl]
// Exits non-zero on any serious or critical violation. Screenshots land in web/test/a11y/out/.
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

// name, query, then an optional step that opens the thing to check
const SCREENS = [
  ["onboarding", ""],
  ["sign-in", "?onboard=repo"],
  ["intro", "?source=sim&scenario=intro"],
  ["map", "?source=sim&scenario=heal"],
  ["deck", "?source=sim&scenario=checkin"],
  ["deck-details", "?source=sim&scenario=checkin", async (p) => p.keyboard.press("ArrowUp")],
  ["tray", "?source=sim&scenario=heal", async (p) => p.getByRole("button", { name: /^Activity/ }).click()],
  ["line", "?source=sim&scenario=heal", async (p) => p.getByRole("button", { name: /Line$/ }).click()],
  ["power", "?source=sim&scenario=heal", async (p) => p.getByRole("button", { name: /Power$/ }).click()],
  ["guide", "?source=sim&scenario=heal", async (p) => p.getByRole("button", { name: /^Field guide/ }).click()],
  ["station", "?source=sim&scenario=heal", async (p) => p.getByRole("button", { name: "Factory status as text" }).click().then(() => p.locator(".a11y-view button.lrow").first().click())],
  ["status", "?source=sim&scenario=heal", async (p) => p.keyboard.press("t")],
  ["thinks", "?source=sim&scenario=heal&thinks"],
  ["research", "?source=sim&scenario=research", async (p) => p.getByRole("button", { name: /^Research/ }).click()],
];

const browser = await chromium.launch();
let bad = 0;
for (const [name, q, open] of SCREENS) {
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  page.setDefaultTimeout(8000);
  await page.goto(base + q);
  await page.waitForTimeout(2500);
  try {
    if (open) await open(page);
    await page.waitForTimeout(800);
  } catch (e) {
    console.log(`✗ ${name}: could not open (${e.message.split("\n")[0]})`);
    bad++;
    await page.close();
    continue;
  }
  await page.screenshot({ path: join(out, `${name}.png`) });
  // Contrast can't be judged over a WebGL canvas, so axe sees the HUD over the map's darkest backdrop (the void).
  // Fades are finished first: a toast or caption halfway in or out isn't text anyone has to read.
  await page.addStyleTag({ content: "canvas.map{visibility:hidden} html,body,#root,.app,.floor{background:#1b2448 !important} *{backdrop-filter:none !important; transition:none !important; animation:none !important}" });
  await page.waitForTimeout(100);
  await page.addScriptTag({ content: axe });
  const res = await page.evaluate(() => window.axe.run(document, { resultTypes: ["violations"] }));
  const serious = res.violations.filter((v) => v.impact === "serious" || v.impact === "critical");
  console.log(`${serious.length ? "✗" : "✓"} ${name}: ${serious.length} serious/critical, ${res.violations.length - serious.length} minor`);
  for (const v of res.violations) {
    console.log(`   [${v.impact}] ${v.id}: ${v.help}`);
    for (const n of v.nodes.slice(0, 4)) console.log(`      ${n.target.join(" ")}  ${(n.failureSummary ?? "").split("\n").slice(1, 2).join("").trim().slice(0, 140)}`);
  }
  bad += serious.length;
  await page.close();
}
await browser.close();
process.exit(bad ? 1 : 0);
