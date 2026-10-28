import { LAUNCH, SPRITES, createBus, type DeckView } from "../contract";
import { createArt } from "../engine/art";
import { createLaunchLayer } from "./index";
import { mountPreview } from "./preview";

// /launch.html: the launch build on its own. Sky, clouds, the finished deck's right end, and only the launch layer,
// so the one thing moving is the island -> bridge -> tower -> rocket build. No story, no other build moments, no
// Shippy, no card. Plays by itself; scrub with the bar.

const VIEW = { x0: 1600, x1: 3260, y0: -280, y1: 640 }; // world rect the camera fits
const LAUNCH_NAMES = ["island", "bridge", "tower"].flatMap((n) => [0, 1, 2, 3].map((i) => `launch-${n}-${i}`));

const cv = document.getElementById("world") as HTMLCanvasElement;
const cx = cv.getContext("2d")!;
const art = createArt([...SPRITES.scene, ...SPRITES.rocket, ...LAUNCH_NAMES]);
const layer = createLaunchLayer(art, createBus(), mountPreview());
const view = { deck: { size: "large", island: "none" } } as unknown as DeckView; // the layer only reads view.deck

let W = 0, H = 0, DPR = 1, t = 0, last = 0;
const resize = () => { DPR = Math.min(2, devicePixelRatio || 1); W = innerWidth; H = innerHeight; cv.width = Math.round(W * DPR); cv.height = Math.round(H * DPR); };
addEventListener("resize", resize); resize();

function clouds(y: number, scale: number, speed: number, alpha: number) {
  const c = art.get("clouds"); if (!c) return;
  const w = c.naturalWidth * scale, h = c.naturalHeight * scale, off = (t * speed) % w;
  cx.globalAlpha = alpha;
  for (let x = VIEW.x0 - w - off; x < VIEW.x1 + w; x += w - 1) cx.drawImage(c, x, y, w, h);
  cx.globalAlpha = 1;
}

function frame(now: number) {
  const dt = Math.min(0.05, (now - (last || now)) / 1000); last = now; t += dt;
  layer.update(dt, view);
  cx.setTransform(DPR, 0, 0, DPR, 0, 0);
  cx.fillStyle = "#2a1410"; cx.fillRect(0, 0, W, H);
  const sk = art.get("sky");
  if (sk) { const s = Math.max(W / sk.naturalWidth, H / sk.naturalHeight); cx.drawImage(sk, (W - sk.naturalWidth * s) / 2, (H - sk.naturalHeight * s) / 2, sk.naturalWidth * s, sk.naturalHeight * s); }
  const s = Math.min(W / (VIEW.x1 - VIEW.x0), H / (VIEW.y1 - VIEW.y0));
  cx.setTransform(DPR * s, 0, 0, DPR * s, DPR * (W / 2 - ((VIEW.x0 + VIEW.x1) / 2) * s), DPR * (H / 2 - ((VIEW.y0 + VIEW.y1) / 2) * s));
  cx.imageSmoothingEnabled = true; cx.imageSmoothingQuality = "high";
  clouds(470, 1.1, 5, 0.85);
  const deck = art.get("deck"); if (deck) cx.drawImage(deck, 0, 0);
  layer.draw(cx, "deck");
  layer.draw(cx, "line");
  const rk = art.get("rocket"); // the engine's rocket takes over at the end of the build; stand in for it here
  if (rk && view.deck?.island === "built") { const h = 220, w = rk.naturalWidth * h / rk.naturalHeight; cx.drawImage(rk, LAUNCH.x - w / 2, LAUNCH.y + 20 - h, w, h); }
  clouds(600, 1.6, 12, 0.95);
  layer.draw(cx, "front");
  if (!document.body.dataset.deckReady) document.body.dataset.deckReady = "1";
  requestAnimationFrame(frame);
}
art.ready().then(() => requestAnimationFrame(frame));
