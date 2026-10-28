// Shiptorio 2D deck (thread "Plan the 2D pixel-art facelift", plan https://claude.ai/artifact/APbJAp64ymtzegrTv2wUfQ).
// One floating iron deck, one line left to right: REPO -> BUILDER -> CHECKS -> REVIEW -> GATE -> bridge -> rocket.
// Crates are changes, rockets are releases, Shippy is the only character. Everything is drawn on one canvas from
// Justin's sprites in /deck/art. This slice plays the locked story on its own:
//   1 software is a factory: the line builds itself, piece by piece, and the first rockets go up
//   2 there's always a bottleneck: review shows up and crates pile up waiting on your call
//   3 swipe, and it moves: approve on the card, the lever drops, the crate ships
//   4 approve twice more and it's automatic: Shippy unfolds, takes the lever, and the line runs without you
(() => {
  "use strict";
  const ART = "/deck/art/";
  const STATES = ["idle", "working", "jammed", "auto"];
  const names = ["sky", "clouds", "deck", "pad", "rocket", "flame", "belt", "beacon", "plate", "boiler-on",
    "lever-up", "lever-down", "lever-glow", "shippy-lever", "shippy-happy", "shippy-alarm", "shippy-peek"];
  for (const s of ["repo", "builder", "checks", "review", "gate"]) for (const st of STATES) names.push(s + "-" + st);
  for (const c of ["plain", "ok", "wait"]) names.push("crate-" + c);
  for (let i = 0; i < 6; i++) names.push("shippy-" + i);
  const img = {};
  const ok = (im) => im && im.complete && im.naturalWidth > 0;

  // ---------- world layout, in deck-sprite pixels (deck.webp is 2039 x 657) ----------
  const BELT_Y = 236; // centre line of the belt across the deck floor
  const PAD = { x: 1905, y: -50, s: 0.72 }; // bridge + rocket island, placed so its bridge meets the deck edge
  const PAD_SPOT = { x: PAD.x + 929, y: PAD.y + 300 }; // middle of the launch circle
  const BRIDGE_Y = PAD.y + PAD.s * 560;
  const ORB = { x: 1043, y: 578 };
  // h = drawn height; base = where the sprite's feet sit (a little below the belt, so the belt runs through it).
  // show = how many rockets must have gone up before this piece builds itself in (story beat 1 and 2).
  const STATIONS = [
    { id: "repo", x: 235, h: 178, base: BELT_Y + 44, svc: 0, show: 0 },
    { id: "builder", x: 560, h: 158, base: BELT_Y + 40, svc: 0.9, show: 1 },
    { id: "checks", x: 870, h: 158, base: BELT_Y + 40, svc: 0.7, show: 2 },
    { id: "review", x: 1190, h: 128, base: BELT_Y + 42, svc: 0.5, show: 3, call: true },
    { id: "gate", x: 1520, h: 150, base: BELT_Y + 42, svc: 0.35, show: 3 },
  ];
  for (const s of STATIONS) Object.assign(s, { state: "idle", busy: null, hot: 0, built: s.show === 0, drop: s.show === 0 ? 1 : 0 });
  const byId = Object.fromEntries(STATIONS.map((s) => [s.id, s]));
  const rv = byId.review;
  const LEVER = { x: rv.x + 118, base: BELT_Y + 88, h: 74 };
  const SHIPPY_SPOT = { x: rv.x + 205, base: BELT_Y + 96 };

  const PATH = [[STATIONS[0].x + 60, BELT_Y], [1915, BELT_Y], [1995, BRIDGE_Y], [PAD_SPOT.x - 130, BRIDGE_Y], [PAD_SPOT.x - 34, PAD_SPOT.y]];
  const segs = []; let PATH_LEN = 0;
  for (let i = 1; i < PATH.length; i++) {
    const [ax, ay] = PATH[i - 1], [bx, by] = PATH[i], len = Math.hypot(bx - ax, by - ay);
    segs.push({ ax, ay, bx, by, len, at: PATH_LEN, a: Math.atan2(by - ay, bx - ax) }); PATH_LEN += len;
  }
  const at = (d) => {
    for (const g of segs) if (d <= g.at + g.len) { const t = (d - g.at) / g.len; return [g.ax + (g.bx - g.ax) * t, g.ay + (g.by - g.ay) * t]; }
    const g = segs[segs.length - 1]; return [g.bx, g.by];
  };
  const distOfX = (x) => x - PATH[0][0]; // stations all sit on the first, flat stretch
  const BOUNDS = { x0: -20, x1: PAD.x + 1533 * PAD.s + 20, y0: -30, y1: 670 };

  // ---------- state ----------
  const SPEED = 160, GAP = 50, CRATE = 40;
  const S = {
    t: 0, spawnT: 0.6, crates: [], shipped: 0, approvals: 0, auto: false, laterUntil: 0,
    rocket: { y: 0, v: 0, mode: "ready", loaded: 0, t: 0 },
    puffs: [], lever: 0, // lever: seconds left showing "pulled down"
    shippy: { mode: "home", t: 0, pose: "", poseT: 0 }, // home = folded in the corner; out = on the deck by the lever
    corner: { pose: "", t: 0 },
  };
  let nextId = 1;

  function step(dt) {
    S.t += dt;
    build(dt);
    S.spawnT -= dt;
    if (S.spawnT <= 0) {
      if (!S.crates.some((c) => c.d < GAP + 6)) S.crates.push({ id: nextId++, d: 0, done: {}, look: "plain", svcT: 0, approved: false });
      // beat 1 ships one crate at a time so each new piece gets its moment; after that the line fills up
      S.spawnT = S.shipped < 3 && !rv.built ? 3.2 : 2 + Math.random() * 0.8;
    }
    moveCrates(dt);
    looks(dt);
    rocketStep(dt);
    shippyStep(dt);
    S.lever = Math.max(0, S.lever - dt);
    for (const p of S.puffs) { p.t += dt; p.x += p.vx * dt; p.y += p.vy * dt; }
    S.puffs = S.puffs.filter((p) => p.t < p.life);
    uiStep();
  }

  // Beat 1: each rocket that goes up builds the next piece of the line.
  function build(dt) {
    for (const s of STATIONS) {
      if (!s.built && S.shipped >= s.show && S.rocket.mode === "ready") {
        s.built = true; s.drop = 0;
        if (s.id === "builder") say("Ideas become code.");
        if (s.id === "checks") say("Code gets checked.");
        if (s.id === "review") say("There's always a bottleneck.");
      }
      if (s.built && s.drop < 1) {
        s.drop = Math.min(1, s.drop + dt * 2.2);
        if (s.drop === 1) for (let i = 0; i < 10; i++) S.puffs.push({ x: s.x + (Math.random() - 0.5) * 120, y: s.base - 6, vx: (Math.random() - 0.5) * 90, vy: -10 - Math.random() * 30, t: 0, life: 0.9, r: 12 + Math.random() * 10 });
      }
    }
  }

  function moveCrates(dt) {
    const order = S.crates.slice().sort((a, b) => b.d - a.d); // front of the line first
    let ahead = null;
    for (const c of order) {
      let limit = ahead ? ahead.d - GAP : Infinity;
      const s = STATIONS.find((x) => x.built && x.svc && !c.done[x.id] && distOfX(x.x) >= c.d - 0.5);
      if (s) {
        const sd = distOfX(s.x);
        if (c.d < sd - 0.5) limit = Math.min(limit, s.busy && s.busy !== c ? sd - GAP : sd);
        else {
          c.d = sd; limit = sd; s.busy = c;
          if (s.call && !S.auto && !c.approved) c.look = "wait"; // waiting on your call
          else {
            c.svcT += dt;
            if (c.svcT >= s.svc) {
              c.done[s.id] = true; c.svcT = 0; s.busy = null; s.hot = 0.35;
              if (s.id === "checks") c.look = "ok";
              if (s.call && S.auto) { S.lever = 0.45; S.shippy.pose = "lever"; S.shippy.poseT = 0.5; }
            }
          }
        }
      }
      if (c.d < limit) c.d = Math.min(limit, c.d + SPEED * dt);
      if (c.d >= PATH_LEN - 1) { c.gone = true; S.rocket.loaded++; }
      ahead = c;
    }
    S.crates = S.crates.filter((c) => !c.gone);
  }

  function looks(dt) {
    for (const s of STATIONS) {
      const waiting = s.busy && s.busy.look === "wait";
      if (!s.built) s.state = "idle";
      else if (s.id === "repo") s.state = S.crates.some((c) => c.d < 60) ? "working" : "idle";
      else if (waiting) s.state = "jammed";
      else if (S.auto && (s.call || s.id === "gate")) s.state = "auto";
      else if (s.busy || s.hot > 0) s.state = "working";
      else s.state = "idle";
      s.hot = Math.max(0, s.hot - dt);
    }
  }

  function rocketStep(dt) {
    const r = S.rocket;
    r.t += dt;
    if (r.mode === "ready" && r.loaded > 0) { r.mode = "count"; r.t = 0; }
    else if (r.mode === "count" && r.t > 0.6) { r.mode = "up"; r.t = 0; r.v = 0; S.shipped += r.loaded; r.loaded = 0; if (S.shipped === 1) say("And then it ships."); }
    else if (r.mode === "up") {
      r.v += 820 * dt; r.y -= r.v * dt;
      if (r.y > -400) for (let i = 0; i < 2; i++) S.puffs.push({ x: PAD_SPOT.x + (Math.random() - 0.5) * 60, y: PAD_SPOT.y - 4, vx: (Math.random() - 0.5) * 140, vy: -10 - Math.random() * 20, t: 0, life: 1.3, r: 14 + Math.random() * 14 });
      if (r.y < -1500) { r.mode = "away"; r.t = 0; }
    } else if (r.mode === "away" && r.t > 0.7) { r.mode = "down"; r.y = -600; r.t = 0; }
    else if (r.mode === "down") { r.y += (0 - r.y) * Math.min(1, dt * 5); if (Math.abs(r.y) < 1) { r.y = 0; r.mode = "ready"; } }
  }

  // Shippy: folded in the top-left corner until review is automatic, then he unfolds onto the deck and works the lever.
  function shippyStep(dt) {
    const sh = S.shippy;
    sh.t += dt; sh.poseT = Math.max(0, sh.poseT - dt);
    if (sh.mode === "unfold" && sh.t > 1.3) { sh.mode = "out"; sh.t = 0; }
    S.corner.t = Math.max(0, S.corner.t - dt);
  }

  // ---------- the one card ----------
  const $ = (id) => document.getElementById(id);
  const card = $("card"), dots = $("dots").children, sub = $("card-sub"), toast = $("toast");
  const TITLES = ["Approve fix for checkout bug?", "Approve fix for login typo?", "Approve fix for broken link?"];
  let cardOpen = false;
  function uiStep() {
    const want = rv.state === "jammed" && S.t > S.laterUntil;
    if (want && !cardOpen) openCard();
    if (!want && cardOpen) closeCard();
  }
  function openCard() {
    cardOpen = true; card.hidden = false; card.classList.remove("gone");
    $("card-title").textContent = TITLES[S.approvals % TITLES.length];
    for (let i = 0; i < 3; i++) dots[i].classList.toggle("on", i < S.approvals);
    const left = 3 - S.approvals;
    sub.textContent = left === 3 ? "It's waiting on your call." : "Approve " + (left === 1 ? "1 more" : left + " more") + " like this and it's automatic.";
    toast.classList.remove("on");
  }
  function closeCard() {
    cardOpen = false; card.classList.add("gone");
    setTimeout(() => { if (!cardOpen) card.hidden = true; }, 300);
  }
  function approve() {
    const c = rv.busy;
    if (!c || c.look !== "wait") return;
    S.approvals++;
    for (let i = 0; i < 3; i++) dots[i].classList.toggle("on", i < S.approvals);
    c.approved = true; c.look = "ok"; S.lever = 0.5;
    S.corner.pose = "happy"; S.corner.t = 0.9;
    if (S.approvals === 1) say("Swipe, and it moves.");
    if (S.approvals === 2) say("Approve 1 more like this and it's automatic.");
    if (S.approvals >= 3) {
      S.auto = true; S.shippy.mode = "unfold"; S.shippy.t = 0;
      for (const x of S.crates) if (x.look === "wait") x.approved = true;
      setTimeout(() => say("Shippy's got it. You're free for the next jam."), 900);
    }
    closeCard();
  }
  function later() { S.laterUntil = S.t + 6; S.corner.pose = "alarm"; S.corner.t = 1; closeCard(); say("Okay. It'll wait."); }
  function say(text) { toast.textContent = text; toast.classList.add("on"); clearTimeout(say.t); say.t = setTimeout(() => toast.classList.remove("on"), 2800); }
  $("approve").addEventListener("click", approve);
  $("later").addEventListener("click", later);
  let sx = null; // swipe the card: right approves, left is later
  card.addEventListener("pointerdown", (e) => { if (e.target.closest("button")) return; sx = e.clientX; card.setPointerCapture(e.pointerId); });
  card.addEventListener("pointermove", (e) => { if (sx !== null) card.style.transform = `translate(calc(-50% + ${e.clientX - sx}px), 0) rotate(${(e.clientX - sx) / 40}deg)`; });
  card.addEventListener("pointerup", (e) => {
    if (sx === null) return; const dx = e.clientX - sx; sx = null; card.style.transform = "";
    if (dx > 80) approve(); else if (dx < -80) later();
  });
  addEventListener("keydown", (e) => { if (cardOpen && e.key === "ArrowRight") approve(); if (cardOpen && e.key === "ArrowLeft") later(); });

  // ---------- camera ----------
  const cv = $("world"), cx = cv.getContext("2d");
  let W = 0, H = 0, DPR = 1;
  const cam = { x: 1400, y: 300, s: 0.3, manual: 0, mode: "auto" };
  function resize() { DPR = Math.min(2, devicePixelRatio || 1); W = innerWidth; H = innerHeight; cv.width = Math.round(W * DPR); cv.height = Math.round(H * DPR); }
  addEventListener("resize", resize); resize();
  const fitAll = () => {
    const bw = BOUNDS.x1 - BOUNDS.x0, bh = BOUNDS.y1 - BOUNDS.y0;
    return { x: (BOUNDS.x0 + BOUNDS.x1) / 2, y: (BOUNDS.y0 + BOUNDS.y1) / 2 + 30, s: Math.min(W / bw, (H * 0.9) / bh) };
  };
  // A tall phone would show the whole line tiny, so the camera parks on whatever is busy (plan pick: left to right,
  // park on the bottleneck, one tap to see it all).
  function focusX() {
    if (rv.state === "jammed") return rv.x + 60;
    if (S.shippy.mode === "unfold") return SHIPPY_SPOT.x;
    if (S.rocket.mode !== "ready" && S.rocket.mode !== "down") return PAD_SPOT.x - 200;
    const fresh = STATIONS.find((s) => s.built && s.drop < 1);
    if (fresh) return fresh.x;
    const lead = S.crates.reduce((m, c) => Math.max(m, c.d), 0);
    return PATH[0][0] + lead;
  }
  function target() {
    const all = fitAll();
    if (cam.mode === "all" || W / H > 1.2) return all;
    const s = Math.max(all.s, W / 1050), half = W / 2 / s;
    const fx = Math.max(BOUNDS.x0 + half, Math.min(BOUNDS.x1 - half, focusX()));
    return { x: fx, y: 250, s };
  }
  function camStep(dt) {
    if (performance.now() < cam.manual) return;
    const t = target(), k = Math.min(1, dt * 1.8);
    cam.x += (t.x - cam.x) * k; cam.y += (t.y - cam.y) * k; cam.s += (t.s - cam.s) * k;
  }
  const zoomBtn = $("zoom");
  const portrait = () => W / H <= 1.2;
  function zoomLabel() { zoomBtn.hidden = !portrait(); zoomBtn.textContent = cam.mode === "all" ? "Zoom in" : "See all"; }
  zoomBtn.addEventListener("click", () => { cam.manual = 0; cam.mode = cam.mode === "all" ? "auto" : "all"; zoomLabel(); });
  addEventListener("resize", zoomLabel); zoomLabel();
  const ptrs = new Map(); let pinch = null, moved = 0;
  cv.addEventListener("pointerdown", (e) => { cv.setPointerCapture(e.pointerId); ptrs.set(e.pointerId, [e.clientX, e.clientY]); moved = 0; cv.classList.add("drag"); });
  cv.addEventListener("pointermove", (e) => {
    if (!ptrs.has(e.pointerId)) return;
    const [px, py] = ptrs.get(e.pointerId); ptrs.set(e.pointerId, [e.clientX, e.clientY]);
    moved += Math.abs(e.clientX - px) + Math.abs(e.clientY - py);
    if (moved < 6) return;
    cam.manual = performance.now() + 6000;
    if (ptrs.size === 1) { cam.x -= (e.clientX - px) / cam.s; cam.y -= (e.clientY - py) / cam.s; }
    else if (ptrs.size === 2) {
      const [a, b] = [...ptrs.values()], d = Math.hypot(a[0] - b[0], a[1] - b[1]);
      if (pinch) zoomAt((a[0] + b[0]) / 2, (a[1] + b[1]) / 2, d / pinch);
      pinch = d;
    }
  });
  const up = (e) => {
    ptrs.delete(e.pointerId); pinch = null; if (!ptrs.size) cv.classList.remove("drag");
    if (moved < 6 && e.clientX < 110 && e.clientY < 110) { cam.manual = 0; cam.mode = "auto"; zoomLabel(); } // tap Shippy: fly to what he's looking at
  };
  cv.addEventListener("pointerup", up); cv.addEventListener("pointercancel", up);
  cv.addEventListener("wheel", (e) => { e.preventDefault(); cam.manual = performance.now() + 6000; zoomAt(e.clientX, e.clientY, Math.exp(-e.deltaY * 0.0015)); }, { passive: false });
  function zoomAt(px, py, f) {
    const wx = cam.x + (px - W / 2) / cam.s, wy = cam.y + (py - H / 2) / cam.s;
    cam.s = Math.max(fitAll().s * 0.8, Math.min(1.6, cam.s * f));
    cam.x = wx - (px - W / 2) / cam.s; cam.y = wy - (py - H / 2) / cam.s;
  }

  // ---------- drawing ----------
  function put(im, x, base, h, flip) { // draw a sprite by its feet, scaled to height h
    if (!ok(im)) return 0;
    const w = im.naturalWidth * h / im.naturalHeight;
    if (flip) { cx.save(); cx.translate(x, 0); cx.scale(-1, 1); cx.drawImage(im, -w / 2, base - h, w, h); cx.restore(); }
    else cx.drawImage(im, x - w / 2, base - h, w, h);
    return w;
  }
  function drawSky() {
    const sk = img.sky; if (!ok(sk)) return;
    const s = Math.max(W / sk.naturalWidth, H / sk.naturalHeight) * 1.1, w = sk.naturalWidth * s, h = sk.naturalHeight * s;
    const ox = Math.max(-(w - W) / 2, Math.min((w - W) / 2, -(cam.x - 1400) * 0.04 * cam.s));
    cx.drawImage(sk, (W - w) / 2 + ox, (H - h) / 2, w, h);
  }
  function drawClouds(y, scale, speed, alpha) {
    const c = img.clouds; if (!ok(c)) return;
    const w = c.naturalWidth * scale, h = c.naturalHeight * scale, off = ((S.t * speed) % (2 * w) + 2 * w) % (2 * w);
    cx.globalAlpha = alpha;
    let i = 0;
    for (let x = BOUNDS.x0 - 2 * w - off; x < BOUNDS.x1 + w * 2; x += w - 1, i++) {
      if (i % 2) { cx.save(); cx.translate(x + w, y); cx.scale(-1, 1); cx.drawImage(c, 0, 0, w, h); cx.restore(); } // mirror every other tile so the seams meet
      else cx.drawImage(c, x, y, w, h);
    }
    cx.globalAlpha = 1;
  }
  function drawBelt() {
    const b = img.belt; if (!ok(b)) return;
    const bh = 34, bw = b.naturalWidth * bh / b.naturalHeight, step = bw / 5; // the strip holds 5 chevron panels
    const off = (S.t * SPEED * 0.35) % step;
    for (const g of segs) {
      cx.save(); cx.translate(g.ax, g.ay); cx.rotate(g.a);
      cx.beginPath(); cx.rect(0, -bh / 2, g.len, bh); cx.clip();
      for (let x = -step + off - bw; x < g.len; x += bw - 1) cx.drawImage(b, x, -bh / 2, bw, bh);
      cx.restore();
    }
  }
  function drawCrate(c) {
    const [x, y] = at(c.d), im = img["crate-" + (c.look === "wait" ? "wait" : c.look)];
    if (c.look === "wait") {
      const a = 0.25 + 0.2 * Math.sin(S.t * 6);
      const g = cx.createRadialGradient(x, y - 18, 4, x, y - 18, 44); g.addColorStop(0, `rgba(255,70,50,${a})`); g.addColorStop(1, "rgba(255,70,50,0)");
      cx.fillStyle = g; cx.fillRect(x - 44, y - 62, 88, 88);
    }
    put(im, x, y + 12, CRATE);
  }
  function drawStation(s) {
    if (!s.built) return;
    const im = img[s.id + "-" + s.state];
    const e = 1 - s.drop, fall = -420 * e * e; // drops in from the sky
    const bob = s.state === "working" && Math.sin(S.t * 20) > 0.5 ? -1.5 : 0;
    cx.globalAlpha = Math.min(1, s.drop * 3);
    put(im, s.x, s.base + fall + bob, s.h);
    cx.globalAlpha = 1;
  }
  function drawJam() {
    if (rv.state !== "jammed") return;
    const blink = Math.sin(S.t * 8) > -0.2;
    if (blink) put(img.beacon, rv.x, rv.base - rv.h + 18, 52);
    const g = cx.createRadialGradient(rv.x, rv.base - rv.h, 4, rv.x, rv.base - rv.h, 120);
    g.addColorStop(0, `rgba(255,60,40,${blink ? 0.35 : 0.12})`); g.addColorStop(1, "rgba(255,60,40,0)");
    cx.fillStyle = g; cx.fillRect(rv.x - 120, rv.base - rv.h - 120, 240, 240);
    const pw = put(img.plate, rv.x - 6, BELT_Y + 104, 50);
    if (pw) {
      cx.fillStyle = "#2b1a0a"; cx.textAlign = "center"; cx.textBaseline = "middle"; cx.font = "15px Silkscreen, monospace";
      cx.fillText("REVIEW", rv.x - 6, BELT_Y + 70); cx.fillText("WAITING", rv.x - 6, BELT_Y + 87);
    }
  }
  function drawLever() {
    if (!rv.built) return;
    const e = 1 - rv.drop, fall = -420 * e * e;
    const glow = rv.state === "jammed" && !S.auto;
    put(img[S.lever > 0 ? "lever-down" : glow ? "lever-glow" : "lever-up"], LEVER.x, LEVER.base + fall, LEVER.h);
  }
  function drawShippyDeck() {
    const sh = S.shippy;
    if (sh.mode === "home") return;
    let im;
    if (sh.mode === "unfold") im = img["shippy-" + Math.min(5, Math.floor(sh.t / 0.2))];
    else if (sh.poseT > 0) im = img["shippy-lever"];
    else im = img["shippy-" + (Math.sin(S.t * 3) > 0 ? 3 : 4)];
    // he hops down from the corner and lands by the lever
    const hop = sh.mode === "unfold" && sh.t < 0.3 ? -260 * (1 - sh.t / 0.3) : 0;
    put(im, SHIPPY_SPOT.x, SHIPPY_SPOT.base + hop, sh.poseT > 0 ? 78 : 80, true);
  }
  function drawRocket() {
    const r = S.rocket, rk = img.rocket, fl = img.flame;
    if (!ok(rk) || r.mode === "away") return;
    const h = 220, w = rk.naturalWidth * h / rk.naturalHeight, y = PAD_SPOT.y - h + 20 + r.y;
    if ((r.mode === "up" || r.mode === "count") && ok(fl)) {
      const fh = (r.mode === "count" ? 56 : 150) * (0.85 + Math.random() * 0.3), fw = fl.naturalWidth * 150 / fl.naturalHeight;
      cx.drawImage(fl, PAD_SPOT.x - fw / 2, y + h - 24, fw, fh);
    }
    cx.drawImage(rk, PAD_SPOT.x - w / 2 + (r.mode === "count" ? (Math.random() - 0.5) * 3 : 0), y, w, h);
  }
  function drawPuffs() {
    for (const p of S.puffs) {
      const k = p.t / p.life, r = p.r * (1 + k * 1.5);
      cx.fillStyle = `rgba(225,210,195,${0.6 * (1 - k)})`;
      cx.fillRect(Math.round(p.x - r / 2), Math.round(p.y - r / 2), Math.round(r), Math.round(r));
    }
  }
  function drawOrb() {
    const a = 0.3 + 0.2 * Math.sin(S.t * 2), g = cx.createRadialGradient(ORB.x, ORB.y, 4, ORB.x, ORB.y, 100);
    g.addColorStop(0, `rgba(120,240,255,${a})`); g.addColorStop(1, "rgba(120,240,255,0)");
    cx.globalCompositeOperation = "lighter"; cx.fillStyle = g; cx.fillRect(ORB.x - 100, ORB.y - 100, 200, 200); cx.globalCompositeOperation = "source-over";
  }
  // Shippy's corner: folded box that pulses, peeks when the card is up, hops when you approve, shakes on Later.
  function drawCorner() {
    if (S.shippy.mode !== "home") return;
    const safeL = 14, safeT = 14, h = 58, x = safeL + 44, base = safeT + h + 6;
    let im, dx = 0, dy = 0;
    if (S.corner.t > 0 && S.corner.pose === "happy") { im = img["shippy-happy"]; dy = -Math.abs(Math.sin(S.corner.t * 9)) * 10; }
    else if (S.corner.t > 0 && S.corner.pose === "alarm") { im = img["shippy-alarm"]; dx = Math.sin(S.t * 60) * 2; }
    else if (cardOpen || rv.state === "jammed") im = img["shippy-peek"];
    else im = img["shippy-" + (Math.sin(S.t * 1.6) > 0.3 ? 1 : 0)]; // eye light breathing
    const g = cx.createRadialGradient(x, base - h / 2, 2, x, base - h / 2, 56);
    g.addColorStop(0, `rgba(95,215,255,${0.18 + 0.1 * Math.sin(S.t * 1.6)})`); g.addColorStop(1, "rgba(95,215,255,0)");
    cx.fillStyle = g; cx.fillRect(x - 56, base - h / 2 - 56, 112, 112);
    put(im, x + dx, base + dy, im === img["shippy-happy"] || im === img["shippy-alarm"] ? h * 1.25 : h);
  }

  function draw() {
    cx.setTransform(DPR, 0, 0, DPR, 0, 0);
    cx.imageSmoothingEnabled = true; cx.imageSmoothingQuality = "high";
    cx.fillStyle = "#2a1410"; cx.fillRect(0, 0, W, H);
    drawSky();
    cx.setTransform(DPR * cam.s, 0, 0, DPR * cam.s, DPR * (W / 2 - cam.x * cam.s), DPR * (H / 2 - cam.y * cam.s));
    drawClouds(470, 1.1, 5, 0.85);
    if (ok(img.deck)) cx.drawImage(img.deck, 0, 0);
    if (ok(img.pad)) cx.drawImage(img.pad, PAD.x, PAD.y, img.pad.naturalWidth * PAD.s, img.pad.naturalHeight * PAD.s);
    put(img["boiler-on"], 150, 178, 150);
    drawOrb();
    drawBelt();
    drawRocket();
    for (const c of S.crates) drawCrate(c);
    for (const s of STATIONS) drawStation(s);
    drawJam();
    drawLever();
    drawShippyDeck();
    drawPuffs();
    drawClouds(600, 1.6, 12, 0.95);
    cx.setTransform(DPR, 0, 0, DPR, 0, 0);
    drawCorner();
  }

  // ---------- go ----------
  let last = 0, ready = 0;
  function frame(now) {
    const dt = Math.min(0.05, (now - (last || now)) / 1000); last = now;
    if (ready >= names.length) { step(dt); camStep(dt); }
    draw();
    requestAnimationFrame(frame);
  }
  for (const n of names) { const im = new Image(); im.onload = im.onerror = () => { ready++; }; im.src = ART + n + ".webp"; img[n] = im; }
  { const t = portrait() ? target() : fitAll(); Object.assign(cam, t); } // first frame is already framed
  say("Software is a factory.");
  requestAnimationFrame(frame);
})();
