import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { gzipSync } from "node:zlib";

// Cold startup through the first shaft frame (including its dynamically loaded art).
// Updated from the measured optimized build; do not silently raise this on regressions.
const BASELINE_GZIP_BYTES = 700_000; // calibrated below after the mobile measurement
const LIMIT = Math.ceil(BASELINE_GZIP_BYTES * 1.10);
const DIST = resolve(import.meta.dir, "../web/dist");
type Chunk = { file: string; imports?: string[]; dynamicImports?: string[] };
// These imports require another route, player action, or an idle callback. Everything new
// is counted by default, so moving startup work behind import() cannot evade the budget.
const DEFERRED = /^(src\/judge\/|src\/source\/live\.ts$|src\/ui\/(CheckIn|HowItThinks)\.tsx$|src\/sound\/foundryPlayer\.ts$)/;

export function initialJS(manifest: Record<string, Chunk>) {
  const seen = new Set<string>();
  const files = new Set<string>();
  const visit = (key: string) => {
    if (seen.has(key)) return;
    seen.add(key);
    const chunk = manifest[key];
    if (!chunk) throw new Error(`Missing manifest chunk: ${key}`);
    if (chunk.file.endsWith(".js")) files.add(chunk.file);
    for (const child of chunk.imports ?? []) visit(child);
    for (const child of chunk.dynamicImports ?? []) if (!DEFERRED.test(child)) visit(child);
  };
  visit("index.html");
  return [...files].sort();
}

async function testRecovery() {
  // Real browser + real 404 module response. Kept here to stay within this task's file scope.
  const { chromium, expect } = await import("@playwright/test");
  const built = await Bun.build({ entrypoints: [resolve(import.meta.dir, "../web/src/chunkReload.ts")], target: "browser" });
  if (!built.success) throw new Error("Recovery test bundle failed");
  const recovery = await built.outputs[0].text();
  const browser = await chromium.launch();
  try {
    for (const mode of ["transient", "persistent", "preload", "storage-blocked", "unrelated"] as const) {
      let documents = 0, chunks = 0;
      const server = Bun.serve({ port: 0, fetch(req) {
        const path = new URL(req.url).pathname;
        if (path === "/recovery.js") return new Response(recovery, { headers: { "content-type": "text/javascript" } });
        if (path === "/chunk.js") {
          chunks++;
          return mode === "transient" && chunks > 1
            ? new Response('document.querySelector("h1").textContent="Factory ready"', { headers: { "content-type": "text/javascript" } })
            : new Response("missing old deploy chunk", { status: 404 });
        }
        if (path !== "/") return new Response("missing", { status: 404 });
        documents++;
        const action = mode === "preload" ? 'window.dispatchEvent(new Event("vite:preloadError", {cancelable:true}))'
          : mode === "unrelated" ? 'Promise.reject(new Error("ordinary application bug"))' : 'import("/chunk.js")';
        return new Response(`<h1>Opening factory</h1><script type="module">import {installChunkReload} from "/recovery.js"; installChunkReload(); ${action};</script>`, { headers: { "content-type": "text/html" } });
      } });
      const context = await browser.newContext();
      try {
        if (mode === "storage-blocked") await context.addInitScript(() => { Storage.prototype.setItem = () => { throw new Error("blocked"); }; });
        const page = await context.newPage();
        await page.goto(`http://localhost:${server.port}/`, { waitUntil: "commit" });
        if (mode === "transient") await expect(page.locator("h1")).toHaveText("Factory ready");
        else if (mode !== "unrelated") await expect(page.locator("#chunk-reload-notice")).toBeVisible();
        // Observation window catches a recurring reload, without retrying a failed test.
        await page.waitForTimeout(1500);
        expect(documents).toBe(mode === "storage-blocked" || mode === "unrelated" ? 1 : 2);
        if (mode === "transient") expect(chunks).toBe(2);
        console.log(`PASS chunk recovery: ${mode} (${documents} document requests)`);
      } finally { await context.close(); await server.stop(true); }
    }
  } finally { await browser.close(); }
}

if (import.meta.main) {
  if (process.argv.includes("--test")) await testRecovery();
  else {
    const manifest = JSON.parse(readFileSync(resolve(DIST, ".vite/manifest.json"), "utf8"));
    const files = initialJS(manifest);
    const bytes = files.reduce((sum, file) => sum + gzipSync(readFileSync(resolve(DIST, file))).length, 0);
    console.log(`Initial JS gzip: ${bytes.toLocaleString()} bytes / ${LIMIT.toLocaleString()} budget (${files.length} chunks; shaft art included)`);
    if (bytes > LIMIT) {
      console.error(`Initial JS exceeds the mobile startup budget by ${bytes - LIMIT} bytes.`);
      process.exitCode = 1;
    }
  }
}
