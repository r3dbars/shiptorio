// Screenshots of the shaft dev harness (web/shaft.html) for module work and side-by-sides with the mockup.
// Needs the dev server: `cd web && bunx vite --port 5173` (or pass --base=http://host:port).
//   node web/scripts/shaft-shot.mjs --out=/tmp/me/shot [--views=stack,build,station:asm-1] [--q=only=world,belts&asm=1]
//        [--warm=20] [--mobile | --w=1440 --h=900] [--px=1] [--verify] [--seed=7] [--hud=0]
// Writes <out>-<view>.png per view and prints draw calls, triangles, build/bake times, the line's stats,
// module load failures and console errors. Headless Chromium draws with SwiftShader (CPU): slow but exact.
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { chromium } = require("playwright");

const o = Object.fromEntries(process.argv.slice(2).map((a) => { const [k, ...v] = a.replace(/^--/, "").split("="); return [k, v.length ? v.join("=") : true]; }));
const base = o.base ?? "http://localhost:5173";
const out = o.out ?? "/tmp/shaft";
const views = String(o.views ?? "build").split(",").filter(Boolean);
const warm = Number(o.warm ?? 20);
const vp = o.mobile ? { width: 390, height: 844 } : { width: Number(o.w ?? 1440), height: Number(o.h ?? 900) };
const params = new URLSearchParams(o.q ? String(o.q) : "");
params.set("seed", String(o.seed ?? 7));
params.set("raf", "0");
if (o.verify) params.set("verify", "1");
if (o.px !== undefined) params.set("px", String(o.px));
if (o.hud !== undefined) params.set("hud", String(o.hud));

const browser = await chromium.launch({ args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-webgl", "--ignore-gpu-blocklist", "--enable-unsafe-swiftshader"] });
const page = await browser.newPage({ viewport: vp, deviceScaleFactor: 1 });
page.setDefaultTimeout(240000);
const errs = [];
page.on("pageerror", (e) => errs.push("PAGEERROR " + e.message));
page.on("console", (m) => { if (m.type() === "error" || m.type() === "warning") errs.push(m.type() + ": " + m.text().slice(0, 400)); });
const t0 = Date.now();
await page.goto(`${base}/shaft.html?${params}`, { waitUntil: "load" });
await page.waitForFunction(() => window.SHAFT?.ready || /FAILED/.test(document.getElementById("loading")?.textContent ?? ""), null, { timeout: 240000 });
const failed = await page.evaluate(() => (window.SHAFT ? null : document.getElementById("loading")?.textContent));
if (failed) {
  console.log(failed);
  console.log(errs.join("\n"));
  await browser.close();
  process.exit(1);
}
const boot = await page.evaluate(() => ({ mods: window.SHAFT.mods, buildMs: Math.round(window.SHAFT.buildMs), bake: window.SHAFT.bake, verify: window.SHAFT.verify }));
console.log(`ready in ${Date.now() - t0} ms · build ${boot.buildMs} ms · bake ${JSON.stringify(boot.bake)}`);
console.log(`modules: ${boot.mods.loaded.join(", ") || "(none)"}${boot.mods.failed.length ? " · FAILED: " + boot.mods.failed.join(", ") : ""}`);
if (boot.verify) {
  const v = boot.verify;
  console.log(v.length ? `verify: ${v.length} moving things not marked K.dyn:` : "verify: everything that moves is marked");
  for (const x of v.slice(0, 60)) console.log(`  ${x.where} (${x.type}) at ${x.at.join(",")}`);
}
await page.evaluate((w) => window.SHAFT.advance(w), warm);
for (const v of views) {
  await page.evaluate((view) => { window.SHAFT.setView(view); window.SHAFT.render(); }, v);
  const info = await page.evaluate(() => window.SHAFT.info());
  const file = `${out}-${v.replace(/[:/]/g, "_")}.png`;
  await page.screenshot({ path: file });
  console.log(`${v}: ${info.calls} draw calls · ${Math.round(info.triangles / 1000)}k triangles · ${info.programs} programs → ${file}`);
}
console.log("stats " + JSON.stringify(await page.evaluate(() => window.SHAFT.stats())));
console.log(errs.length ? errs.slice(0, 30).join("\n") : "no console errors");
await browser.close();
