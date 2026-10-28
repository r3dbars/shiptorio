// Miniflare's dispatcher requires Node's Undici; Bun's fetch ignores that transport.
import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
const root = resolve(import.meta.dirname, "../.."), dir = mkdtempSync(join(tmpdir(), "shiptorio-stage-test-"));
try {
  execFileSync("bun", ["build", "playtest/cpu/check.ts", "--target=node", "--packages=external", `--outfile=${dir}/check.mjs`], {cwd:root,stdio:"pipe"});
  execFileSync("node", [join(dir,"check.mjs")], {cwd:root,stdio:"inherit",env:{...process.env,SHIPTORIO_CHECK_ROOT:root}});
} finally {rmSync(dir,{recursive:true,force:true});}
