// Keyboard-only playthrough: the welcome tour, then the first run in the sim, up to a launched rocket.
// No mouse, no clicks: only Tab, Shift+Tab, Enter, Space and the game's own keys. Every press is logged.
// Run with the dev server up (bun run dev:web), then: node web/test/a11y/keyboard.mjs [baseUrl]
import { createRequire } from "node:module";
import { mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const { chromium } = createRequire(import.meta.url)("@playwright/test");
const here = dirname(fileURLToPath(import.meta.url));
const out = join(here, "out");
mkdirSync(out, { recursive: true });
const base = process.argv[2] ?? "http://localhost:5173/";

// What to press next, best first. The first one that's on screen and enabled gets reached with Tab and pressed.
const NEXT = [
  /^Ship #|^Ship it$/i,
  /Let these ship on their own/i,
  /^Add a check on/i,
  /^Connect Sentry/i,
  /^Launch/i,
  /Start your factory/i,
  /^Next$/i,
  /Let me build/i,
  /^Got it/i,
  /^Continue/i,
  /^Sign in/i,
  /^Place/i,
  /Do it|Build it|Suggested/i,
];

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
// a rocket in the welcome tour, then another in the first run on the player's own factory
const ships = { tour: 0, game: 0 };
let shipped = false;
await page.exposeFunction("__shipped", (url) => {
  ships[url.includes("scenario=intro") ? "tour" : "game"]++;
  shipped = ships.tour > 0 && ships.game > 0;
});
await page.addInitScript(() => window.addEventListener("shiptorio:ship", () => window.__shipped(location.href)));
await page.goto(base + "?source=sim&scenario=intro");
await page.waitForTimeout(2000);

const focusedName = () =>
  page.evaluate(() => {
    const el = document.activeElement;
    return el && el !== document.body ? (el.getAttribute("aria-label") || el.textContent || el.tagName).trim().replace(/\s+/g, " ").slice(0, 70) : "";
  });
const targets = () =>
  page.evaluate(() =>
    [...document.querySelectorAll("button, a[href]")]
      .filter((e) => !e.disabled && e.getClientRects().length && getComputedStyle(e).visibility !== "hidden")
      .map((e) => (e.getAttribute("aria-label") || e.textContent || "").trim().replace(/\s+/g, " ")),
  );

let presses = 0;
for (let step = 0; step < 120 && !shipped; step++) {
  const names = await targets();
  const want = NEXT.map((re) => names.find((n) => re.test(n))).find(Boolean);
  if (!want) {
    if (step % 5 === 0) console.log(`  waiting; on screen: ${names.join(" | ").slice(0, 300)}`);
    await page.waitForTimeout(1500); // the sim is still moving; nothing to press yet
    continue;
  }
  // Tab until the keyboard is on it (both directions, so we never rely on a mouse to get there)
  let ok = false;
  for (let t = 0; t < 80 && !ok; t++) {
    ok = (await focusedName()) === want.slice(0, 70);
    if (!ok) {
      await page.keyboard.press("Tab");
      presses++;
    }
  }
  if (!ok) throw new Error(`could not reach "${want}" with Tab`);
  await page.keyboard.press("Enter");
  presses++;
  console.log(`step ${step}: Enter on "${want}"  (${page.url().split("?")[1]})`);
  await page.waitForTimeout(1800);
}

await page.waitForTimeout(3000);
await page.screenshot({ path: join(out, "keyboard-launch.png") });
console.log(`${shipped ? "✓" : "✗"} keyboard only, ${presses} key presses: ${ships.tour} rocket(s) in the tour, ${ships.game} in the first run`);
await browser.close();
process.exit(shipped ? 0 : 1);
