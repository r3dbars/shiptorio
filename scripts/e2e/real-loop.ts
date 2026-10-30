// Real-loop driver: plays the owner's side of the REAL deck (real server, runner, Spark and GitHub) in a recorded
// Chromium, and writes evidence a person can check. Taps go through the deck's own buttons; the page's socket frames
// are read for state. Nothing here fakes a stage: an item counts as shipped only when GitHub says its PR merged.
//
//   bun scripts/e2e/real-loop.ts status              who am I, is the runner online, what's on the line
//   bun scripts/e2e/real-loop.ts ship 30             Testing #30 through Planner → Builder → Checks → Review → Gate → Launch
//   bun scripts/e2e/real-loop.ts watch 10            record 10 minutes of what Shippy notices (cards, bottleneck, thoughts)
//   bun scripts/e2e/real-loop.ts forget              start learned trust over (every yes this script tapped counts), so a
//                                                    filmed take begins at zero dots
//
// Env: SHIPTORIO_URL (https://shiptorio.dev), SHIPTORIO_REPO (r3dbars/testing), E2E_OUT (runner/.work/e2e/<stamp>-<mode>),
//      E2E_MINUTES (ship: 45), E2E_PHONE=1 (390x844 instead of 1280x720), GH_TOKEN (read-only GitHub checks).
// Sign-in, first that is set:
//      E2E_COOKIE_FILE   a cookie header saved by an earlier run (default runner/.work/e2e/cookie, 0600, gitignored)
//      E2E_PASS          the JSON from `node scripts/e2e/owner-pass.mjs` on a machine with server/.dev.vars (60s to use)
//      SESSION_SECRET + APP_PASSWORD (e.g. `bun --env-file=server/.dev.vars scripts/e2e/real-loop.ts …`)
// Evidence: video.webm, shots/NN-*.png, frames.jsonl (every socket message), timeline.jsonl (every driver step) and
// report.md. Never prints or saves secrets; the cookie file is the only credential it writes.
import { chromium, type Page, type WebSocket as PwSocket } from "@playwright/test";
import { existsSync } from "node:fs";
import { appendFile, chmod, mkdir, readFile, readdir, rename, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { continueOption, type Item as FactoryItem, type FactoryState, type Move, type ServerToWeb } from "../../shared/src/index";
import { applyPatch } from "../../web/src/source/patch";
import { ownerProof } from "../../server/src/session";

const base = process.env.SHIPTORIO_URL || "https://shiptorio.dev";
const repo = (process.env.SHIPTORIO_REPO || "r3dbars/testing").toLowerCase();
const [mode = "status", arg] = process.argv.slice(2);
const ORIGINS = new Set(["https://shiptorio.dev", "https://shiptorio.com", "http://localhost:8787"]);
if (new URL(base).origin !== base || !ORIGINS.has(new URL(base).origin)) throw new Error("Unsupported SHIPTORIO_URL"); // an exact origin, nothing around it
if (!/^[\w.-]+\/[\w.-]+$/.test(repo)) throw new Error("Set SHIPTORIO_REPO=owner/repo");
if (repo === "r3dbars/shiptorio") throw new Error("The driver ships real merges; point it at a test repo");
if (!["status", "ship", "watch", "forget"].includes(mode)) throw new Error("Use status, ship ISSUE, watch MINUTES or forget");
const issue = mode === "ship" ? Number(arg) : 0;
if (mode === "ship" && !(Number.isInteger(issue) && issue > 0)) throw new Error("Usage: real-loop.ts ship ISSUE");
const itemId = `gh-${issue}`;
const minutes = Number(mode === "watch" ? arg || 10 : process.env.E2E_MINUTES || 45);

const work = resolve(import.meta.dir, "../../runner/.work/e2e");
const stamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
const out = resolve(process.env.E2E_OUT || `${work}/${stamp}-${mode}${issue ? `-${issue}` : ""}`);
await mkdir(`${out}/shots`, { recursive: true });
const t0 = Date.now();
const since = () => `${((Date.now() - t0) / 1000).toFixed(1)}s`;
const timeline: { t: string; kind: string; [k: string]: unknown }[] = [];
async function note(kind: string, data: Record<string, unknown> = {}) {
  const line = { t: since(), kind, ...data };
  timeline.push(line);
  console.log(JSON.stringify(line));
  await appendFile(`${out}/timeline.jsonl`, JSON.stringify(line) + "\n");
}

// ---------- sign in ----------
const cookieFile = process.env.E2E_COOKIE_FILE || `${work}/cookie`;
async function signIn(): Promise<string> {
  if (existsSync(cookieFile)) {
    const saved = (await readFile(cookieFile, "utf8")).trim();
    const me = await fetch(`${base}/api/me`, { headers: { cookie: saved } });
    if (me.ok && (await me.json() as { login?: string }).login) return saved;
  }
  let access: string, pass: { login: string; at: number; proof: string };
  type Pass = { access: string; login: string; at: number; proof: string };
  if (process.env.E2E_PASS) { const p = JSON.parse(process.env.E2E_PASS) as Pass; access = p.access; pass = { login: p.login, at: p.at, proof: p.proof }; }
  else if (process.env.SESSION_SECRET && process.env.APP_PASSWORD) {
    const gate = await fetch(`${base}/access`, { method: "POST", headers: { origin: base }, body: new URLSearchParams({ password: process.env.APP_PASSWORD }), redirect: "manual" });
    if (gate.status !== 303) throw new Error(`Preview gate refused (${gate.status})`);
    access = gate.headers.get("set-cookie")!.split(";")[0];
    const at = Date.now();
    pass = { login: "r3dbars", at, proof: await ownerProof(process.env.SESSION_SECRET, "r3dbars", at) };
  } else throw new Error("No sign-in: set E2E_PASS (node scripts/e2e/owner-pass.mjs) or SESSION_SECRET + APP_PASSWORD");
  const r = await fetch(`${base}/auth/owner-session`, { method: "POST", headers: { cookie: access, origin: base, "content-type": "application/json" }, body: JSON.stringify(pass) });
  if (!r.ok) throw new Error(`Owner session refused (${r.status}): ${(await r.text()).slice(0, 200)}`);
  const cookie = `${access}; ${r.headers.get("set-cookie")!.split(";")[0]}`;
  await mkdir(work, { recursive: true });
  await writeFile(cookieFile, cookie, { mode: 0o600 });
  await chmod(cookieFile, 0o600);
  return cookie;
}
const cookie = await signIn();
const api = async <T>(path: string, init: RequestInit = {}): Promise<{ status: number; body: T }> => {
  const r = await fetch(`${base}${path}`, { ...init, headers: { cookie, origin: base, "content-type": "application/json", ...init.headers } });
  return { status: r.status, body: await r.json().catch(() => null) as T };
};
const me = (await api<{ login: string }>("/api/me")).body;
const runner = (await api<Record<string, unknown>>(`/api/repos/${repo}/runner/status`)).body;
await note("signed_in", { login: me?.login, base, repo });
await note("runner", { runner });

if (mode === "forget") {
  // The same message "Ask me again" sends, with "*" for every kind (server/src/learn.ts forgetAll).
  const socket = new WebSocket(`${base.replace(/^http/, "ws")}/api/repos/${repo}/factory`, { headers: { cookie, origin: base } } as unknown as string[]);
  const learned = await new Promise<unknown>((ok, fail) => {
    const timer = setTimeout(() => fail(new Error("no snapshot in 20s")), 20_000);
    socket.onmessage = e => { const msg = JSON.parse(String(e.data)); if (msg.type === "snapshot") { clearTimeout(timer); ok(msg.state.learned ?? []); } };
    socket.onerror = () => fail(new Error("socket error"));
  });
  socket.send(JSON.stringify({ type: "unlearn", key: "*" }));
  await Bun.sleep(3000);
  socket.close();
  await note("forgot", { learnedBefore: learned });
  process.exit(0);
}

// ---------- GitHub (read only) ----------
const [ghOwner, ghName] = repo.split("/");
async function gh<T>(path: string): Promise<T | null> {
  const token = process.env.GH_TOKEN || process.env.GITHUB_TOKEN;
  const r = await fetch(`https://api.github.com/repos/${ghOwner}/${ghName}${path}`, { headers: { accept: "application/vnd.github+json", "user-agent": "shiptorio-e2e", ...(token ? { authorization: `Bearer ${token}` } : {}) } });
  return r.ok ? r.json() as Promise<T> : null;
}

// ---------- browser ----------
const phone = process.env.E2E_PHONE === "1";
const viewport = phone ? { width: 390, height: 844 } : { width: 1280, height: 720 };
const browser = await chromium.launch({ executablePath: existsSync("/opt/pw-browsers/chromium") ? "/opt/pw-browsers/chromium" : undefined });
const context = await browser.newContext({ viewport, recordVideo: { dir: `${out}/video`, size: viewport }, ...(phone ? { isMobile: true, hasTouch: true, deviceScaleFactor: 1 } : {}) });
const host = new URL(base).hostname;
await context.addCookies(cookie.split("; ").map(pair => {
  const [name, ...rest] = pair.split("=");
  return { name, value: rest.join("="), domain: host, path: "/", secure: base.startsWith("https"), httpOnly: true, sameSite: "Lax" as const };
}));
const page = await context.newPage();
const errors: string[] = [];
page.on("pageerror", e => { errors.push(String(e)); void note("page_error", { error: String(e).slice(0, 300) }); });
page.on("console", m => { if (m.type() === "error") void note("console_error", { text: m.text().slice(0, 300) }); });

let state = null as FactoryState | null;
const logs: string[] = [];
function fold(msg: ServerToWeb) {
  if (msg.type === "snapshot") state = msg.state;
  else if (!state) return;
  else if (msg.type === "patch") state = applyPatch(state, msg.patch);
  else if (msg.type === "move") state = { ...state, move: msg.move };
  else if (msg.type === "deck") state = { ...state, deck: msg.deck };
  else if (msg.type === "move_resolved") state = { ...state, move: state.move?.id === msg.moveId ? null : state.move, deck: state.deck?.filter(m => m.id !== msg.moveId) };
}
page.on("websocket", (ws: PwSocket) => {
  if (!ws.url().includes("/factory")) return;
  void note("socket_open", { url: ws.url().replace(/\?.*/, "") });
  ws.on("framereceived", f => {
    const text = typeof f.payload === "string" ? f.payload : f.payload.toString();
    if (text === "pong") return;
    let msg: ServerToWeb;
    try { msg = JSON.parse(text); } catch { return; }
    void appendFile(`${out}/frames.jsonl`, JSON.stringify({ t: since(), dir: "in", msg }) + "\n");
    fold(msg);
    if (msg.type === "log") { logs.push(msg.text); void note("log", { itemId: msg.itemId, level: msg.level, text: msg.text, tool: msg.tool, actor: msg.actor }); }
    if (msg.type === "autonomy_unlocked") void note("unlocked", { level: msg.level, text: msg.text });
  });
  ws.on("framesent", f => {
    const text = typeof f.payload === "string" ? f.payload : f.payload.toString();
    if (text !== "ping") void appendFile(`${out}/frames.jsonl`, JSON.stringify({ t: since(), dir: "out", msg: text.slice(0, 2000) }) + "\n");
  });
  ws.on("close", () => void note("socket_closed"));
});

let shotN = 0;
async function shot(label: string) {
  const file = `${String(++shotN).padStart(2, "0")}-${label.replace(/[^\w-]+/g, "-").slice(0, 50)}.png`;
  await page.screenshot({ path: `${out}/shots/${file}` }).catch(() => {});
  await note("shot", { file });
}
const cardOnScreen = () => page.evaluate(() => {
  const card = [...document.querySelectorAll<HTMLElement>("section.ic-card")].find(c => c.offsetParent && !c.closest("[hidden]"));
  return card ? { id: card.dataset.card ?? "", title: card.querySelector(".ic-title")?.textContent ?? "", yes: card.querySelector(".ic-btn.approve b")?.textContent ?? "", no: card.querySelector(".ic-btn.later b")?.textContent ?? "", line: card.querySelector(".ic-line")?.textContent ?? "" } : null;
});
async function press(which: "approve" | "later", hold = false) {
  const button = page.locator(`section.ic-card .ic-btn.${which}`).filter({ visible: true }).first();
  await button.waitFor({ state: "visible", timeout: 10_000 });
  if (!hold) return button.click();
  // A Ship it card wants a held press (card.ts HOLD_MS = 800).
  const box = (await button.boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.waitForTimeout(1100);
  await page.mouse.up();
}

const deckUrl = `${base}/deck?source=live&repo=${encodeURIComponent(repo)}`;
await page.goto(mode === "ship" ? `${deckUrl}&onboard=codex` : deckUrl);
await page.waitForSelector("body[data-deck-ready]", { timeout: 30_000 }).catch(() => note("deck_not_ready"));
await page.waitForTimeout(2500);
await shot("opened");

const item = (): FactoryItem | undefined => state?.items.find(i => i.id === itemId);
const openCards = (): Move[] => state ? [...(state.deck ?? []), ...(state.move ? [state.move] : [])].filter((m, i, all) => all.findIndex(x => x.id === m.id) === i) : [];
const TAP = new Set(["plan_runner_job", "approve_runner_job", "request_merge", "approve_review", "approve_human_review", "human_approve"]);
const deadline = t0 + minutes * 60_000;
let result = "unfinished";

async function startIssue() {
  // The deck's own inbox: Codex engine card → issues, "Next issue" until #N, then Plan.
  for (let i = 0; i < 60 && Date.now() < deadline; i++) {
    const card = await cardOnScreen();
    if (item() && item()!.state !== "ore") return note("issue_on_line", { state: item()!.state });
    if (!card) { await page.waitForTimeout(1000); continue; }
    if (card.title.startsWith(`#${issue}:`) && card.yes === "Plan") { await shot(`inbox-${issue}`); await press("approve"); return note("tapped", { card: card.title, yes: card.yes, via: "deck inbox" }); }
    if (card.title.startsWith("#") && card.no === "Next issue") { await press("later"); await page.waitForTimeout(600); continue; }
    if (card.yes === "See issues") { await shot("engine-ready"); await press("approve"); await page.waitForTimeout(1500); continue; }
    if (/Please wait|Loading|Checking/.test(card.yes + card.title)) { await page.waitForTimeout(1000); continue; }
    await note("inbox_blocked", { card });
    await shot("inbox-blocked");
    break;
  }
  // The inbox didn't get there (engine offline, issue past the first pages): start it the same way the Plan button does.
  const r = await api(`/api/repos/${repo}/issues/${issue}/start`, { method: "POST" });
  await note("started_by_api", { status: r.status, body: r.body });
  if (r.status >= 400) throw new Error(`Could not start #${issue}: ${JSON.stringify(r.body)}`);
}

async function ship() {
  const started = await gh<{ title: string; state: string }>(`/issues/${issue}`);
  await note("github_issue", { issue, title: started?.title, state: started?.state });
  await startIssue();
  let lastState = "", lastStage = "", tapped = new Set<string>();
  while (Date.now() < deadline) {
    await page.waitForTimeout(2000);
    const it = item();
    const stage = state?.pipeline?.filter(p => p.itemIds.includes(itemId)).map(p => `${p.id}:${p.state}`).join(",") ?? "";
    if (it && (it.state !== lastState || stage !== lastStage)) {
      lastState = it.state; lastStage = stage;
      await note("item", { state: it.state, pr: it.prNumber, stage, scars: it.scars?.length ?? 0 });
      await shot(`${it.state}${it.prNumber ? `-pr${it.prNumber}` : ""}-${stage.split(",")[0] ?? ""}`);
    }
    if (it?.state === "launched") {
      const pr = it.prNumber ? await gh<{ merged: boolean; merged_at: string; merge_commit_sha: string; html_url: string }>(`/pulls/${it.prNumber}`) : null;
      await note("github_pr", { pr: it.prNumber, merged: pr?.merged, merged_at: pr?.merged_at, sha: pr?.merge_commit_sha, url: pr?.html_url });
      await page.waitForTimeout(6000); // let the rocket fly on camera
      await shot("launched");
      result = pr?.merged ? `shipped: PR #${it.prNumber} merged on GitHub (${pr.merge_commit_sha?.slice(0, 7)})` : `launched in the deck but GitHub says PR #${it.prNumber} is not merged`;
      return;
    }
    for (const move of openCards()) {
      if (move.itemId !== itemId || tapped.has(move.id)) continue;
      const option = continueOption(move);
      const tools = option.actions.map(a => a.tool);
      if (!tools.length || !tools.every(t => TAP.has(t))) { if (!tapped.has(`skip:${move.id}`)) { tapped.add(`skip:${move.id}`); await note("left_for_human", { card: move.title, tools }); await shot("needs-human"); } continue; }
      if (move.locked) continue;
      const hold = tools.includes("request_merge");
      // Wait for the deck to show this exact card, then press its real button.
      let onScreen = false;
      for (let i = 0; i < 20 && !onScreen; i++) { onScreen = (await cardOnScreen())?.id === move.id; if (!onScreen) await page.waitForTimeout(1000); }
      tapped.add(move.id);
      if (!onScreen) { await note("card_not_on_screen", { card: move.title, showing: await cardOnScreen() }); await shot("card-missing"); continue; }
      await shot(`card-${tools[0]}`);
      await press("approve", hold);
      await note("tapped", { card: move.title, tools, option: option.label, hold });
    }
  }
  result = `timed out after ${minutes} min with ${itemId} at ${item()?.state ?? "not on the line"}`;
}

async function watch() {
  const seen = new Set<string>();
  let lastNeck = "";
  while (Date.now() < deadline) {
    for (const move of openCards()) {
      if (seen.has(move.id)) continue;
      seen.add(move.id);
      await note("card", { id: move.id, title: move.title, why: move.why, itemId: move.itemId, options: move.options.map(o => `${o.label}${o.recommended ? "*" : ""}:${o.actions.map(a => a.tool).join("+")}`) });
      await page.waitForTimeout(1500);
      await shot(`card-${move.title}`);
    }
    for (const t of state?.brain?.thoughts ?? []) if (!seen.has(`t:${t.id}`)) { seen.add(`t:${t.id}`); await note("thought", { decision: t.decision, by: t.by, model: t.model, title: t.title, outcome: t.outcome, reason: t.reason }); }
    const neck = JSON.stringify(state?.liveBottleneck ?? state?.bottleneck ?? null);
    if (neck !== lastNeck) { lastNeck = neck; await note("bottleneck", { live: state?.liveBottleneck, queue: state?.bottleneck }); await shot("bottleneck"); }
    await page.waitForTimeout(3000);
  }
  result = `watched ${minutes} min: ${[...seen].filter(s => !s.startsWith("t:")).length} cards, ${[...seen].filter(s => s.startsWith("t:")).length} thoughts`;
}

try {
  if (mode === "ship") await ship();
  else if (mode === "watch") await watch();
  else { await page.waitForTimeout(4000); result = `status: ${state?.items.length ?? 0} items, ${openCards().length} cards`; await note("items", { items: state?.items.map(i => ({ id: i.id, state: i.state, pr: i.prNumber, title: i.title })) }); }
} catch (e) {
  result = `failed: ${e instanceof Error ? e.message : String(e)}`;
  await shot("failed");
} finally {
  await note("result", { result, pageErrors: errors.length });
  await writeFile(`${out}/state.json`, JSON.stringify(state, null, 1));
  await context.close();
  await browser.close();
  const video = (await readdir(`${out}/video`).catch(() => []))[0];
  if (video) await rename(`${out}/video/${video}`, `${out}/video.webm`);
  await writeFile(`${out}/report.md`, [
    `# ${mode}${issue ? ` #${issue}` : ""} on ${repo}`, "", `**${result}**`, "",
    `- ${base} as ${me?.login}, ${new Date(t0).toISOString()}, ${since()}`, `- runner: ${JSON.stringify(runner)}`, `- page errors: ${errors.length}`, "",
    "| t | step |", "| --- | --- |",
    ...timeline.filter(l => !["shot", "socket_open"].includes(l.kind)).map(({ t, kind, ...rest }) => `| ${t} | ${kind} ${JSON.stringify(rest).replace(/\|/g, "/").slice(0, 300)} |`),
  ].join("\n"));
  console.log(`evidence: ${out}`);
  process.exit(result.startsWith("shipped") || mode !== "ship" ? 0 : 1);
}
