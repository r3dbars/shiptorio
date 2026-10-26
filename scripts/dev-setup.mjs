// Gets local dev ready in one go: .dev.vars, local D1 schema, and a demo map
// of this repo so the UI works before the GitHub App exists.
import { execFileSync, execSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const DEMO_REPO = "demo/shiptorio";
const wrangler = (...args) => execFileSync("npx", ["wrangler", ...args], { stdio: ["ignore", "ignore", "inherit"] });

if (!existsSync(".dev.vars")) {
  const vars = readFileSync(".dev.vars.example", "utf8")
    .replace(/^SESSION_SECRET=.*$/m, `SESSION_SECRET=${randomBytes(32).toString("hex")}`)
    .replace(/^DEV_LOGIN=.*$/m, "DEV_LOGIN=r3dbars");
  writeFileSync(".dev.vars", vars);
  console.log("wrote .dev.vars (DEV_LOGIN=r3dbars, so localhost skips GitHub login)");
}

wrangler("d1", "migrations", "apply", "shiptorio", "--local");

// Demo map: this repo's own files.
const { layoutMap } = await import("../src/map.ts");
const paths = execSync("git ls-files", { encoding: "utf8" }).split("\n").filter(Boolean);
const map = layoutMap(paths.map((path) => ({ path, type: "blob", size: 0 })));
const dir = mkdtempSync(join(tmpdir(), "shiptorio-"));
const mapFile = join(dir, "map.json");
writeFileSync(mapFile, JSON.stringify({ repo: DEMO_REPO, branch: "main", sha: "demo", truncated: false, map }));
// No TTL locally, so the demo never tries to reach GitHub.
wrangler("kv", "key", "put", "--local", "--binding", "CACHE", `map:${DEMO_REPO}`, "--path", mapFile);

const pick = (re, n) => paths.filter((p) => re.test(p)).slice(0, n);
const demoPrs = [
  [1, "Draw belts between zones", "open", "success", pick(/^src\/map|^public\/app/, 3)],
  [2, "Agent factory: fix lint on save", "open", null, pick(/^test\//, 2).concat(pick(/^docs\//, 1))],
  [3, "Restyle the review chest", "open", "failure", pick(/^public\/style/, 1).concat(pick(/^public\/index/, 1))],
  [4, "Verify webhook signatures", "merged", "success", pick(/^src\/github/, 1)],
];
const q = (v) => (v === null ? "NULL" : `'${String(v).replace(/'/g, "''")}'`);
const sql =
  `DELETE FROM pull_requests WHERE repo = '${DEMO_REPO}';\n` +
  demoPrs
    .map(([n, title, state, ci, files]) =>
      `INSERT INTO pull_requests (repo, number, title, state, author, head_sha, ci_status, files) VALUES (${q(DEMO_REPO)}, ${n}, ${q(title)}, ${q(state)}, 'r3dbars', 'demo${n}', ${q(ci)}, ${q(JSON.stringify(files))});`,
    )
    .join("\n");
const sqlFile = join(dir, "seed.sql");
writeFileSync(sqlFile, sql);
wrangler("d1", "execute", "shiptorio", "--local", "--file", sqlFile);

console.log(`\nready. open http://localhost:8787/?repo=${DEMO_REPO}\n`);
