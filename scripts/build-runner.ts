// Public standalone assets: bundled source only. Never package env files or credentials.
import { resolve } from "node:path";
const root = resolve(import.meta.dir, ".."), dist = resolve(root, "web/dist");
const result = await Bun.build({ entrypoints: [resolve(root, "runner/src/cli.ts")], target: "bun", outdir: dist, naming: "runner.mjs", minify: false });
if (!result.success) throw new Error(`Runner bundle failed: ${result.logs.join("\n")}`);
const bytes = await Bun.file(resolve(dist, "runner.mjs")).arrayBuffer();
const sha256 = new Bun.CryptoHasher("sha256").update(bytes).digest("hex");
const commit = Bun.spawnSync(["git", "rev-parse", "HEAD"], { cwd: root }).stdout.toString().trim();
await Bun.write(resolve(dist, "runner-manifest.json"), JSON.stringify({ sha256, commit, bun: Bun.version }));
await Bun.write(resolve(dist, "install.sh"), (await Bun.file(resolve(root, "runner/install.sh")).text()).replaceAll("__BUN_VERSION__", Bun.version));
console.log(`Standalone runner ${commit.slice(0, 7)}: ${sha256}`);
