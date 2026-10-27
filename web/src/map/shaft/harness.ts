// Dev harness for the shaft (web/shaft.html, dev server only): the whole vertical factory running on the auto
// driver with the mockup's chips, tags and view buttons, so module agents can see their work in place and the
// screenshot tool (web/scripts/shaft-shot.mjs) can shoot it next to the mockup.
//   ?only=world,belts   load just these modules        ?skip=mine   leave these out
//   ?view=stack|mine|build|checks|launch|line|follow|station:<id>  ?px=1|2|3|0   ?seed=N (repeatable randomness)
//   ?asm=1|2|3  assemblers   ?checks=ci,custom:secrets,custom:bundle,verify,review   ?sources=github,sentry,inbox,posthog
//   ?tags=0  no item tags    ?chips=0  no machine chips    ?hud=0  neither (clean shots)    ?bake=0  skip the static merge

import * as THREE from "three";

import { createIron, type Iron } from "./core";
import { defaultPlan, makeLayout, type Plan } from "./layout";
import { bakeShaft, verifyDyn } from "./bake";
import { ShaftStage, type ShaftView } from "./stage";

THREE.ColorManagement.enabled = false;
const q = new URLSearchParams(location.search);

// repeatable randomness for side-by-side screenshots
const seedQ = q.get("seed");
if (seedQ !== null) {
  let s = Number(seedQ) || 1;
  Math.random = () => {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function planFromQuery(): Plan {
  const plan = defaultPlan();
  const asm = Number(q.get("asm"));
  if (asm >= 0 && asm <= 3 && q.has("asm")) {
    const hs = ["claude_code", "codex", "claude_code"];
    plan.assemblers = Array.from({ length: asm }, (_, i) => ({ id: `asm-${i + 1}`, harness: hs[i] }));
    plan.power = (plan.power ?? []).filter((p) => p.type !== "dynamo" && p.type !== "battery");
    plan.assemblers.forEach((a, i) => {
      plan.power!.push({ id: `dyn-${i + 1}`, type: "dynamo", feeds: [a.id], harness: a.harness });
      if (i === 0) plan.power!.push({ id: `bat-${i + 1}`, type: "battery", feeds: [a.id] });
    });
  }
  const checks = q.get("checks");
  if (checks !== null) {
    plan.checks = checks.split(",").filter(Boolean).map((c) => {
      const [kind, check] = c.split(":");
      return { id: check ? `chk-${check}` : kind, kind, check };
    });
  }
  if (q.get("measure") === "1") plan.measure = { id: "measure" };
  const sources = q.get("sources");
  if (sources !== null) plan.sources = sources.split(",").filter(Boolean);
  return plan;
}

const LABELS: Record<string, string> = {
  planner: "PLANNER", assembler: "ASSEMBLER", ci: "CI INSPECTOR", check: "CHECK", verify: "VERIFY BAY", review: "AI REVIEW",
  gate: "MERGE GATE", launch: "LAUNCH PAD", orbit: "ORBIT WATCH", measure: "MEASURE", steam: "STEAM", dynamo: "DYNAMO", battery: "BATTERY", geothermal: "GEOTHERMAL",
};
const HARNESS: Record<string, string> = { claude_code: "CLAUDE CODE", codex: "CODEX", local: "LOCAL", cursor: "CURSOR", grok: "GROK" };

async function loadModules(I: Iron) {
  const only = q.get("only")?.split(",").filter(Boolean);
  const skip = q.get("skip")?.split(",").filter(Boolean) ?? [];
  const mods = import.meta.glob("./modules/*.js");
  const loaded: string[] = [], failed: string[] = [];
  for (const [file, load] of Object.entries(mods).sort()) {
    const name = file.replace(/^.*\/(.*)\.js$/, "$1");
    if ((only && !only.includes(name)) || skip.includes(name)) continue;
    try {
      const mod = (await load()) as { default?: (I: Iron) => void };
      mod.default?.(I);
      loaded.push(name);
    } catch (e) {
      console.error(`[SHAFT] module ${name} failed to load:`, e);
      failed.push(name);
    }
  }
  return { loaded, failed };
}

async function boot() {
  const canvas = document.getElementById("stage") as HTMLCanvasElement;
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, preserveDrawingBuffer: true });
  renderer.setPixelRatio(1);
  renderer.outputColorSpace = THREE.LinearSRGBColorSpace;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.BasicShadowMap;
  renderer.info.autoReset = false;

  const I = createIron();
  const mods = await loadModules(I);
  const plan = planFromQuery();
  const layout = makeLayout(plan);
  const stage = new ShaftStage(I, layout);
  const labels: Record<string, string> = {};
  for (const s of layout.stations) {
    const h = (s.def as { harness?: string }).harness;
    const chk = (s.def as { check?: string }).check;
    labels[s.id] = s.type === "assembler" && h ? `${HARNESS[h] ?? h.toUpperCase()} ASSEMBLER` : s.type === "check" && chk ? `${chk.toUpperCase()} CHECK` : (LABELS[s.type] ?? s.type.toUpperCase());
  }
  const t0 = performance.now();
  I.build(stage.scene, stage.root, layout, { labels });
  const buildMs = performance.now() - t0;
  stage.applyLook();
  let bakeInfo: unknown = null, verify: unknown = null;
  if (q.get("verify") === "1") verify = verifyDyn(I, stage.root, Number(q.get("verifySec") ?? 40));
  if (q.get("bake") !== "0") bakeInfo = bakeShaft(I, stage.root);

  const view = q.get("view") ?? "build";
  const [v, id] = view.split(":");
  stage.setSize(innerWidth, innerHeight);
  stage.setView(v as ShaftView, id);
  stage.snap();
  stage.pixel = Number(q.get("px") ?? 1);

  // ---------- HUD: the mockup's chips over machines and tags over items ----------
  const hudOff = q.get("hud") === "0";
  const chipsOn = !hudOff && q.get("chips") !== "0";
  let tagsOn = !hudOff && q.get("tags") !== "0" && innerWidth >= 760;
  const chipsEl = document.getElementById("chips")!, tagsEl = document.getElementById("tags")!;
  const STATE_WORD: Record<string, string> = { IDLE: "IDLE", WORKING: "WORKING", BLOCKED: "NEEDS YOU" };
  const chips = new Map<string, { el: HTMLElement; st: HTMLElement; det: HTMLElement; last: string }>();
  if (chipsOn)
    for (const st of I.stationList) {
      if (st.layoutDef.power) continue;
      const el = document.createElement("div");
      el.className = "chip";
      el.dataset.s = "IDLE";
      el.innerHTML = `<div class="nm"><i class="dot"></i><span>${st.label}</span><span class="st"></span></div><div class="row2"><span class="det"></span></div>`;
      el.onclick = () => stage.setView("station", st.id);
      chipsEl.appendChild(el);
      chips.set(st.id, { el, st: el.querySelector(".st")!, det: el.querySelector(".det")!, last: "" });
    }
  const tags = new Map<number, HTMLElement>();
  function placeHud() {
    for (const [sid, c] of chips) {
      const st = I.stations[sid];
      const s = st.blocked ? "BLOCKED" : st.state;
      const qn = I.queueFor(sid);
      const det = st.blocked ? st.prompt ?? "" : (st.detail || "") + (qn > 1 ? ` · ${qn} waiting` : "");
      const sig = s + "|" + det;
      if (sig !== c.last) {
        c.last = sig;
        c.el.dataset.s = s;
        c.st.textContent = STATE_WORD[s] ?? s;
        c.det.textContent = det;
      }
      const [x, y] = stage.project(...stage.chipAnchor(st));
      const off = x < -100 || x > stage.W + 100 || y < -40 || y > stage.H + 40;
      c.el.style.visibility = off ? "hidden" : "visible";
      c.el.style.transform = `translate(${Math.round(x)}px,${Math.round(y)}px) translate(-50%,0)`;
    }
    const seen = new Set<number>();
    if (tagsOn)
      for (const it of I.items) {
        if (it.hidden) continue;
        seen.add(it.num);
        let el = tags.get(it.num);
        if (!el) {
          el = document.createElement("span");
          tagsEl.appendChild(el);
          tags.set(it.num, el);
        }
        const held = it.owner && I.stations[it.owner]?.blocked;
        if (el.textContent !== it.label()) el.textContent = it.label();
        el.className = `tag k-${it.kind}${held ? " held" : ""}`;
        const p = it.mesh.position;
        const [x, y] = stage.project(p.x, p.y + 0.75, p.z);
        el.style.transform = `translate(${Math.round(x)}px,${Math.round(y)}px) translate(-50%,-100%)`;
      }
    for (const [n, el] of tags) if (!seen.has(n)) (el.remove(), tags.delete(n));
  }

  // ---------- input ----------
  document.querySelectorAll<HTMLButtonElement>("[data-view]").forEach((b) => (b.onclick = () => stage.setView(b.dataset.view as ShaftView)));
  const ptrs = new Map<number, { x: number; y: number }>();
  let pinch0 = 0, zoom0 = 1, moved = 0;
  canvas.addEventListener("pointerdown", (e) => {
    ptrs.set(e.pointerId, { x: e.clientX, y: e.clientY });
    canvas.setPointerCapture(e.pointerId);
    moved = 0;
    if (ptrs.size === 2) {
      const [a, b] = [...ptrs.values()];
      pinch0 = Math.hypot(a.x - b.x, a.y - b.y);
      zoom0 = stage.zoom;
    }
  });
  canvas.addEventListener("pointermove", (e) => {
    const p = ptrs.get(e.pointerId);
    if (!p) return;
    const dx = e.clientX - p.x, dy = e.clientY - p.y;
    p.x = e.clientX;
    p.y = e.clientY;
    if (ptrs.size === 2) {
      const [a, b] = [...ptrs.values()];
      const d = Math.hypot(a.x - b.x, a.y - b.y);
      if (pinch0 > 0) stage.zoom = Math.max(0.35, Math.min(3, (zoom0 * pinch0) / d));
      return;
    }
    moved += Math.abs(dx) + Math.abs(dy);
    if (moved >= 4) stage.panBy(dx, dy);
  });
  const end = (e: PointerEvent) => {
    ptrs.delete(e.pointerId);
    if (ptrs.size < 2) pinch0 = 0;
  };
  canvas.addEventListener("pointerup", end);
  canvas.addEventListener("pointercancel", end);
  canvas.addEventListener("wheel", (e) => (e.preventDefault(), stage.zoomBy(Math.exp(e.deltaY * 0.001))), { passive: false });
  addEventListener("resize", () => (renderer.setSize(innerWidth, innerHeight, false), stage.setSize(innerWidth, innerHeight)));
  addEventListener("keydown", (e) => {
    if (e.key === "t") tagsOn = !tagsOn;
    if (e.key === "Escape") stage.setView("build");
  });
  renderer.setSize(innerWidth, innerHeight, false);

  // ---------- loop ----------
  let last = performance.now(), t = I._t ?? 0;
  const render = () => {
    renderer.info.reset();
    stage.render(renderer);
    placeHud();
  };
  const paused = q.get("paused") === "1";
  function frame(now: number) {
    const dt = Math.max(0, Math.min(0.05, (now - last) / 1000));
    last = now;
    if (!paused) {
      t += dt * I.policy.speed;
      I.step(t, dt);
    }
    stage.camStep(dt);
    render();
    requestAnimationFrame(frame);
  }

  // for the screenshot tool and the console
  const api = {
    I, stage, renderer, layout, mods, buildMs, bake: bakeInfo, verify,
    advance(sec: number) {
      I.debug.advance(sec);
      t = I._t ?? t;
    },
    setView(view: string) {
      const [vv, vid] = view.split(":");
      stage.setView(vv as ShaftView, vid);
      stage.snap();
    },
    render,
    info: () => ({ calls: renderer.info.render.calls, triangles: renderer.info.render.triangles, geometries: renderer.info.memory.geometries, textures: renderer.info.memory.textures, programs: renderer.info.programs?.length ?? 0 }),
    stats: () => I.debug.stats(),
    ready: true,
  };
  (window as unknown as { SHAFT: typeof api }).SHAFT = api;
  document.getElementById("loading")!.hidden = true;
  if (q.get("raf") !== "0") requestAnimationFrame(frame);
  else render();
}

boot().catch((e) => {
  console.error(e);
  document.getElementById("loading")!.textContent = "SHAFT FAILED: " + (e as Error).message;
});
