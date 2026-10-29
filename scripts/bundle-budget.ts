import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { gzipSync } from "node:zlib";

// Cold startup of the 2D deck: deck.html's entry chunk and everything it imports statically. Dynamic imports
// (the simulator, the live socket, story/data/shippy layers) load after the first frame and are not counted.
// Updated from the measured optimized build; do not silently raise this on regressions.
const BASELINE_GZIP_BYTES = 33_091;
const LIMIT = Math.ceil(BASELINE_GZIP_BYTES * 110 / 100);
const DIST = resolve(import.meta.dir, "../web/dist");
type Chunk = { file: string; imports?: string[] };

export function initialJS(manifest: Record<string, Chunk>, entry = "deck.html") {
  const seen = new Set<string>();
  const files = new Set<string>();
  const visit = (key: string) => {
    if (seen.has(key)) return;
    seen.add(key);
    const chunk = manifest[key];
    if (!chunk) throw new Error(`Missing manifest chunk: ${key}`);
    if (chunk.file.endsWith(".js")) files.add(chunk.file);
    for (const child of chunk.imports ?? []) visit(child);
  };
  visit(entry);
  return [...files].sort();
}

if (import.meta.main) {
  const manifest = JSON.parse(readFileSync(resolve(DIST, "deck-manifest.json"), "utf8"));
  const files = initialJS(manifest);
  const bytes = files.reduce((sum, file) => sum + gzipSync(readFileSync(resolve(DIST, file))).length, 0);
  console.log(`Deck startup JS gzip: ${bytes.toLocaleString()} bytes / ${LIMIT.toLocaleString()} budget (${files.length} chunks)`);
  if (bytes > LIMIT) {
    console.error(`Deck startup JS exceeds the mobile startup budget by ${bytes - LIMIT} bytes.`);
    process.exitCode = 1;
  }
}
