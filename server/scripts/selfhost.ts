import { resolve } from "node:path";
import { randomBytes } from "node:crypto";
import { createInterface } from "node:readline/promises";

export const root = resolve(import.meta.dir, "../..");
export const configPath = resolve(root, "server/wrangler.selfhost.json");
const statePath = resolve(root, "server/.selfhost/state.json");
export interface State {
  name: string; account: string; subdomain: string; login: string;
  databaseId?: string; namespaceId?: string; secrets: string[];
}
const uuid = /^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i;
const hex = /^[a-f0-9]{32}$/i;
export function validate(s: State) {
  if (!/^shiptorio(?:-[a-z0-9]+(?:-[a-z0-9]+)*)?$/.test(s.name) || s.name.length > 63) throw new Error("Worker name must be shiptorio or shiptorio-<suffix> (max 63 characters).");
  if (!hex.test(s.account)) throw new Error("Cloudflare account ID must be 32 hex characters.");
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(s.subdomain)) throw new Error("Enter only your workers.dev subdomain, without https:// or .workers.dev.");
  if (!/^[a-z\d](?:[a-z\d-]{0,37}[a-z\d])?$/i.test(s.login)) throw new Error("Enter your GitHub login, without @.");
  if (s.databaseId && !uuid.test(s.databaseId)) throw new Error("Invalid D1 database ID.");
  if (s.namespaceId && !hex.test(s.namespaceId)) throw new Error("Invalid KV namespace ID.");
  if (!Array.isArray(s.secrets) || !s.secrets.every(k => typeof k === "string")) throw new Error("Invalid self-host progress file.");
}
export const urlFor = (s: State) => `https://${s.name}.${s.subdomain}.workers.dev`;
// Deliberately do not inherit production routes, IDs, repo pins, allowlists or environments.
export function configuration(s: State) {
  validate(s);
  return {
    name: s.name, account_id: s.account, main: "src/index.ts",
    compatibility_date: "2026-10-01", compatibility_flags: ["nodejs_compat"],
    workers_dev: true, preview_urls: false,
    assets: { directory: "../web/dist", binding: "ASSETS", run_worker_first: true },
    durable_objects: { bindings: [{ name: "FACTORY", class_name: "Factory" }] },
    migrations: [{ tag: "v1", new_sqlite_classes: ["Factory"] }],
    d1_databases: s.databaseId ? [{ binding: "DB", database_name: s.name, database_id: s.databaseId, migrations_dir: "migrations" }] : [],
    kv_namespaces: s.namespaceId ? [{ binding: "CACHE", id: s.namespaceId }] : [],
    vars: { PUBLIC_URL: urlFor(s), ALLOWED_LOGINS: s.login, ADMIN_LOGINS: s.login,
      SELFHOST_SETUP: s.secrets.includes("GITHUB_APP_ID") ? "0" : "1",
      SPARK_BASE_URL: "https://api.meta.ai/v1", SPARK_MODEL: "muse-spark-1.3" },
  };
}
export function resourceId(output: string, kind: "d1" | "kv") {
  const match = kind === "d1"
    ? output.match(/["']?database_id["']?\s*[:=]\s*["']([a-f\d-]{36})["']/i)
    : output.match(/["']?id["']?\s*[:=]\s*["']([a-f\d]{32})["']/i);
  if (!match) throw new Error(`Could not read ${kind} ID from Wrangler. Recover the ID from the dashboard; see /docs/self-host before rerunning.`);
  return match[1];
}
export interface IO {
  wrangler(args: string[], input?: string, capture?: boolean): Promise<string>;
  save(s: State): Promise<void>;
  ask(question: string, fallback?: string): Promise<string>;
  log(message: string): void;
}
export const legacyOwnerCleanup = "UPDATE signup_allowlist SET enabled = 0 WHERE login = 'r3dbars' AND approved_by = 'r3dbars' AND factories = 99999 AND repos = 99999 AND runs_daily = 200 AND spark_calls_daily IS NULL AND spark_tokens_daily IS NULL";
export async function provision(s: State, io: IO) {
  validate(s);
  if (!s.databaseId) {
    s.databaseId = resourceId(await io.wrangler(["d1", "create", s.name, "--update-config=false"], undefined, true), "d1");
    await io.save(s);
  }
  if (!s.namespaceId) {
    s.namespaceId = resourceId(await io.wrangler(["kv", "namespace", "create", `${s.name}-cache`, "--update-config=false"], undefined, true), "kv");
    await io.save(s);
  }
  await io.wrangler(["d1", "migrations", "apply", "DB", "--remote"]);
  if (s.login.toLowerCase() !== "r3dbars") {
    // Old 0014 overwrote provenance. Quarantine only its exact synthetic footprint;
    // intentional access with that footprint must be approved again by this owner.
    await io.wrangler(["d1", "execute", "DB", "--remote", "--command", legacyOwnerCleanup]);
    io.log("Reconciled legacy maintainer enrollment. Reapprove any intentional access in your admin settings.");
  }
}
export async function configureSecrets(s: State, io: IO, github = false) {
  const names = github
    // App ID last: /setup stays available if an earlier upload fails.
    ? ["GITHUB_CLIENT_ID", "GITHUB_CLIENT_SECRET", "GITHUB_WEBHOOK_SECRET", "GITHUB_APP_PRIVATE_KEY", "GITHUB_APP_ID"]
    : ["SESSION_SECRET", "CRED_MASTER_KEY", "APP_PASSWORD", "META_API_KEY"];
  for (const name of names) {
    if (s.secrets.includes(name)) continue;
    io.log(`Set ${name}${name === "APP_PASSWORD" ? " (choose a strong preview password; keep it in your password manager)" : ""}`);
    let input: string | undefined;
    if (name === "SESSION_SECRET") input = randomBytes(32).toString("hex");
    if (name === "CRED_MASTER_KEY") input = randomBytes(32).toString("base64");
    if (name === "GITHUB_APP_PRIVATE_KEY") {
      const path = await io.ask("Path to the GitHub App PEM file (save the full private key from /setup/callback)");
      input = await Bun.file(resolve(path)).text();
      if (!/-----BEGIN (?:RSA )?PRIVATE KEY-----/.test(input)) throw new Error("That file is not a PEM private key.");
    }
    await io.wrangler(["secret", "put", name], input);
    s.secrets.push(name);
    await io.save(s);
  }
}
export async function main(args: string[]) {
  if (args.includes("--help")) {
    console.log("bun run selfhost [--dry-run]\nInteractive Cloudflare setup. --dry-run builds, applies LOCAL migrations, and bundles with Wrangler; no credentials or remote writes.");
    return;
  }
  if (args.some(a => a !== "--dry-run")) throw new Error("Unknown argument. Use bun run selfhost --help.");
  const dry = args.includes("--dry-run");
  if (!dry && !process.stdin.isTTY) throw new Error("Live setup needs an interactive terminal. Use --dry-run in CI.");
  const ask: IO["ask"] = async (q, fallback = "") => {
    const rl = createInterface({ input: process.stdin, output: process.stdout });
    try { return (await rl.question(`${q}${fallback ? ` [${fallback}]` : ""}: `)).trim() || fallback; }
    finally { rl.close(); }
  };
  const selectedConfig = dry ? resolve(root, "server/.selfhost/dry-run.json") : configPath;
  const env: Record<string, string | undefined> = { ...process.env, WRANGLER_SEND_METRICS: "false" };
  delete env.CLOUDFLARE_ENV;
  if (dry) {
    // Do not let local credentials or account selection turn the CI path into a remote run.
    delete env.CLOUDFLARE_API_TOKEN; delete env.CLOUDFLARE_API_KEY;
    delete env.CLOUDFLARE_EMAIL; delete env.CLOUDFLARE_ACCOUNT_ID;
  }
  const run = async (cmd: string[], input?: string, capture = false) => {
    const child = Bun.spawn(cmd, { cwd: root, env, stdin: input === undefined ? "inherit" : new TextEncoder().encode(input + "\n"), stdout: capture ? "pipe" : "inherit", stderr: "inherit" });
    const output = capture ? await new Response(child.stdout).text() : "";
    if (await child.exited !== 0) throw new Error(`${cmd[0]} ${cmd[1]} failed. Progress is saved; rerun bun run selfhost to resume.`);
    return output;
  };
  const wrangler: IO["wrangler"] = (cmd, input, capture) => {
    if (dry && !(cmd[0] === "deploy" && cmd.includes("--dry-run")) && !(cmd[0] === "d1" && cmd.includes("--local"))) throw new Error("Remote command blocked in dry run.");
    return run([process.execPath, resolve(root, "server/node_modules/wrangler/bin/wrangler.js"), ...cmd, "--config", selectedConfig, "--env", ""], input, capture);
  };
  const save = async (s: State) => {
    const config = configuration(s);
    // Paths in the offline config live one directory deeper than the live config.
    if (dry) { config.main = "../src/index.ts"; config.assets.directory = "../../web/dist"; config.d1_databases.forEach(d => d.migrations_dir = "../migrations"); }
    await Bun.write(selectedConfig, JSON.stringify(config, null, 2) + "\n");
    if (!dry) await Bun.write(statePath, JSON.stringify(s, null, 2) + "\n");
  };
  const io: IO = { wrangler, ask, save, log: console.log };
  {
    let s: State;
    if (dry) {
      s = { name: "shiptorio-selfhost-ci", account: "0".repeat(32), subdomain: "example", login: "selfhost-owner", databaseId: "00000000-0000-4000-8000-000000000000", namespaceId: "0".repeat(32), secrets: [] };
    } else if (await Bun.file(statePath).exists()) {
      s = await Bun.file(statePath).json();
    } else {
      console.log("Self-host Shiptorio in YOUR Cloudflare account. Sign in first with bun x wrangler login. Find your account ID and workers.dev subdomain in Workers & Pages → Overview.");
      s = { name: await ask("Worker / D1 name", "shiptorio-selfhost"), account: await ask("Cloudflare account ID"), subdomain: await ask("Your workers.dev subdomain"), login: await ask("Your GitHub login"), secrets: [] };
      s.databaseId = await ask("Existing dedicated D1 ID (leave blank to create)") || undefined;
      s.namespaceId = await ask("Existing dedicated KV ID (leave blank to create)") || undefined;
    }
    validate(s);
    env.CLOUDFLARE_ACCOUNT_ID = s.account;
    if (!dry) {
      console.log(`Target: account ${s.account}, Worker ${s.name}, D1 ${s.databaseId || s.name}, KV ${s.namespaceId || `${s.name}-cache`}. URL: ${urlFor(s)}. Existing resources with these names will be updated. No custom domains will be changed.`);
      if (await ask(`Type ${s.name} to create/migrate resources, upload secrets and deploy`) !== s.name) throw new Error("Setup cancelled before any Cloudflare changes.");
    }
    await save(s);
    await run([process.execPath, "run", "build"]);
    if (dry) {
      await wrangler(["d1", "migrations", "apply", "DB", "--local"]);
      await wrangler(["deploy", "--dry-run", "--outdir", resolve(root, "server/.selfhost/bundle")]);
      console.log("Self-host dry run passed: local migrations + Worker/assets bundle. No remote resources or secrets created.");
      return;
    }
    await provision(s, io);
    await configureSecrets(s, io);
    // First deployment serves /setup so a new owner can create an App with correct callbacks.
    await wrangler(["deploy"]);
    if (!s.secrets.includes("GITHUB_APP_ID")) {
      console.log(`Open ${urlFor(s)}/setup and enter your preview password. Create your own GitHub App with a unique name, keep its one-time values open, and save its private key as a PEM file. For an existing App, set its homepage to ${urlFor(s)}, OAuth callback to /auth/callback, webhook to /webhooks/github, and installation setup URL to /github/installed on that origin. The wizard uploads the values next; do not run the page's unscoped Wrangler commands.`);
      await ask("Press Enter when your GitHub App credentials are ready");
    }
    await configureSecrets(s, io, true);
    await save(s);
    await wrangler(["deploy"]);
    console.log(`\nShiptorio deployed: ${urlFor(s)}\nSign in: ${urlFor(s)}/auth/login\nInstall your GitHub App on selected repos, then connect your local runner: ${urlFor(s)}/docs/runner\nKeep your preview password and API credentials in your password manager; preserve this Worker to retain its generated encryption key. Re-run bun run selfhost to update this deployment.`);
  }
}
if (import.meta.main) main(process.argv.slice(2)).catch(error => { console.error(error instanceof Error ? error.message : "Self-host setup failed."); process.exitCode = 1; });
