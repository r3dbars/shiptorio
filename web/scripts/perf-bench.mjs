// Perf bench: serves web/dist gzipped, then loads the game in Playwright as a desktop and as
// a mid-range phone (Pixel 7 viewport, 4x CPU throttle, slow 4G) and prints load + frame numbers.
//   bun run build && node web/scripts/perf-bench.mjs [scenario]
// Headless Chromium draws with SwiftShader (CPU), so fps here is a floor, not a real phone's
// number. Compare runs against each other; draw calls, triangles and bytes are exact.
import { createRequire } from "node:module";
import { createServer } from "node:http";
import { readFileSync, existsSync, statSync } from "node:fs";
import { gzipSync } from "node:zlib";
import { join, extname, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const { chromium, devices } = require("playwright");
const dist = process.env.DIST ?? join(dirname(fileURLToPath(import.meta.url)), "../dist");
const scenario = process.argv[2] ?? "heal";
const TYPES = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".json": "application/json", ".svg": "image/svg+xml", ".png": "image/png", ".woff2": "font/woff2" };

const server = createServer((req, res) => {
  let path = join(dist, decodeURIComponent(req.url.split("?")[0]));
  if (!existsSync(path) || statSync(path).isDirectory()) path = join(dist, "index.html");
  const body = readFileSync(path);
  const type = TYPES[extname(path)] ?? "application/octet-stream";
  const zip = /text|javascript|json|svg/.test(type);
  res.writeHead(200, { "content-type": type, ...(zip ? { "content-encoding": "gzip" } : {}) });
  res.end(zip ? gzipSync(body) : body);
}).listen(0);
const base = `http://localhost:${server.address().port}`;

const PROFILES = {
  desktop: { ctx: { viewport: { width: 1440, height: 900 } }, cpu: 1, net: null },
  phone: { ctx: { ...devices["Pixel 7"] }, cpu: 4, net: { latency: 150, downloadThroughput: (1.6e6 / 8) * 0.9, uploadThroughput: (750e3 / 8) * 0.9 } },
};

async function run(name, p) {
  const browser = await chromium.launch({ args: ["--enable-precise-memory-info"] });
  const ctx = await browser.newContext(p.ctx);
  const page = await ctx.newPage();
  const cdp = await ctx.newCDPSession(page);
  await cdp.send("Network.enable");
  await cdp.send("Network.setCacheDisabled", { cacheDisabled: true });
  if (p.net) await cdp.send("Network.emulateNetworkConditions", { offline: false, ...p.net });
  if (p.cpu > 1) await cdp.send("Emulation.setCPUThrottlingRate", { rate: p.cpu });
  let bytes = 0;
  cdp.on("Network.loadingFinished", (e) => (bytes += e.encodedDataLength));
  await page.addInitScript(() => {
    window.__lcp = 0;
    new PerformanceObserver((l) => { for (const e of l.getEntries()) window.__lcp = e.startTime; }).observe({ type: "largest-contentful-paint", buffered: true });
  });

  const out = {};
  // 1. first visit: the onboarding screen a new player lands on
  const t0 = Date.now();
  await page.goto(`${base}/`, { waitUntil: "load" });
  await page.waitForTimeout(1500);
  const nav = await page.evaluate(() => {
    const fcp = performance.getEntriesByName("first-contentful-paint")[0]?.startTime ?? 0;
    const n = performance.getEntriesByType("navigation")[0];
    return { fcp, lcp: window.__lcp, dcl: n.domContentLoadedEventEnd, load: n.loadEventEnd };
  });
  Object.assign(out, { "onboard FCP": nav.fcp, "onboard LCP": nav.lcp, "onboard load": nav.load, "onboard KB": bytes / 1024 });

  // 2. the map: time until the first frame is drawn, then frame stats once it's busy
  bytes = 0;
  const t1 = Date.now();
  await page.goto(`${base}/?source=sim&scenario=${scenario}`, { waitUntil: "commit" });
  await page.waitForFunction(() => window.__shipPerf && window.__shipPerf().calls > 0, null, { timeout: 120000, polling: 50 });
  out["map first frame"] = Date.now() - t1;
  out["map KB"] = bytes / 1024;
  await page.waitForTimeout(12000);
  const samples = [];
  for (let i = 0; i < 5; i++) { await page.waitForTimeout(1000); samples.push(await page.evaluate(() => window.__shipPerf())); }
  const avg = (k) => samples.reduce((a, s) => a + s[k], 0) / samples.length;
  Object.assign(out, { fps: avg("fps"), "frame ms (JS)": avg("workMs"), calls: avg("calls"), "tris k": avg("triangles") / 1000, geometries: samples.at(-1).geometries, textures: samples.at(-1).textures, programs: samples.at(-1).programs });
  out["heap MB"] = await page.evaluate(() => performance.memory.usedJSHeapSize / 1048576);
  await browser.close();
  return out;
}

const results = {};
for (const [name, p] of Object.entries(PROFILES)) results[name] = await run(name, p);
const keys = Object.keys(results.desktop);
console.log(`scenario=${scenario}`);
console.log("metric".padEnd(18) + Object.keys(results).map((k) => k.padStart(10)).join(""));
for (const k of keys) console.log(k.padEnd(18) + Object.values(results).map((r) => (Math.round(r[k] * 10) / 10).toString().padStart(10)).join(""));
console.log(JSON.stringify(results));
server.close();
