import { credentialEnv } from "./credential-fixture";
import { authorizedDB, authorizedSocket, browserEnv, membershipCache } from "./browser-fixture";
import { expect, mock, test } from "bun:test";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { FactoryState, type Item } from "@shiptorio/shared";
import { starterLine } from "../src/engine";
import { RunnerReceipt } from "../src/runner-job";
import { runLocalAssembler } from "../../runner/src/local-model";
import { validateChanges } from "../../runner/src/policy";
import { fakeOllama } from "../../runner/test/fake-ollama";

mock.module("cloudflare:workers", () => ({ DurableObject: class {
  ctx: unknown; env: unknown;
  constructor(ctx: unknown, env: unknown) { this.ctx = ctx; this.env = env; }
} }));
const { Factory } = await import("../src/factory");
const base = "a".repeat(40);

const git = async (cwd: string, ...args: string[]) => {
  const p = Bun.spawn(["git", "-c", "user.name=t", "-c", "user.email=t@t", "-c", "commit.gpgsign=false", ...args], { cwd, stdout: "pipe", stderr: "pipe" });
  const [out, err, code] = await Promise.all([new Response(p.stdout).text(), new Response(p.stderr).text(), p.exited]);
  if (code) throw new Error(err);
  return out.trim();
};

// Issue → offer (geothermal recommended) → plan → route (planner + guard) → approve → claim as
// local → a fake Ollama writes the fix in a real git checkout → receipt → server opens the PR.
test.skipIf(process.env.SHIPTORIO_CHECK_SANDBOX === "1")("geothermal end to end: a docs fix built by a local model becomes a PR", async () => {
  const keys = await crypto.subtle.generateKey({ name: "RSASSA-PKCS1-v1_5", modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: "SHA-256" }, true, ["sign", "verify"]);
  const pem = `-----BEGIN PRIVATE KEY-----\n${Buffer.from(await crypto.subtle.exportKey("pkcs8", keys.privateKey)).toString("base64")}\n-----END PRIVATE KEY-----`;
  const originalFetch = globalThis.fetch;
  const work = await mkdtemp(join(tmpdir(), "shiptorio-geo-e2e-"));
  const ollama = fakeOllama(body => {
    expect(body.messages[1].content).toContain("Run bun isntall");
    return JSON.stringify({ summary: "Fixed the install typo.", files: [{ path: "README.md", content: "# Demo\n\nRun bun install\n" }] });
  });
  let pushed = "", patch = "", prBody = "", plannerCall = 0, routed = 0;
  globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = String(input), json = (x: unknown) => Response.json(x);
    if (url.endsWith("/access_tokens")) return json({ token: "test-install-token" });
    if (url.endsWith("/repos/r3dbars/demo")) return json({ default_branch: "main" });
    if (url.includes("/git/trees/")) return json({ sha: "tree", tree: [{ path: "README.md", type: "blob" }, { path: "src/cart.ts", type: "blob" }], truncated: false });
    if (url.endsWith("/git/ref/heads/main")) return json({ object: { sha: base } });
    if (url.includes("/git/ref/heads/shiptorio/")) return json({ object: { sha: pushed } });
    if (url.includes("/contents/")) return json({ encoding: "base64", content: btoa("# Demo\n\nRun bun isntall\n") });
    if (url.includes("/compare/")) return json({ status: "ahead", ahead_by: 1, files: [{ filename: "README.md", status: "modified", changes: patch.split("\n").filter(l => /^[+-]/.test(l)).length, patch }] });
    if (url.endsWith("/issues/1")) return json({ number: 1, title: "Fix typo in README setup steps", body: "It says isntall", state: "open", html_url: "https://github.com/r3dbars/demo/issues/1" });
    if (url.includes("/issues/1/comments")) return json(init?.method === "POST" ? { id: 1 } : []);
    if (url.includes("/pulls?")) return json([]);
    if (url.endsWith("/pulls") && init?.method === "POST") { prBody = JSON.parse(String(init.body)).body; return json({ number: 7, html_url: "https://github.com/r3dbars/demo/pull/7" }); }
    if (url.endsWith("/chat/completions")) {
      const request = JSON.parse(String(init?.body)), system = String(request.messages[0].content);
      const say = (x: unknown) => json({ choices: [{ message: { content: JSON.stringify(x) } }] });
      if (system.includes("game master") && system.includes("power plant")) { routed++; return say({ harness: "local", why: "One-line docs fix, the free local model can do it." }); }
      if (system.includes("game master")) { const envelope = request.messages.find((m: { role: string }) => m.role === "user").content; const brief = JSON.parse(JSON.parse(envelope.split("\n")[1])); return say({ order: (brief.cards ?? []).map((c: { id: string }) => c.id), reason: "Oldest first.", picks: {} }); }
      plannerCall++;
      return say(plannerCall === 1 ? { files: ["README.md"] } : plannerCall === 2 ? { tool: "read_issue", reason: "Read the report" } : plannerCall === 3 ? { tool: "read_file", path: "README.md", reason: "Find the typo" } : { tool: "assign_job", reason: "Tiny docs fix", plan: "Change 'isntall' to 'install' in README.md.", acceptance: ["README says bun install"], files: ["README.md"] });
    }
    throw new Error(`Unexpected request ${url}`);
  }) as typeof fetch;
  const item = { id: "gh-1", kind: "cleanup", source: "github_issue", title: "Fix typo in README setup steps", body: "It says isntall", district: "docs", state: "queued", attempts: 0, updatedAt: Date.now() } as Item;
  const state = FactoryState.parse({ repo: "r3dbars/demo", baseBranch: "main", districts: [], ...starterLine(), items: [item], science: { red: 0, green: 0, grey: 0, blue: 0 }, trust: 0.5, tick: 0 });
  const data = new Map<string, unknown>([["state", state], ["meta", { repo: state.repo, installationId: 1 }], ["runnerPair", "pair"]]);
  let alarm: number | null = null;
  const storage = { async transaction<T>(fn: (tx: unknown) => Promise<T>): Promise<T> { return fn(storage); }, async get(k: string) { return structuredClone(data.get(k)); }, async put(k: string, v: unknown) { data.set(k, structuredClone(v)); }, async delete(k: string) { return data.delete(k); }, async list(o: { prefix: string; limit?: number }) { return new Map([...data.entries()].filter(([k]) => k.startsWith(o.prefix)).slice(0, o.limit)); }, async getAlarm() { return alarm; }, async setAlarm(n: number) { alarm = n; } };
  const ctx = { storage, blockConcurrencyWhile: <T>(fn: () => Promise<T>) => fn(), getWebSockets: () => [] };
  const f = new Factory(ctx as never, credentialEnv({ ...browserEnv, CACHE: membershipCache, GITHUB_APP_ID: "1", GITHUB_APP_PRIVATE_KEY: pem, META_API_KEY: "test-key", DB: authorizedDB({ prepare: () => ({ bind: () => ({ first: async () => ({ installation_id: 1, id: 1, login: "test-player", user_id: 1, calls: 1, tokens: 100, next_at: Date.now(), failures: 0 }), all: async () => ({ results: [] }), run: async () => ({ success: true }) }) }) }) }) as never);
  const saved = () => data.get("state") as FactoryState;
  // Ranking can move another card to the top while auth/storage awaits. Bind each gesture
  // to the actual offer/approval the fixture displayed, just like the check-in deck.
  const choose = async (moveId: string, optionId: string) => f.webSocketMessage(authorizedSocket(), JSON.stringify({ type: "choose_move", moveId, optionId }));
  try {
    // The runner checks in with a Claude sign-in and a local model: two plants appear.
    expect(await f.claimRunner("pair", ["claude_code", "local"])).toBeNull();
    expect(saved().power.find(p => p.id === "geo-local")).toMatchObject({ kind: "geothermal", name: "Your computer", online: true });
    const offer = saved().move!;
    expect(offer.options.find(o => o.recommended)?.id).toBe("local");
    expect(offer.options.find(o => o.id === "local")?.label).toContain("your computer");
    await choose(offer.id, "local");
    await f.alarm();
    const job = (await f.runnerJobs())[0];
    expect(job?.status, JSON.stringify({ job, thoughts: saved().brain?.thoughts })).toBe("awaiting_approval");
    expect(routed).toBe(1);
    expect(job).toMatchObject({ status: "awaiting_approval", harness: "local", allowedPaths: ["README.md"] });
    expect(job.route).toContain("geothermal");
    expect(saved().move?.options[0].label).toBe("Approve and build with your computer");
    expect(saved().move?.plan?.some(line => line.startsWith("Power: geothermal"))).toBe(true);
    expect(saved().brain?.thoughts.some(t => t.decision === "route" && t.by === "spark")).toBe(true);
    expect(await f.claimRunner("pair", ["claude_code", "local"])).toBeNull(); // nothing builds before approval
    await choose(job.approvalMoveId!, "approve");
    // A runner without a local model can't take it.
    expect(await f.claimRunner("pair", ["claude_code"])).toBeNull();
    const assigned = (await f.claimRunner("pair", ["claude_code", "local"]))!;
    expect(assigned.harness).toBe("local");
    expect(saved().machines.find(m => m.id === "runner-local")).toMatchObject({ harness: "local", powerId: "geo-local", state: "working" });

    // Runner side, for real: checkout, local model edit, supervisor scope check, commit.
    await git(work, "init", "-q", "-b", "main");
    await writeFile(join(work, "README.md"), "# Demo\n\nRun bun isntall\n");
    await git(work, "add", "README.md"); await git(work, "commit", "-qm", "base");
    const out = await runLocalAssembler({ plan: assigned.plan!, allowedPaths: assigned.allowedPaths }, work, { baseUrl: ollama.url, model: "qwen2.5-coder:7b" }, originalFetch);
    expect(out.paths).toEqual(["README.md"]);
    expect(await readFile(join(work, "README.md"), "utf8")).toContain("bun install");
    await git(work, "add", "--", ...out.paths);
    validateChanges(out.paths, assigned.allowedPaths, await git(work, "diff", "--cached"));
    await git(work, "commit", "-qm", "Execute plan with local model");
    pushed = await git(work, "rev-parse", "HEAD");
    patch = (await git(work, "diff", "HEAD~1", "--", "README.md")).split("\n").slice(4).join("\n"); // GitHub-style hunk, no file headers
    const receipt = RunnerReceipt.parse({ jobId: assigned.id, lease: assigned.lease, ok: true, sha: pushed, summary: out.summary, checks: ["typecheck", "test", "build"] });

    expect((await f.finishRunner("pair", receipt)).prUrl).toBe("https://github.com/r3dbars/demo/pull/7");
    expect(prBody).toContain("geothermal");
    expect(prBody).toContain("Closes #1");
    expect(saved().items[0]).toMatchObject({ state: "inspecting", prNumber: 7 }); // straight into the gauntlet
  } finally { globalThis.fetch = originalFetch; ollama.stop(); await rm(work, { recursive: true, force: true }); }
});
