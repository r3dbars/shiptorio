// Local operator bootstrap. Reads existing gitignored secrets; never prints credentials.
import { chmod } from "node:fs/promises";
import { resolve } from "node:path";
import { makeSessionCookie } from "../src/session";
const root = resolve(import.meta.dir, "../..");
const base = process.env.SHIPTORIO_URL || "https://shiptorio.com";
const repo = process.env.SHIPTORIO_REPO || "r3dbars/shiptorio";
if (!["https://shiptorio.com", "https://shiptorio.dev", "http://localhost:8787"].includes(base) || !/^[\w.-]+\/[\w.-]+$/.test(repo)) throw new Error("Unsupported destination");
if (!process.env.APP_PASSWORD || !process.env.SESSION_SECRET) throw new Error("Existing server/.dev.vars credentials required");
const gate = await fetch(`${base}/access`, { method: "POST", headers: { origin: base }, body: new URLSearchParams({ password: process.env.APP_PASSWORD }), redirect: "manual" });
if (gate.status !== 303) throw new Error("Preview login failed");
const cookie = gate.headers.get("set-cookie")!.split(";")[0] + "; " + (await makeSessionCookie(process.env.SESSION_SECRET, "r3dbars")).split(";")[0];
const action = process.argv[2];
let path = "jobs", body: unknown;
if (action === "pair") { path = "pair"; body = {}; }
else if (action === "enqueue") {
  const issue = Number(process.argv[3]);
  const harness = process.argv[4];
  const allowedPaths = process.argv.slice(5);
  if (!Number.isInteger(issue) || issue < 1 || !["codex", "claude_code"].includes(harness) || !allowedPaths.length) throw new Error("Usage: runner:control enqueue ISSUE codex|claude_code PATH...");
  body = { itemId: `gh-${issue}`, harness, allowedPaths };
} else if (action !== "status") throw new Error("Use pair, enqueue or status");
const r = await fetch(`${base}/api/repos/${repo}/runner/${path}`, { method: body ? "POST" : "GET", headers: { cookie, origin: base, "content-type": "application/json" }, ...(body ? { body: JSON.stringify(body) } : {}) });
if (!r.ok) throw new Error(`Runner control failed (${r.status}): ${(await r.text()).slice(0, 500)}`);
const result = await r.json() as any;
if (action === "pair") {
  const file = resolve(root, "runner/.dev.vars");
  await Bun.write(file, `SHIPTORIO_URL=${base}\nSHIPTORIO_REPO=${repo}\nSHIPTORIO_RUNNER_TOKEN=${result.token}\n`, { mode: 0o600 });
  await chmod(file, 0o600);
  console.log(`Paired only ${repo} until ${new Date(result.expires).toISOString()}. Token saved only in gitignored runner/.dev.vars; re-pair to revoke.`);
} else console.log(JSON.stringify(result, null, 2));
