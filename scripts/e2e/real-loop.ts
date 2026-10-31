// Real-loop driver: plays the owner's side of the REAL deck (real server, runner, Spark and GitHub) in a recorded
// Chromium, and writes evidence a person can check. Taps go through the deck's own buttons; the page's socket frames
// are read for state. Nothing here fakes a stage: an item counts as shipped only when GitHub says its PR merged.
//
//   bun scripts/e2e/real-loop.ts status              who am I, is the runner online, what's on the line
//   bun scripts/e2e/real-loop.ts ship 30             Testing #30 through Planner → Builder → Checks → Review → Gate → Launch
//   bun scripts/e2e/real-loop.ts watch 10            record 10 minutes of what Shippy notices (cards, bottleneck, thoughts)
//   bun scripts/e2e/real-loop.ts look              ~30s: make Shippy look at the repo now, print what he flags and suggests
//                                                    (E2E_EXPECT="#39" exits 1 unless his card names it)
//   bun scripts/e2e/real-loop.ts fix               Shippy's whole loop on a red PR: look, yes on his fix card, ship the fix
//                                                    issue he files, wait for the red PR to go green, tap his follow-up
//   bun scripts/e2e/real-loop.ts park              set aside queued items nobody started (no plan job, 6h+ old), the deck's own
//                                                    Park; `unpark` puts back exactly what park set aside
//   bun scripts/e2e/real-loop.ts forget              start learned trust over (every yes this script tapped counts), so a
//                                                    filmed take begins at zero dots
//
// Env: SHIPTORIO_URL (https://shiptorio.dev), SHIPTORIO_REPO (r3dbars/testing), E2E_OUT (runner/.work/e2e/<stamp>-<mode>),
//      E2E_MINUTES (ship: 45), E2E_PHONE=1 (390x844 instead of 1280x720), GH_TOKEN (read-only GitHub checks).
// Sign-in, first that is set:
//      E2E_COOKIE_FILE   a cookie header saved by an earlier run (default runner/.work/e2e/cookie, 0600, gitignored)
//      E2E_PASS          the JSON from `node scripts/e2e/owner-pass.mjs` on a machine with server/.dev.vars (60s to use)
//      E2E_OWNER_KEY (staging's second owner key, server/src/auth.ts) or SESSION_SECRET, + APP_PASSWORD (shiptorio.dev: `bun --env-file=$HOME/.config/shiptorio/staging.env …`)
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
if (!["status", "ship", "watch", "look", "fix", "park", "unpark", "forget"].includes(mode)) throw new Error("Use status, ship ISSUE, watch MINUTES, look, fix, park, unpark or forget");
let issue = mode === "ship" ? Number(arg) : 0; // fix: the issue Shippy files
if (mode === "ship" && !(Number.isInteger(issue) && issue > 0)) throw new Error("Usage: real-loop.ts ship ISSUE");
let itemId = `gh-${issue}`;
const minutes = Number(mode === "watch" ? arg || 10 : mode === "look" ? 1 : process.env.E2E_MINUTES || 45);

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
  else if ((process.env.E2E_OWNER_KEY || process.env.SESSION_SECRET) && process.env.APP_PASSWORD) {
    const gate = await fetch(`${base}/access`, { method: "POST", headers: { origin: base }, body: new URLSearchParams({ password: process.env.APP_PASSWORD }), redirect: "manual" });
    if (gate.status !== 303) throw new Error(`Preview gate refused (${gate.status})`);
    access = gate.headers.get("set-cookie")!.split(";")[0];
    const at = Date.now();
    pass = { login: "r3dbars", at, proof: await ownerProof((process.env.E2E_OWNER_KEY || process.env.SESSION_SECRET)!, "r3dbars", at) };
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

/** Sends messages on their own socket once the snapshot is in, the way the deck would; returns that snapshot. */
async function sendOnce(message: Record<string, unknown> | ((s: FactoryState) => Record<string, unknown>[])): Promise<FactoryState> {
  const socket = new WebSocket(`${base.replace(/^http/, "ws")}/api/repos/${repo}/factory`, { headers: { cookie, origin: base } } as unknown as string[]);
  const snapshot = await new Promise<FactoryState>((ok, fail) => {
    const timer = setTimeout(() => fail(new Error("no snapshot in 20s")), 20_000);
    socket.onmessage = e => { const msg = JSON.parse(String(e.data)); if (msg.type === "snapshot") { clearTimeout(timer); ok(msg.state); } };
    socket.onerror = () => fail(new Error("socket error"));
  });
  for (const m of typeof message === "function" ? message(snapshot) : [message]) { socket.send(JSON.stringify(m)); await Bun.sleep(400); }
  await Bun.sleep(3000);
  socket.close();
  return snapshot;
}

if (mode === "park" || mode === "unpark") {
  // The cart callout's Park: off the line, no plan card, not counted as anyone's pile. Reversible with unpark.
  const parkedFile = `${work}/parked.json`;
  const jobs = (await api<{ itemId: string; status: string }[] | { jobs: { itemId: string; status: string }[] }>(`/api/repos/${repo}/runner/jobs`)).body;
  const active = new Set((Array.isArray(jobs) ? jobs : jobs?.jobs ?? []).filter(j => ["planning", "awaiting_approval", "ready", "running"].includes(j.status)).map(j => j.itemId));
  const before = existsSync(parkedFile) ? JSON.parse(await readFile(parkedFile, "utf8")) as string[] : [];
  let ids: string[] = [];
  await sendOnce(s => {
    ids = mode === "park"
      ? s.items.filter(i => i.state === "queued" && !i.priority && !active.has(i.id) && Date.now() - i.updatedAt > 6 * 3_600_000).map(i => i.id)
      : before.filter(id => s.items.some(i => i.id === id && i.priority === "park"));
    return ids.map(itemId => ({ type: "set_priority", itemId, priority: mode === "park" ? "park" : "none" }));
  });
  await writeFile(parkedFile, JSON.stringify(mode === "park" ? [...new Set([...before, ...ids])] : before.filter(id => !ids.includes(id))));
  await note(mode === "park" ? "parked" : "unparked", { items: ids });
  process.exit(0);
}

if (mode === "forget") {
  // The same message "Ask me again" sends, with "*" for every kind (server/src/learn.ts forgetAll).
  const snapshot = await sendOnce({ type: "unlearn", key: "*" });
  await note("forgot", { learnedBefore: (snapshot as { learned?: unknown }).learned ?? [] });
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
const autoTaps: string[] = []; // "gh-46:approve_runner_job": a card the factory tapped on its own (a kind you taught it)
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
    if (msg.type === "log") { logs.push(msg.text); if (msg.approvedBy === "autonomy" && msg.itemId) autoTaps.push(`${msg.itemId}:${msg.tool}`); void note("log", { itemId: msg.itemId, level: msg.level, text: msg.text, tool: msg.tool, actor: msg.actor, approvedBy: msg.approvedBy }); }
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

// Every card the deck shows is a recommendation: screenshot it once, with the thoughts (and agent tool calls)
// that led there, into recommendations.jsonl. scripts/e2e/story.ts turns a run folder into one page.
const seenCards = new Set<string>(), seenThoughts = new Set<string>();
async function recordCard() {
  const card = await cardOnScreen().catch(() => null);
  if (!card || !card.id || seenCards.has(card.id)) return;
  seenCards.add(card.id);
  const thoughts = (state?.brain?.thoughts ?? []).filter(t => !seenThoughts.has(t.id));
  for (const t of thoughts) seenThoughts.add(t.id);
  const file = `${String(++shotN).padStart(2, "0")}-card-${card.id.replace(/[^\w-]+/g, "-").slice(0, 40)}.png`;
  await page.screenshot({ path: `${out}/shots/${file}` }).catch(() => {});
  const move = state?.deck?.find(m => m.id === card.id) ?? (state?.move?.id === card.id ? state.move : undefined);
  await appendFile(`${out}/recommendations.jsonl`, JSON.stringify({
    t: since(), at: new Date().toISOString(), shot: file, card,
    why: move?.why, actions: move?.options.map(o => ({ label: o.label, actions: o.actions.map(a => ({ tool: a.tool, args: a.args })) })),
    holdingBack: state?.holdingBack ?? null,
    thoughts: thoughts.map(t => ({ at: new Date(t.at).toISOString(), decision: t.decision, by: t.by, model: t.model, ms: t.ms, title: t.title, outcome: t.outcome, reason: t.reason, steps: t.steps ?? [] })),
  }) + "\n");
  await note("recommendation", { card: card.id, title: card.title, shot: file });
}
for (const t of state?.brain?.thoughts ?? []) seenThoughts.add(t.id); // only new thinking counts toward a card
const recorder = setInterval(() => void recordCard(), 1500);
await recordCard();

const item = (): FactoryItem | undefined => state?.items.find(i => i.id === itemId);
const openCards = (): Move[] => state ? [...(state.deck ?? []), ...(state.move ? [state.move] : [])].filter((m, i, all) => all.findIndex(x => x.id === m.id) === i) : [];
const TAP = new Set(["plan_runner_job", "approve_runner_job", "request_merge", "approve_review", "approve_human_review", "human_approve"]);
const deadline = t0 + minutes * 60_000;
let result = "unfinished";

async function startIssue() {
  // The deck's own inbox: Codex engine card → issues, "Next issue" until #N, then Plan.
  for (let i = 0; i < 60 && Date.now() < deadline; i++) {
    const card = await cardOnScreen();
    // Queued counts as on the line: its Plan card is on the deck, and the ship loop presses it.
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
  let lastState = "", lastStage = "", tapped = new Set<string>(), reloaded = false, failedBuilds = 0, waitingSince = Date.now();
  while (Date.now() < deadline) {
    await page.waitForTimeout(2000);
    const it = item();
    // The factory deals one plan card at a time. Another item's plan card left undecided (an old "failed twice"
    // retry) keeps ours from ever being dealt: after 20s, set it aside with the deck's own Later, like a player would.
    if (it?.state === "queued" && !openCards().some(m => m.itemId === itemId)) {
      const blocker = openCards().find(m => m.itemId && m.itemId !== itemId && m.options.some(o => o.actions.some(a => a.tool === "plan_runner_job")));
      if (blocker && Date.now() - waitingSince > 20_000 && !tapped.has(`later:${blocker.id}`)) {
        tapped.add(`later:${blocker.id}`);
        await note("later", { card: blocker.title, why: `its plan slot blocks ${itemId}` });
        for (let i = 0; i < 20; i++) { if ((await cardOnScreen())?.id === blocker.id) { await shot("plan-slot-blocked"); await press("later"); break; } if (i >= 3 && await cardOnScreen()) await press("later"); await page.waitForTimeout(1200); }
      }
    } else waitingSince = Date.now();
    const stage = state?.pipeline?.filter(p => p.itemIds.includes(itemId)).map(p => `${p.id}:${p.state}`).join(",") ?? "";
    if (it && (it.state !== lastState || stage !== lastStage)) {
      const newlyRejected = it.state === "rejected" && lastState !== "rejected"; // replanning keeps it rejected; count arrivals only
      lastState = it.state; lastStage = stage;
      await note("item", { state: it.state, pr: it.prNumber, stage, scars: it.scars?.length ?? 0 });
      await shot(`${it.state}${it.prNumber ? `-pr${it.prNumber}` : ""}-${stage.split(",")[0] ?? ""}`);
      // Two failed builds in a row is a broken agent (out of usage, signed out), not something more taps fix.
      if (newlyRejected && ++failedBuilds >= 2) { result = `stopped: the build failed twice: ${it.failure ?? "no reason given"}`; return; }
    }
    if (it?.state === "launched") {
      const pr = it.prNumber ? await gh<{ merged: boolean; merged_at: string; merge_commit_sha: string; html_url: string }>(`/pulls/${it.prNumber}`) : null;
      await note("github_pr", { pr: it.prNumber, merged: pr?.merged, merged_at: pr?.merged_at, sha: pr?.merge_commit_sha, url: pr?.html_url });
      await page.waitForTimeout(6000); // let the rocket fly on camera
      await shot("launched");
      result = pr?.merged ? `shipped: PR #${it.prNumber} merged on GitHub (${pr.merge_commit_sha?.slice(0, 7)})` : `launched in the deck but GitHub says PR #${it.prNumber} is not merged`;
      // The climax check: which of this item's cards the factory did on its own, and what it has learned so far.
      const own = autoTaps.filter(t => t.startsWith(`${itemId}:`)).map(t => t.slice(itemId.length + 1));
      await note("learned", { onItsOwn: own, learned: state?.learned ?? [] });
      result += own.length ? `; the factory did ${own.join(" + ")} on its own` : "; every card was the player's tap";
      return;
    }
    for (const move of openCards()) {
      if (move.itemId !== itemId || tapped.has(move.id)) continue;
      const option = continueOption(move);
      const tools = option.actions.map(a => a.tool);
      if (!tools.length || !tools.every(t => TAP.has(t))) { if (!tapped.has(`skip:${move.id}`)) { tapped.add(`skip:${move.id}`); await note("left_for_human", { card: move.title, tools }); await shot("needs-human"); } continue; }
      if (move.locked) continue;
      const hold = tools.includes("request_merge");
      // Wait for the deck to show this exact card, then press its real button. The deck shows one card at a time:
      // another card on top gets Later (the player's own "not now"), and a page still showing the onboarding inbox is
      // reloaded once on the plain live deck. A card that never shows is tried again on the next pass.
      let onScreen = false;
      for (let i = 0; i < 30 && !onScreen; i++) {
        const showing = await cardOnScreen();
        onScreen = showing?.id === move.id;
        if (onScreen) break;
        if (showing && openCards().some(m => m.id === showing.id) && i >= 3) { await note("later", { card: showing.title, why: `ahead of ${itemId}` }); await press("later"); await page.waitForTimeout(1200); continue; }
        if (showing && !reloaded && i >= 5) { reloaded = true; await note("reload", { showing: showing.title }); await page.goto(deckUrl); await page.waitForSelector("body[data-deck-ready]", { timeout: 30_000 }).catch(() => {}); await page.waitForTimeout(2500); continue; }
        await page.waitForTimeout(1000);
      }
      if (!onScreen) { await note("card_not_on_screen", { card: move.title, showing: await cardOnScreen() }); await shot("card-missing"); continue; }
      tapped.add(move.id);
      await shot(`card-${tools[0]}`);
      await press("approve", hold);
      await note("tapped", { card: move.title, tools, option: option.label, hold, learn: move.learn });
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

async function look() {
  // Shippy's whole loop in one pass: re-read GitHub, CI and the factory, pick ONE bottleneck, deal ONE card.
  const known = new Set((state?.brain?.thoughts ?? []).map(t => t.id));
  const unlocks = () => openCards().filter(m => m.id.startsWith("unlock:"));
  await note("before", { holdingBack: state?.holdingBack ?? null, cards: unlocks().map(m => m.title) });
  const asked = Date.now();
  await sendOnce({ type: "brain_look" });
  let fresh: NonNullable<FactoryState["brain"]>["thoughts"] = [];
  while (Date.now() - asked < 45_000) {
    fresh = (state?.brain?.thoughts ?? []).filter(t => !known.has(t.id) && t.decision === "diagnose");
    if (fresh.length) break;
    await page.waitForTimeout(1000);
  }
  await page.waitForTimeout(2500); // let the card land on the deck
  for (const t of fresh) await note("thought", { by: t.by, model: t.model, title: t.title, outcome: t.outcome, reason: t.reason });
  const neck = state?.holdingBack, card = unlocks()[0];
  await note("after", { holdingBack: neck ?? null, card: card && { title: card.title, why: card.why, options: card.options.map(o => o.label) } });
  await shot("shippy-look");
  const said = `${neck?.title ?? "nothing holding back"} → ${card?.title ?? "no card"}`;
  result = fresh.length ? `Shippy looked in ${((Date.now() - asked) / 1000).toFixed(0)}s (${fresh[0].by}): ${said}` : `no new look in 45s (day's cap or a look <20s ago?): ${said}`;
  const expect = process.env.E2E_EXPECT;
  if (expect && ![neck?.title, neck?.why, card?.title, card?.why].some(t => t?.includes(expect))) { result = `MISSED ${expect}: ${result}`; process.exitCode = 1; }
}

const waitFor = async <T>(test: () => T | undefined | null | false, ms: number): Promise<T | undefined> => {
  for (const until = Date.now() + ms; Date.now() < until; await page.waitForTimeout(1000)) { const v = test(); if (v) return v; }
};
/** Press a card's own button once the deck shows it, setting aside (Later) any card on top of it. */
async function pressWhenShown(id: string, hold = false) {
  for (let i = 0; i < 30; i++) {
    const showing = await cardOnScreen();
    if (showing?.id === id) { await shot(`card-${showing.title}`); await press("approve", hold); return note("tapped", { card: showing.title, yes: showing.yes }); }
    if (showing && i >= 3) { await note("later", { card: showing.title, why: `ahead of ${id}` }); await press("later"); }
    await page.waitForTimeout(1200);
  }
  throw new Error(`${id} never came up on the deck`);
}

async function fix() {
  await look();
  const card = openCards().find(m => m.id.startsWith("unlock:") && continueOption(m).actions[0]?.tool === "fix_failing_pr");
  if (!card) { result = `no red-PR card: ${result}`; process.exitCode = 1; return; }
  const pr = Number(continueOption(card).actions[0].args.pr);
  const looked = result;
  await note("red_pr", { pr, card: card.title, why: card.why });
  await pressWhenShown(card.id);
  const filed = await waitFor(() => logs.map(t => /Filed #(\d+) to fix .* on #(\d+)/.exec(t)).find(m => m && Number(m[2]) === pr), 60_000);
  if (!filed) throw new Error(`Shippy filed no fix for #${pr}: ${logs.slice(-3).join(" | ")}`);
  issue = Number(filed[1]); itemId = `gh-${issue}`;
  await note("fix_issue", { issue, pr, github: await gh<{ title: string }>(`/issues/${issue}`).then(i => i?.title) });
  await ship(); // plan → build → checks → review → Ship it, through the deck's own buttons
  if (!result.startsWith("shipped")) return;
  const shipped = result;
  await note("brought_in", { log: await waitFor(() => logs.find(t => t.includes(`into #${pr}`)), 120_000) ?? null });
  // #pr's checks run again on the fix; Shippy checks the result himself and deals his follow-up.
  const win = await waitFor(() => openCards().find(m => m.id === `win:fix:${pr}`), 25 * 60_000);
  await note("follow_up", { card: win && { title: win.title, why: win.why }, logs: logs.filter(t => t.includes(`#${pr}`)).slice(-3) });
  await shot("thats-fixed");
  if (!win) { result = `${shipped}, but no follow-up for #${pr} in 25 min`; process.exitCode = 1; return; }
  await pressWhenShown(win.id);
  result = `loop closed: ${looked.replace(/^Shippy looked in \S+ \(\w+\): /, "")} → filed #${issue} → ${shipped} → #${pr} green → "${win.title}: ${win.why}"`;
}

try {
  if (mode === "ship") await ship();
  else if (mode === "fix") await fix();
  else if (mode === "watch") await watch();
  else if (mode === "look") await look();
  else { await page.waitForTimeout(4000); result = `status: ${state?.items.length ?? 0} items, ${openCards().length} cards`; await note("items", { items: state?.items.map(i => ({ id: i.id, state: i.state, pr: i.prNumber, title: i.title })) }); }
} catch (e) {
  result = `failed: ${e instanceof Error ? e.message : String(e)}`;
  await shot("failed");
} finally {
  clearInterval(recorder); await recordCard();
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
  process.exit(process.exitCode ? Number(process.exitCode) : result.startsWith("shipped") || mode !== "ship" ? 0 : 1); // look's E2E_EXPECT miss sets exitCode
}
