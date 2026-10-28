import { art, STOP_LABEL, type StopState } from "../contract";
import { STATIONS, STATION_STATES, drawStation, stationFrame, type StationId } from "./index";

// Dev page web/stations.html: every station in every state, code next to Justin's mockup sprites, and a strip of
// the whole line drawn on the 640x360 art grid at a whole-number scale (what the deck will look like in ?px=1).

const params = new URLSearchParams(location.search);
const K = Math.max(1, Math.round(Number(params.get("k")) || 4));
const frozen = params.has("t") ? Number(params.get("t")) : null;
const showMock = params.get("only") !== "code";
const only = params.get("id") as StationId | null;
const all = Object.keys(STATIONS) as StationId[];
const ids = only && all.includes(only) ? [only] : all;
const out = document.getElementById("out")!;
const live: { cv: HTMLCanvasElement; id: StationId; s: StopState }[] = [];

const el = <K extends keyof HTMLElementTagNameMap>(tag: K, props: Partial<HTMLElementTagNameMap[K]> = {}, ...kids: Node[]) => {
  const e = Object.assign(document.createElement(tag), props); e.append(...kids); return e;
};

// the line, on the art grid: a deck strip with a belt and the six machines, mixed states
const STRIP = { w: 640, h: 120 };
const STRIP_STATES: Record<StationId, StopState> = { repo: "auto", planner: "auto", builder: "working", checks: "working", review: "jammed", gate: "idle" };
const strip = el("canvas", { id: "strip", width: STRIP.w * K, height: STRIP.h * K });
out.append(el("section", {}, el("h1", { textContent: "The line on the 640x360 grid" }), strip));

for (const id of ids) {
  const code = el("div", {}, el("b", { textContent: `${STOP_LABEL[id]} in code` }));
  const mock = el("div", {}, el("b", { textContent: "mockup" }));
  const cr = el("div", { className: "row" }), mr = el("div", { className: "row" });
  const { h } = STATIONS[id];
  for (const s of STATION_STATES) {
    const cv = el("canvas", { width: STATIONS[id].w * K, height: h * K });
    live.push({ cv, id, s });
    cr.append(el("div", { className: "cell" }, cv, el("span", { textContent: s })));
    const im = el("img", { src: art(`${id}-${s}`), alt: `${id} ${s} mockup` });
    im.style.height = `${h * K}px`;
    mr.append(el("div", { className: "cell" }, im, el("span", { textContent: s })));
  }
  code.append(cr); mock.append(mr);
  out.append(el("section", { className: "pair" }, code, ...(showMock ? [mock] : [])));
}

function drawStrip(t: number) {
  const cx = strip.getContext("2d")!;
  cx.setTransform(K, 0, 0, K, 0, 0);
  cx.imageSmoothingEnabled = false;
  cx.fillStyle = "#bc3c0b"; cx.fillRect(0, 0, STRIP.w, 40);
  cx.fillStyle = "#e44e1b"; cx.fillRect(0, 40, STRIP.w, 22);
  cx.fillStyle = "#f6601f"; cx.fillRect(0, 62, STRIP.w, 10);
  // deck plates
  cx.fillStyle = "#432f29"; cx.fillRect(0, 72, STRIP.w, 48);
  cx.fillStyle = "#6b5360"; cx.fillRect(0, 72, STRIP.w, 2);
  cx.fillStyle = "#291b17"; for (let x = 0; x < STRIP.w; x += 32) cx.fillRect(x, 74, 1, 46);
  // belt (7 tall), feet line at its middle
  const belt = 92;
  cx.fillStyle = "#0a0604"; cx.fillRect(0, belt - 4, STRIP.w, 9);
  cx.fillStyle = "#181211"; cx.fillRect(0, belt - 3, STRIP.w, 7);
  cx.fillStyle = "#6d370c"; for (let x = (Math.floor(t * 8) % 8); x < STRIP.w; x += 8) cx.fillRect(x, belt - 1, 3, 2);
  all.forEach((id, i) => drawStation(cx, id, STRIP_STATES[id], t, 60 + i * 102, belt + 6, 1));
}

function tick(now: number) {
  const t = frozen ?? now / 1000;
  for (const { cv, id, s } of live) {
    const cx = cv.getContext("2d")!;
    cx.imageSmoothingEnabled = false;
    cx.clearRect(0, 0, cv.width, cv.height);
    cx.drawImage(stationFrame(id, s, t), 0, 0, cv.width, cv.height);
  }
  drawStrip(t);
  document.body.dataset.ready = "1";
  if (frozen === null) requestAnimationFrame(tick);
}
requestAnimationFrame(tick);
