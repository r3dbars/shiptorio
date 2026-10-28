// Dev preview for Shippy (web/shippy.html): a bare deck with the five machines, Shippy in the corner, and buttons
// for every place and pose. "Story" loops the job he was built for: unfold, walk to Review, pull the lever, cheer,
// come home. ?speed=0.25 slows everything down to check frames.
import { BELT_Y, DECK, STOP_X, art, type ArtLoader, type ShippyPose, type ShippyView, type StopId } from "../contract";
import { createShippy } from "./shippy";

function loader(names: string[]): ArtLoader {
  const imgs = new Map<string, HTMLImageElement>();
  const loads = names.map((n) => new Promise<void>((done) => {
    const im = new Image();
    im.onload = () => { imgs.set(n, im); done(); };
    im.onerror = () => done();
    im.src = art(n);
  }));
  return { get: (n) => imgs.get(n) ?? null, ready: () => Promise.all(loads).then(() => {}) };
}

const MACHINES: StopId[] = ["repo", "builder", "checks", "review", "gate"];
const SHIPPY = ["0", "1", "2", "3", "4", "5", "lever", "happy", "alarm", "peek"].map((n) => `shippy-${n}`);
const artLoader = loader(["deck", ...MACHINES.map((m) => `${m}-idle`), ...SHIPPY]);
const shippy = createShippy(artLoader);
const speed = Number(new URLSearchParams(location.search).get("speed")) || 1;

let view: ShippyView = { pose: "folded", at: "corner" };
let story: number | null = null;

// ---- controls ----
const bar = document.getElementById("bar")!;
const buttons: { el: HTMLButtonElement; on: () => boolean }[] = [];
function group(label: string, items: [string, () => void, () => boolean][]) {
  const s = document.createElement("span");
  s.textContent = label;
  bar.append(s);
  for (const [text, run, on] of items) {
    const el = document.createElement("button");
    el.textContent = text;
    el.onclick = () => { if (text !== "Story") stopStory(); run(); };
    bar.append(el);
    buttons.push({ el, on });
  }
}
const set = (v: Partial<ShippyView>) => { view = { ...view, ...v }; };
const at = (a: ShippyView["at"]) => () => view.at === a;
const pose = (p: ShippyPose) => () => view.pose === p;
group("Corner", [
  ["Home", () => set({ at: "corner", pose: "folded" }), at("corner")],
  ...(["peek", "happy", "alarmed"] as ShippyPose[]).map((p) => [p, () => set({ at: "corner", pose: p }), () => view.at === "corner" && view.pose === p] as [string, () => void, () => boolean]),
]);
group("Go to", MACHINES.map((m) => [m, () => set({ at: m, pose: view.pose === "folded" ? "walking" : view.pose }), at(m)]));
group("Pose", (["walking", "lever", "happy", "alarmed", "peek"] as ShippyPose[]).map((p) => [p, () => set({ pose: p }), pose(p)]));
group("Loop", [["Story", () => (story === null ? startStory() : stopStory()), () => story !== null]]);

function stopStory() { if (story !== null) clearTimeout(story); story = null; }
function startStory() {
  const beats: [number, ShippyView][] = [
    [1.6, { at: "corner", pose: "peek" }], [0.8, { at: "corner", pose: "happy" }],
    [4.2, { at: "review", pose: "walking" }], [2.8, { at: "review", pose: "lever" }], [1.4, { at: "review", pose: "happy" }],
    [2.2, { at: "gate", pose: "alarmed" }], [3, { at: "corner", pose: "folded" }],
  ];
  let i = 0;
  const next = () => { const [s, v] = beats[i++ % beats.length]; view = v; story = window.setTimeout(next, (s * 1000) / speed); };
  next();
}

// ---- draw ----
const canvas = document.getElementById("c") as HTMLCanvasElement;
const ctx = canvas.getContext("2d")!;
let last = performance.now();
function frame(now: number) {
  const dt = ((now - last) / 1000) * speed;
  last = now;
  shippy.update(dt, view);
  const dpr = devicePixelRatio || 1, w = canvas.clientWidth, h = canvas.clientHeight;
  if (canvas.width !== Math.round(w * dpr) || canvas.height !== Math.round(h * dpr)) { canvas.width = Math.round(w * dpr); canvas.height = Math.round(h * dpr); }
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, w, h);
  // world: fit the deck's width, centred vertically
  const s = Math.min((w - 32) / DECK.w, (h - 40) / DECK.h);
  ctx.save();
  ctx.translate((w - DECK.w * s) / 2, Math.max(70, (h - DECK.h * s) / 2));
  ctx.scale(s, s);
  const deck = artLoader.get("deck");
  if (deck) ctx.drawImage(deck, 0, 0);
  for (const m of MACHINES) {
    const im = artLoader.get(`${m}-idle`);
    if (!im) continue;
    const mh = m === "repo" ? 178 : 150, mw = (im.naturalWidth * mh) / im.naturalHeight;
    ctx.drawImage(im, STOP_X[m] - mw / 2, BELT_Y + 42 - mh, mw, mh);
  }
  shippy.drawWorld(ctx);
  ctx.restore();
  // the corner box, in screen px (same place the game will keep him)
  const box = Math.min(84, w * 0.2);
  ctx.strokeStyle = "rgba(244,234,216,0.15)";
  ctx.strokeRect(12.5, 12.5, box, box);
  shippy.drawCorner(ctx, 12, 12, box);
  ctx.fillStyle = "rgba(244,234,216,0.7)";
  ctx.font = "12px Silkscreen, monospace";
  const st = shippy.state;
  ctx.fillText(`corner ${st.corner} · deck ${st.world} · ${view.at} / ${view.pose}`, box + 28, 30);
  for (const b of buttons) b.el.setAttribute("aria-pressed", String(b.on()));
  requestAnimationFrame(frame);
}
artLoader.ready().then(() => { document.body.dataset.shippyReady = ""; requestAnimationFrame(frame); });
