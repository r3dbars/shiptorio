// The welcome intro's live factory (ui/Intro.tsx): one floating island drawn on a 2D canvas that tells the
// story beat by beat. Crates ride the belt, pile up at your gate, drain when you say yes, and pass on their
// own once you automate. Kept apart from the real map (map/) on purpose: it's a cartoon of the idea, not
// your factory.

export interface SceneParams {
  belt?: number;
  checks?: number; // 0..3 stations on the line
  gate?: "none" | "closed" | "open";
  spawn?: number; // ms between new crates, 0 = none
  spot?: number; // spotlight on your gate
  score?: number; // counters up top
  markers?: number; // the moving bottleneck
  mines?: number; // sources plugging in
  party?: number; // the payoff: satellites, rockets, customers
  auto?: number; // the gate runs itself for safe crates
  rise?: number; // the island rises in (first beat)
  ambient?: number; // title screen: everything running quietly
}

interface Crate { x: number; s: 0 | 1 | 2; safe: boolean; c: string; fast?: boolean; passed?: boolean; dead?: boolean }
interface Rocket { x: number; y: number; v: number }
interface Spark { x: number; y: number; vx: number; vy: number; life: number; c: string }
interface Person { x: number; y: number; tx: number; ty: number; dead?: boolean }

const NAMES = ["/checkout", "/cart", "/api", "/auth", "/docs"];
const X = { start: 0.08, agent: 0.2, checks: [0.34, 0.46, 0.58], gate: 0.72, pad: 0.88 };
const C = {
  moss: "#4f7d3b", mossHi: "#6a9a4f", mossLo: "#2f5326", rim: "#1e3a22", rock: "#6a5a4e",
  steel: "#8a94a3", amber: "#e3a33f", green: "#6cc28c", red: "#e8685c", blue: "#7aa7d9", ink: "#ece7dc", dark: "#12141a",
  ore: "#c9a46b", sentry: "#b48bea", posthog: "#f2cf6b", bldg: "#c9c0b0", roof: "#a35f3a",
};

export function startScene(cv: HTMLCanvasElement) {
  const cx = cv.getContext("2d")!;
  const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
  let W = 0, H = 0, raf = 0, last = performance.now(), beatT = 0, autoT = 9;
  let p: SceneParams = {};
  let items: Crate[] = [], pile = 0, rockets: Rocket[] = [], sparks: Spark[] = [], people: Person[] = [];
  let shipped = 0, customers = 0, spawnAcc = 0, drainAcc = 0, peopleAcc = 0, gateLift = 0, by0 = 0;

  const size = () => {
    const r = cv.getBoundingClientRect(), d = devicePixelRatio || 1;
    W = r.width; H = r.height; cv.width = W * d; cv.height = H * d; cx.setTransform(d, 0, 0, d, 0, 0);
  };
  size();
  addEventListener("resize", size);

  const set = (np: SceneParams) => { p = { ...p, ...np }; beatT = 0; if (np.auto) autoT = 0; };

  function step(dt: number) {
    const by = H * 0.41, speed = W * 0.32, gx = W * X.gate, open = p.gate === "open";
    if (p.belt && p.spawn) {
      spawnAcc += dt * 1000;
      if (spawnAcc > p.spawn) {
        spawnAcc = 0;
        const srcs = [C.ore];
        if (p.mines && (p.party || beatT > 1.2)) srcs.push(C.sentry);
        if (p.mines && (p.party || beatT > 2.4)) srcs.push(C.posthog);
        items.push({ x: W * X.start, s: 0, safe: Math.random() < 0.75, c: srcs[Math.floor(Math.random() * srcs.length)] });
      }
    }
    if (p.party) {
      peopleAcc += dt;
      if (peopleAcc > 0.09) {
        peopleAcc = 0;
        const left = Math.random() < 0.5;
        people.push({ x: left ? -6 : W + 6, y: H * (0.12 + Math.random() * 0.38), tx: W * (0.3 + Math.random() * 0.4), ty: H * 0.36 });
      }
      if (Math.random() < dt * 3) rockets.push({ x: W * (Math.random() < 0.5 ? 0.15 : 0.85), y: H * 0.16, v: 30 });
    }
    for (const q of people) {
      const dx = q.tx - q.x, dy = q.ty - q.y, d = Math.hypot(dx, dy);
      if (d < 6) { q.dead = true; customers++; } else { q.x += (dx / d) * 90 * dt; q.y += (dy / d) * 90 * dt; }
    }
    people = people.filter((q) => !q.dead);
    gateLift += ((open ? 1 : 0) - gateLift) * Math.min(1, dt * 6);
    const nc = Math.max(1, p.checks ?? 0);
    for (const it of items) {
      it.x += speed * dt * (it.fast ? 1.5 : 1);
      if (it.s === 0 && it.x > W * X.agent) { it.s = 1; burst(W * X.agent, by, C.amber, 5); }
      if (it.s === 1 && it.x > W * X.checks[nc - 1]) { it.s = 2; burst(W * X.checks[nc - 1], by, C.green, 4); }
      if (!open && !it.passed && !(p.auto && it.safe) && it.x > gx - 12) { it.dead = true; pile++; }
      if (it.x > W * X.pad) { it.dead = true; shipped++; rockets.push({ x: W * X.pad, y: by - 12, v: 40 }); }
    }
    items = items.filter((i) => !i.dead);
    if ((open && pile > 0) || (p.auto && pile > 4)) {
      drainAcc += dt;
      if (drainAcc > 0.12) { drainAcc = 0; pile--; items.push({ x: gx + 2, s: 2, fast: true, safe: true, passed: true, c: C.ore }); }
    }
    for (const r of rockets) {
      r.v += 420 * dt; r.y -= r.v * dt;
      if (!reduce && Math.random() < 0.7) sparks.push({ x: r.x + (Math.random() - 0.5) * 4, y: r.y + 14, vx: (Math.random() - 0.5) * 30, vy: 60 + Math.random() * 60, life: 0.6, c: Math.random() < 0.5 ? "#ffd36b" : "#ff6a2b" });
    }
    rockets = rockets.filter((r) => r.y > -60);
    for (const s of sparks) { s.x += s.vx * dt; s.y += s.vy * dt; s.life -= dt; }
    sparks = sparks.filter((s) => s.life > 0);
  }

  function burst(x: number, y: number, c: string, n: number) {
    if (reduce) return;
    for (let i = 0; i < n; i++) sparks.push({ x, y: y - 8, vx: (Math.random() - 0.5) * 90, vy: -Math.random() * 80, life: 0.4, c });
  }
  function rr(x: number, y: number, w: number, h: number, r: number, f: string) {
    cx.beginPath(); cx.roundRect(x, y, w, h, r); cx.fillStyle = f; cx.fill();
  }
  function label(t: string, x: number, y: number, c = C.ink, bg = "rgba(12,14,20,.8)") {
    cx.font = "600 11px 'Barlow Semi Condensed', system-ui, sans-serif";
    const w = cx.measureText(t).width + 10;
    rr(x - w / 2, y - 8, w, 16, 4, bg); cx.fillStyle = c; cx.textAlign = "center"; cx.fillText(t, x, y + 4);
  }
  function ring(x: number, y: number, T: number, c: string) {
    cx.strokeStyle = c; cx.lineWidth = 2.5; cx.beginPath(); cx.arc(x, y, 16 + (Math.sin(T * 6) + 1) * 4, 0, 7); cx.stroke();
  }

  function drawMarkers(by: number, T: number) {
    const M = [
      { x: X.start + 0.02, t: "Too little feedback coming in", s: "Suggested: connect Sentry" },
      { x: X.checks[0], t: "CI gate takes 14 min", s: "Suggested: split the slow tests" },
      { x: X.gate - 0.05, t: "5 PRs wait on review", s: "Suggested: let AI review /docs" },
    ];
    const m = M[Math.floor(beatT / 1.8) % M.length], x = W * m.x, lx = Math.min(Math.max(x, 95), W - 95);
    ring(x, by - 6, T, C.red);
    label(m.t, lx, by - 64, "#fff", C.red);
    label(m.s, lx, by - 45, C.dark, C.amber);
  }
  function mine(x: number, y: number, name: string, c: string, on: boolean, T: number, tag = "") {
    if (on) {
      cx.setLineDash([4, 5]); cx.lineDashOffset = -T * 30; cx.strokeStyle = c; cx.lineWidth = 2;
      cx.beginPath(); cx.moveTo(x, y); cx.lineTo(W * X.start, by0); cx.stroke(); cx.setLineDash([]);
      cx.fillStyle = c; cx.beginPath(); cx.arc(x, y, 13, 0, 7); cx.fill(); cx.lineWidth = 2; cx.strokeStyle = C.dark; cx.stroke();
    } else {
      cx.setLineDash([3, 3]); cx.strokeStyle = "rgba(255,255,255,.35)"; cx.lineWidth = 1.5; cx.beginPath(); cx.arc(x, y, 12, 0, 7); cx.stroke(); cx.setLineDash([]);
    }
    label(name, x, y + 25, on ? C.ink : "#9aa0ad");
    if (tag) label(tag, x, y - 24, C.dark, C.amber);
  }
  function drawMines(cy: number, by: number, T: number) {
    by0 = by;
    const t = p.party ? 99 : beatT, on = (n: number) => t > n * 1.2;
    mine(W * 0.05, by - 30, "GitHub", "#9aa7bd", true, T, !p.party && t < 1.2 ? "+ issues" : "");
    mine(W * 0.2, cy - H * 0.16, "Sentry", C.sentry, on(1), T, !p.party && on(1) && t < 2.4 ? "+ errors" : "");
    mine(W * 0.8, cy - H * 0.16, "PostHog", C.posthog, on(2), T, !p.party && on(2) && t < 3.6 ? "+ user signals" : "");
    if (t > 3.6 && !p.party) {
      mine(W * 0.5, cy - H * 0.2, "Support", "", false, T);
      mine(W * 0.1, cy + H * 0.15, "Payments", "", false, T);
      mine(W * 0.9, cy + H * 0.15, "Marketing", "", false, T);
    }
    // new districts sprout as sources connect
    for (let i = 0; i < Math.min(3, Math.floor(t / 1.2)); i++) {
      const bx = W * (0.3 + i * 0.2), byy = cy + H * 0.07;
      rr(bx - 10, byy - 8, 20, 14, 3, C.bldg); rr(bx - 7, byy - 12, 14, 5, 2, ["#6b3aa8", "#c27a12", "#2d6db0"][i]);
    }
  }
  function sat(x: number, y: number, name: string) {
    cx.beginPath(); cx.ellipse(x, y, W * 0.12, H * 0.035, 0, 0, 7); cx.fillStyle = C.moss; cx.fill(); cx.strokeStyle = C.rim; cx.lineWidth = 2; cx.stroke();
    cx.beginPath(); cx.moveTo(x - W * 0.1, y + 4); cx.lineTo(x + W * 0.1, y + 4); cx.lineTo(x, y + H * 0.06); cx.closePath(); cx.fillStyle = "#4a3e36"; cx.fill();
    for (let i = -1; i <= 1; i++) rr(x + i * 16 - 6, y - 10, 12, 9, 2, C.bldg);
    label(name, x, y + 26);
  }

  function draw(T: number) {
    cx.clearRect(0, 0, W, H);
    const e = 1 - Math.pow(1 - Math.min(1, beatT / 1.4), 3);
    const rising = p.rise && !p.ambient;
    const lift = rising ? (1 - e) * 120 : 0, alpha = rising ? e : 1;
    const bob = Math.sin(T * 1.2) * 3, cy = H * 0.36 + lift + bob, by = H * 0.41 + lift + bob;
    cx.save(); cx.globalAlpha = alpha;
    // rock underside + waterfalls
    cx.beginPath(); cx.moveTo(W * 0.14, cy + 10); cx.lineTo(W * 0.86, cy + 10); cx.lineTo(W * 0.62, cy + H * 0.17); cx.lineTo(W * 0.5, cy + H * 0.13); cx.lineTo(W * 0.38, cy + H * 0.19); cx.closePath();
    const rg = cx.createLinearGradient(0, cy, 0, cy + H * 0.19); rg.addColorStop(0, C.rock); rg.addColorStop(1, "rgba(40,33,28,0)"); cx.fillStyle = rg; cx.fill();
    for (const fx of [0.3, 0.66]) {
      const g = cx.createLinearGradient(0, cy + 20, 0, cy + 110); g.addColorStop(0, "rgba(159,214,255,.55)"); g.addColorStop(1, "rgba(159,214,255,0)");
      cx.fillStyle = g; cx.fillRect(W * fx, cy + 20 + ((T * 40) % 6), 5, 90);
    }
    // moss cap
    cx.beginPath(); cx.ellipse(W / 2, cy, W * 0.46, H * 0.13, 0, 0, Math.PI * 2);
    const mg = cx.createRadialGradient(W * 0.35, cy - 30, 10, W / 2, cy, W * 0.5); mg.addColorStop(0, C.mossHi); mg.addColorStop(0.5, C.moss); mg.addColorStop(1, C.mossLo);
    cx.fillStyle = mg; cx.fill(); cx.lineWidth = 3; cx.strokeStyle = C.rim; cx.stroke();
    // buildings pop up one by one: each is a folder
    NAMES.forEach((n, i) => {
      const k = p.ambient || !p.rise ? 1 : Math.max(0, Math.min(1, (beatT - 0.8 - i * 0.18) / 0.35));
      if (!k) return;
      const bx = W * (0.2 + i * 0.15), byy = cy - H * 0.08 + (i % 2) * 6, sc = k < 1 ? k * 1.15 : 1;
      cx.save(); cx.translate(bx, byy); cx.scale(sc, sc);
      rr(-14, -10, 28, 20, 4, C.bldg); rr(-14, 4, 28, 6, 3, "#8e8576"); rr(-10, -16, 20, 7, 3, C.roof);
      cx.restore();
      if (p.rise && !p.ambient && k === 1) label(n, bx, byy + 21);
    });
    if (p.belt) {
      const x0 = W * X.start, x1 = W * X.pad;
      rr(x0, by - 6, x1 - x0, 12, 3, "#3c3c3c");
      cx.fillStyle = "#565656"; for (let x = x0 + ((T * 60) % 16); x < x1; x += 16) cx.fillRect(x, by - 6, 8, 12);
      // the AI agent's arm
      const ax = W * X.agent; rr(ax - 15, by - 30, 30, 22, 4, C.steel);
      cx.strokeStyle = C.amber; cx.lineWidth = 3; cx.lineCap = "round"; cx.beginPath(); cx.moveTo(ax, by - 30);
      const ang = Math.sin(T * 9) * 0.6 - 1.2; cx.lineTo(ax + Math.cos(ang) * 14, by - 30 + Math.sin(ang) * 14); cx.stroke();
      if (p.spawn === 420 || p.ambient) label("AI agent", ax, by - 41, C.amber);
      // checks
      const names = ["CI", "Verify", "Review"];
      for (let i = 0; i < (p.checks ?? 0); i++) {
        const qx = W * X.checks[i]; rr(qx - 9, by - 28, 18, 20, 3, C.steel);
        cx.fillStyle = C.green; cx.beginPath(); cx.arc(qx, by - 22, 3, 0, 7); cx.fill();
        if (p.checks === 3 && !p.markers && !p.mines && !p.auto) label(names[i], qx, by - 39 - (i % 2) * 16, C.green);
      }
      // your gate (with automation it runs itself and you step aside)
      const gx = W * X.gate, au = p.auto ? Math.min(1, autoT / 0.8) : 0;
      cx.save(); cx.translate(gx, by - 4); cx.rotate(-Math.max(gateLift, au * 0.9) * 1.3);
      rr(-2, -3, 30, 6, 3, p.gate === "none" ? "rgba(0,0,0,0)" : gateLift > 0.5 || au > 0.5 ? C.green : C.red); cx.restore();
      if (p.gate !== "none") {
        const hx = gx + 14 + au * 22, hy = by - 34 + au * 46;
        cx.fillStyle = C.ink; cx.beginPath(); cx.arc(hx, hy, 6, 0, 7); cx.fill(); rr(hx - 7, hy + 7, 14, 14, 5, C.ink);
        label("you", hx, hy - 15, p.spot ? "#fff" : C.ink, p.spot ? C.red : "rgba(12,14,20,.8)");
        if (au > 0.3) {
          cx.globalAlpha = alpha * au;
          rr(gx - 2, by - 40, 22, 16, 4, C.green); cx.strokeStyle = C.dark; cx.lineWidth = 2; cx.beginPath(); cx.arc(gx + 9, by - 32, 4, 0, 7); cx.stroke();
          label("auto", gx + 9, by - 53, C.dark, C.green);
          cx.globalAlpha = alpha;
        }
      }
      rr(W * X.pad - 14, by - 4, 28, 10, 3, C.steel);
      for (const it of items) rr(it.x - 6, by - 14, 12, 10, 2, it.s === 0 ? it.c : it.s === 1 ? C.blue : C.green);
      for (let i = 0; i < Math.min(pile, 28); i++) {
        const col = i % 7, row = Math.floor(i / 7);
        rr(gx - 18 - col * 12, by + 12 + row * 10, 11, 9, 2, (row + col) % 2 ? "#b7884c" : "#a67a40");
      }
      if (pile > 0 && p.gate !== "open")
        label(p.auto ? `${pile} risky ones wait on you` : `${pile} waiting on you`, gx - 54, by + 24 + Math.min(4, Math.ceil(pile / 7)) * 10, "#fff", p.auto ? "#a35f3a" : C.red);
    }
    if (p.belt && p.markers) drawMarkers(by, T);
    if (p.mines) drawMines(cy, by, T);
    if (p.party) { sat(W * 0.15, H * 0.2 + Math.sin(T) * 3, "growth"); sat(W * 0.85, H * 0.21 + Math.sin(T + 1) * 3, "support"); }
    cx.restore();
    for (const s of sparks) { cx.globalAlpha = Math.max(0, s.life / 0.6); cx.fillStyle = s.c; cx.fillRect(s.x, s.y, 3, 3); }
    cx.globalAlpha = 1;
    for (const r of rockets) {
      cx.save(); cx.translate(r.x, r.y); cx.fillStyle = C.ink;
      cx.beginPath(); cx.moveTo(0, -14); cx.quadraticCurveTo(7, -4, 5, 12); cx.lineTo(-5, 12); cx.quadraticCurveTo(-7, -4, 0, -14); cx.fill();
      cx.fillStyle = C.amber; cx.fillRect(-8, 6, 4, 7); cx.fillRect(4, 6, 4, 7); cx.restore();
    }
    if (p.spot) {
      const k = Math.min(1, beatT / 0.8), gx = W * X.gate - 30;
      const g = cx.createRadialGradient(gx, by + 10, 30, gx, by + 10, W * 0.55);
      g.addColorStop(0, "rgba(10,14,30,0)"); g.addColorStop(1, `rgba(10,14,30,${0.8 * k})`); cx.fillStyle = g; cx.fillRect(0, 0, W, H);
    }
    if (p.score) {
      const cols: [string, string, string][] = [
        ["SHIPPED", shipped.toLocaleString(), C.green],
        ["AUTOMATED", `${Math.min(91, Math.round(48 + beatT * 6))}%`, C.blue],
        ["NEW CUSTOMERS", customers.toLocaleString(), C.posthog],
      ];
      cols.forEach(([n, v, c], i) => {
        const x = W * (0.2 + i * 0.3);
        cx.textAlign = "center"; cx.fillStyle = c; cx.font = "700 24px 'Barlow Semi Condensed', system-ui, sans-serif"; cx.fillText(v, x, H * 0.085);
        cx.font = "600 10px 'Barlow Semi Condensed', system-ui, sans-serif"; cx.fillStyle = "#9aa0ad"; cx.fillText(n, x, H * 0.105);
      });
    }
    for (const q of people) { cx.fillStyle = C.posthog; cx.beginPath(); cx.arc(q.x, q.y - 4, 2.5, 0, 7); cx.fill(); rr(q.x - 2.5, q.y - 1, 5, 6, 2, C.posthog); }
  }

  const loop = (now: number) => {
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now; beatT += dt; autoT += dt;
    step(dt); draw(now / 1000);
    raf = requestAnimationFrame(loop);
  };
  raf = requestAnimationFrame(loop);

  return {
    set,
    stop: () => { cancelAnimationFrame(raf); removeEventListener("resize", size); },
  };
}
