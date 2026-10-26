// First-run local setup for `bun run dev`: .dev.vars and the local D1 schema.
import { $ } from "bun";
import { randomBytes } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";

if (!existsSync(".dev.vars")) {
  const vars = readFileSync(".dev.vars.example", "utf8")
    .replace(/^SESSION_SECRET=.*$/m, `SESSION_SECRET=${randomBytes(32).toString("hex")}`)
    .replace(/^DEV_LOGIN=.*$/m, "DEV_LOGIN=r3dbars");
  writeFileSync(".dev.vars", vars);
  console.log("wrote server/.dev.vars (DEV_LOGIN=r3dbars, so localhost skips GitHub login)");
}

await $`bunx wrangler d1 migrations apply shiptorio --local`.quiet();
