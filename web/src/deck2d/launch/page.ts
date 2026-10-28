import { ART_PX, LAUNCH, PALETTE_48, SPRITES, createBus, type DeckView } from "../contract";
import { pixelOn } from "../../flags";
import { createArt } from "../engine/art";
import { createPixelCanvas } from "../engine/pixel";
import { createLaunchLayer } from "./index";
import { mountPreview } from "./preview";
import { createPixelLaunch } from "./px";

// /launch.html: the launch build on its own. Sky, clouds, the finished deck's right end, and only the launch layer,
// so the one thing moving is the island -> bridge -> tower -> rocket build. No story, no other build moments, no
// Shippy, no card. Plays by itself; scrub with the bar. ?px=1 shows the pixel deck version (px.ts) on the same
// art-resolution canvas the engine uses.

const VIEW = { x0: 1600, x1: 3260, y0: -280, y1: 640 }; // world rect the camera fits
const LAUNCH_NAMES = ["island", "bridge", "tower"].flatMap((n) => [0, 1, 2, 3].map((i) => `launch-${n}-${i}`));

const cv = document.getElementById("world") as HTMLCanvasElement;
const screen = cv.getContext("2d")!;
const art = createArt([...SPRITES.scene, ...SPRITES.rocket, ...LAUNCH_NAMES]);
const bus = createBus();
const pixel = pixelOn();
const pc = pixel ? createPixelCanvas(cv, ART_PX, new URLSearchParams(location.search).get("pq") === "0" ? undefined : PALETTE_48) : null;
const layer = (pixel ? createPixelLaunch : createLaunchLayer)(art, bus, mountPreview());
const view = { deck: { size: "large", island: "none" }, shipped: 0 } as unknown as DeckView; // the layer only reads view.deck
let cx = screen;

let W = 0, H = 0, DPR = 1, t = 0, last = 0;
const resize = () => { DPR = Math.min(2, devicePixelRatio || 1); W = innerWidth; H = innerHeight; cv.width = Math.round(W * DPR); cv.height = Math.round(H * DPR); };
addEventListener("resize", resize); resize();

function clouds(y: number, scale: number, speed: number, alpha: number) {
  const c = art.get("clouds"); if (!c) return;
  const w = c.naturalWidth * scale, h = c.naturalHeight * scale, off = pixel ? 0 : (t * speed) % w; // calm: pixel clouds hold still
  cx.globalAlpha = pixel ? 1 : alpha;
  for (let x = VIEW.x0 - w - off; x < VIEW.x1 + w; x += w - 1) cx.drawImage(c, Math.round(x), y, Math.round(w), Math.round(h));
  cx.globalAlpha = 1;
}
function sky(w: number, h: number) {
  const sk = art.get("sky"); if (!sk) return;
  const s = Math.max(w / sk.naturalWidth, h / sk.naturalHeight);
  cx.drawImage(sk, Math.round((w - sk.naturalWidth * s) / 2), Math.round((h - sk.naturalHeight * s) / 2), Math.round(sk.naturalWidth * s), Math.round(sk.naturalHeight * s));
}

function frame(now: number) {
  const dt = Math.min(0.05, (now - (last || now)) / 1000); last = now; t += dt;
  const wasBuilt = view.deck?.island === "built";
  layer.update(dt, view);
  if (!wasBuilt && view.deck?.island === "built") setTimeout(() => bus.emit({ type: "launch" }), 900); // show one launch at the end
  const s = Math.min(W / (VIEW.x1 - VIEW.x0), H / (VIEW.y1 - VIEW.y0)), cam = { x: (VIEW.x0 + VIEW.x1) / 2, y: (VIEW.y0 + VIEW.y1) / 2, s };
  if (pc) {
    cx = pc.begin(cam);
    const world = cx.getTransform();
    cx.setTransform(1, 0, 0, 1, 0, 0); cx.fillStyle = "#291b17"; cx.fillRect(0, 0, cx.canvas.width, cx.canvas.height);
    sky(cx.canvas.width, cx.canvas.height);
    cx.setTransform(world);
  } else {
    cx.setTransform(DPR, 0, 0, DPR, 0, 0);
    cx.fillStyle = "#2a1410"; cx.fillRect(0, 0, W, H);
    sky(W, H);
    cx.setTransform(DPR * s, 0, 0, DPR * s, DPR * (W / 2 - cam.x * s), DPR * (H / 2 - cam.y * s));
    cx.imageSmoothingEnabled = true; cx.imageSmoothingQuality = "high";
  }
  clouds(470, 1.1, 5, 0.85);
  const deck = art.get("deck"); if (deck) cx.drawImage(deck, 0, 0);
  layer.draw(cx, "deck");
  layer.draw(cx, "line");
  const rk = art.get("rocket"); // in the smooth version the engine's rocket takes over at the end; stand in for it here
  if (!pixel && rk && view.deck?.island === "built") { const h = 220, w = rk.naturalWidth * h / rk.naturalHeight; cx.drawImage(rk, LAUNCH.x - w / 2, LAUNCH.y + 20 - h, w, h); }
  clouds(600, 1.6, 12, 0.95);
  layer.draw(cx, "front");
  if (pc) { pc.end(); cx = screen; }
  if (!document.body.dataset.deckReady) document.body.dataset.deckReady = "1";
  requestAnimationFrame(frame);
}
art.ready().then(() => requestAnimationFrame(frame));
