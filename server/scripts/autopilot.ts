// Dogfood autopilot: plays the owner's side of a live factory so a test repo can run hands-off.
// It connects like the browser does and taps Spark's recommended option on a short allowlist of
// cards (plan, approve plan, launch a fully checked PR, accept a launch permit). It never overrules
// a failed station, never launches a locked card, and never dismisses or researches. Every tap,
// skip, log line and Spark thought goes to stdout and a JSONL file under gitignored runner/.work/.
//
//   SHIPTORIO_REPO=r3dbars/testing bun run autopilot            # 120 minutes
//   AUTOPILOT_MINUTES=30 AUTOPILOT_DRY=1 bun run autopilot      # watch only, tap nothing
//   AUTOPILOT_HOLD=gh-7,gh-9 bun run autopilot                   # never launch these items
import { mkdir, appendFile } from "node:fs/promises";
import { resolve } from "node:path";
import type { FactoryState, Move, ServerToWeb } from "@shiptorio/shared";
import { allowedTap } from "../src/autopilot";
import { BASES, previewSession } from "./preview-session";

const base = process.env.SHIPTORIO_URL || "https://shiptorio.com";
const repo = (process.env.SHIPTORIO_REPO || "").toLowerCase();
if (!BASES.includes(base) || !/^[\w.-]+\/[\w.-]+$/.test(repo)) throw new Error("Set SHIPTORIO_REPO=owner/repo");
if (repo === "r3dbars/shiptorio" && process.env.AUTOPILOT_ALLOW_MAIN_REPO !== "1") throw new Error("Autopilot is for test repos");
const minutes = Number(process.env.AUTOPILOT_MINUTES || 120);
const dry = process.env.AUTOPILOT_DRY === "1";
const dir = resolve(import.meta.dir, "../../runner/.work");
const file = resolve(dir, `autopilot-${repo.replace("/", "-")}.jsonl`);
await mkdir(dir, { recursive: true });

const record = async (kind: string, data: Record<string, unknown>) => {
  const line = { at: new Date().toISOString(), kind, ...data };
  console.log(JSON.stringify(line));
  await appendFile(file, JSON.stringify(line) + "\n");
};

const acted = new Map<string, number>(), skipped = new Set<string>(), thoughts = new Set<string>();
// Every plan tap spends one of the owner's daily runs; a plan that keeps failing would burn them all.
const MAX_PLANS_PER_ITEM = Number(process.env.AUTOPILOT_MAX_PLANS || 3);
const plans = new Map<string, number>();
const held = new Set((process.env.AUTOPILOT_HOLD || "").split(",").map(s => s.trim()).filter(Boolean));
let cards: Move[] = [];
let ws: WebSocket | null = null;
const deadline = Date.now() + minutes * 60_000;

function take(state: FactoryState) {
  cards = state.deck?.length ? state.deck : state.move ? [state.move] : [];
  for (const t of [...(state.brain?.thoughts ?? [])].reverse()) {
    if (thoughts.has(t.id)) continue;
    thoughts.add(t.id);
    void record("thought", { decision: t.decision, by: t.by, model: t.model, ms: t.ms, itemId: t.itemId, title: t.title, outcome: t.outcome, reason: t.reason });
  }
  const items = state.items.map(i => ({ id: i.id, state: i.state, pr: i.prNumber, scars: i.scars?.length ?? 0 }));
  void record("items", { items, automated: state.autonomy?.automated, districts: state.autonomy?.districts });
}

async function tap() {
  if (!ws || ws.readyState !== WebSocket.OPEN) return;
  for (const card of cards) {
    // A tap the server ignored (stale card) gets one more try after three minutes.
    const last = acted.get(card.id);
    if (last && Date.now() - last < 180_000) continue;
    const pick = allowedTap(card, held);
    if ("skip" in pick) {
      if (!skipped.has(card.id)) { skipped.add(card.id); await record("skip", { card: card.title, itemId: card.itemId, why: pick.skip }); }
      continue;
    }
    if (pick.why === "plan_runner_job" && card.itemId) {
      const tries = plans.get(card.itemId) ?? 0;
      if (tries >= MAX_PLANS_PER_ITEM) {
        if (!skipped.has(card.id)) { skipped.add(card.id); await record("skip", { card: card.title, itemId: card.itemId, why: `planned ${tries} times already; leaving it for a human` }); }
        continue;
      }
      plans.set(card.itemId, tries + 1);
    }
    acted.set(card.id, Date.now());
    await record(dry ? "would_tap" : "tap", { card: card.title, itemId: card.itemId, option: pick.optionId, why: pick.why, url: card.url });
    if (!dry) ws.send(JSON.stringify({ type: "choose_move", moveId: card.id, optionId: pick.optionId }));
  }
}

async function connect() {
  const cookie = await previewSession(base);
  const socket = new WebSocket(`${base.replace(/^http/, "ws")}/api/repos/${repo}/factory`, { headers: { cookie, origin: base } } as any);
  ws = socket;
  socket.onmessage = (e) => {
    let msg: ServerToWeb;
    try { msg = JSON.parse(String(e.data)); } catch { return; }
    if (msg.type === "snapshot") take(msg.state);
    else if (msg.type === "deck") cards = msg.deck;
    else if (msg.type === "move") cards = [msg.move, ...cards.filter(c => c.id !== msg.move.id)];
    else if (msg.type === "log") void record("log", { level: msg.level, text: msg.text, itemId: msg.itemId, actor: msg.actor, tool: msg.tool, reason: msg.reason, approvedBy: msg.approvedBy });
    else if (msg.type === "autonomy_unlocked") void record("unlock", { level: msg.level, district: msg.district, text: msg.text });
    else if (msg.type === "move_resolved") void record("resolved", { moveId: msg.moveId, optionId: msg.optionId, actor: msg.actor });
  };
  socket.onclose = (e) => { if (ws === socket) ws = null; void record("closed", { code: e.code, reason: e.reason }); };
  await new Promise<void>((ok, fail) => { socket.onopen = () => ok(); socket.onerror = () => fail(new Error("socket error")); });
}

await record("start", { repo, base, minutes, dry, held: [...held] });
while (Date.now() < deadline) {
  try {
    // Reconnect every two minutes for a fresh snapshot instead of applying patches.
    await connect();
    const until = Math.min(deadline, Date.now() + 120_000);
    while (Date.now() < until && ws) { await tap(); await Bun.sleep(5_000); }
    ws?.close();
  } catch (error) {
    await record("error", { error: String(error) });
    await Bun.sleep(15_000);
  }
}
await record("stop", { acted: acted.size });
process.exit(0);
