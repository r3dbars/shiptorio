// Shiptorio opening story, version B (thread "Prototype the story loop in flat 2D").
// One tiny line: CODE -> TEST -> REVIEW -> SHIP. Crates are changes, rockets are releases.
// Justin's locked story (2026-10-28), one thumb action per beat, each with a visible payoff:
//   1 Software is a factory: start from nothing, each tap builds the next piece (ideas, code, test, pad)
//     until the first rockets launch.
//   2 There's always a bottleneck: a review step builds itself in, the line speeds up and stops at YOUR CALL.
//   3 Swipe, and it moves: one swipe ships a batch.
//   4 Approve the same kind twice more and it's automatic: you step out of the line, free for the next jam.
(() => {
  "use strict";
  const NS = "http://www.w3.org/2000/svg";
  // The line runs bottom to top (phones are tall): CODE at the bottom, rockets leave from SHIP at the top.
  const COL = 196, SPEED = 190, PER_ROW = 6, CELL = 15, BOX_W = 64, BOX_H = 48;
  const YOU_X = COL + 54; // the little "you" stands just above the station label
  const $ = (id) => document.getElementById(id);
  const svg = $("stage");

  const SRC_Y = 470; // the ideas hopper, below CODE
  // Beat 1 builds the line one tap at a time. Each entry is what that tap builds and what the caption says then.
  const BUILD = [
    { piece: -1, title: "Ideas drop in here.", sub: "Here's your first one.", float: "ideas" },
    { piece: 0, title: "Ideas become code.", sub: "Something has to write it.", float: "+ code" },
    { piece: 1, title: "Code gets checked.", sub: "Tests catch what's broken.", float: "+ tests" },
    { piece: 3, title: "And then it ships.", sub: "Watch.", float: "+ launch pad" },
  ];
  const BEATS = [
    { title: "", sub: "", prompt: "Tap to build your factory" },
    { title: "There's always a bottleneck.", sub: "Right now, it's waiting on your calls.", prompt: "" },
    { title: "Swipe, and it moves.", sub: "Your yes is what ships it.", prompt: "Swipe right to approve" },
    { title: "Same kind again.", sub: "Approve it twice more and it's automatic.", prompt: "Swipe right" },
  ];
  const CARDS = [
    { title: "Fix typo on login page", sub: "small fix · tests green" },
    { title: "Fix broken docs link", sub: "small fix · tests green" },
    { title: "Fix button label", sub: "small fix · tests green" },
  ];

  let S; // all mutable state, rebuilt on replay
  function fresh() {
    return {
      beat: -1, t: 0, beatT: 0, shipped: 0, spawnEvery: 0, spawnT: 0,
      swipes: 0, auto: false, ended: false, builds: 0, live: false,
      crates: [], rockets: [], floats: [], ripples: [],
      you: null, // the little person at YOUR CALL: { x, y, tx, ty }
      st: [
        { y: 392, label: "CODE", svc: 0.45, cap: 2, q: [], work: [], built: false },
        { y: 290, label: "TEST", svc: 0.35, cap: 2, q: [], work: [], built: false },
        // budget: how many crates the station may still take. null = no limit.
        { y: 188, label: "YOUR CALL", svc: 0.45, cap: 1, q: [], work: [], budget: null, built: false },
        { y: 86, label: "SHIP", svc: 0.3, cap: 4, q: [], work: [], built: false },
      ],
    };
  }

  // ---------- static scene ----------
  function el(tag, attrs, parent) {
    const n = document.createElementNS(NS, tag);
    for (const k in attrs) n.setAttribute(k, attrs[k]);
    if (parent) parent.appendChild(n);
    return n;
  }
  let stationEls = [], dyn, ring, belt, src, ghost;
  function buildScene() {
    svg.textContent = "";
    belt = el("line", { x1: COL, y1: SRC_Y, x2: COL, y2: SRC_Y, class: "belt" }, svg);
    ghost = el("rect", { x: COL - BOX_W / 2, y: SRC_Y - 16, width: BOX_W, height: 32, rx: 10, class: "ghost" }, svg);
    src = el("g", { class: "src off" }, svg);
    el("path", { d: `M${COL - 30} ${SRC_Y - 14} L${COL + 30} ${SRC_Y - 14} L${COL + 16} ${SRC_Y + 12} L${COL - 16} ${SRC_Y + 12} Z` }, src);
    el("text", { x: COL + BOX_W / 2 + 10, y: SRC_Y + 4 }, src).textContent = "IDEAS";
    stationEls = S.st.map((s) => {
      const g = el("g", { class: "st off" }, svg);
      el("rect", { x: COL - BOX_W / 2, y: s.y - BOX_H / 2, width: BOX_W, height: BOX_H, rx: 10 }, g);
      const label = el("text", { x: COL + BOX_W / 2 + 10, y: s.y + 5 }, g);
      label.textContent = s.label;
      return { g, label };
    });
    ring = el("circle", { cx: COL, cy: S.st[1].y, r: 36, class: "ring" }, svg);
    dyn = el("g", {}, svg);
  }
  function stationClass(i, cls, label) {
    stationEls[i].g.setAttribute("class", "st " + cls);
    if (label) { S.st[i].label = label; stationEls[i].label.textContent = label; }
  }

  function pop(g) { g.classList.remove("off", "pop"); void g.getBoundingClientRect(); g.classList.add("pop"); }
  // Build the next piece of the line: the hopper (-1) or a station. The belt grows up to the highest piece.
  function build(piece) {
    if (piece < 0) pop(src);
    else { S.st[piece].built = true; pop(stationEls[piece].g); }
    const top = S.st.filter((s) => s.built).reduce((y, s) => Math.min(y, s.y), SRC_Y);
    belt.setAttribute("y2", top);
    S.ripples.push({ x: COL, y: piece < 0 ? SRC_Y : S.st[piece].y, t: 0 });
    for (const c of S.crates) if (c.state === "hold" && S.st[0].built) c.state = "move";
  }
  function showGhost(piece) {
    if (piece == null) { ghost.classList.remove("on"); return; }
    const y = piece < 0 ? SRC_Y : S.st[piece].y, h = piece < 0 ? 32 : BOX_H;
    ghost.setAttribute("y", y - h / 2); ghost.setAttribute("height", h);
    ghost.classList.add("on");
  }

  // ---------- simulation ----------
  // The next built station above i (crates skip spots that aren't built yet), or -1.
  const nextBuilt = (i) => { for (let j = i + 1; j < S.st.length; j++) if (S.st[j].built) return j; return -1; };
  function spawn() {
    const to = nextBuilt(-1);
    S.crates.push({ x: COL, y: SRC_Y + 4, to: Math.max(0, to), state: to < 0 ? "hold" : "move", t: 0 });
  }
  const entryY = (i) => S.st[i].y + BOX_H / 2 + 12;
  // The pile builds out to the left of a station and up, so a backlog reads as a growing heap.
  function pileSlot(i, k) { return { x: COL - BOX_W / 2 - 14 - (k % PER_ROW) * CELL, y: S.st[i].y + BOX_H / 2 - 7 - Math.floor(k / PER_ROW) * CELL }; }
  function step(dt) {
    S.t += dt; S.beatT += dt;
    if (S.spawnEvery > 0) {
      S.spawnT += dt;
      while (S.spawnT >= S.spawnEvery) { S.spawnT -= S.spawnEvery; spawn(); }
    }
    for (const c of S.crates) {
      if (c.state !== "move") continue;
      const ty = entryY(c.to);
      c.y = Math.max(ty, c.y - SPEED * dt);
      c.x += (COL - c.x) * Math.min(1, dt * 10);
      if (c.y <= ty) { c.state = "queue"; S.st[c.to].q.push(c); }
    }
    S.st.forEach((s, i) => {
      for (const c of s.work) c.t += dt;
      const j = nextBuilt(i);
      // A finished crate with nowhere to go yet waits inside its machine.
      const leaving = s.work.filter((c) => c.t >= s.svc && (i === S.st.length - 1 || j >= 0));
      for (const c of leaving) {
        if (i === S.st.length - 1) launch(c);
        else { c.state = "move"; c.to = j; c.x = COL; c.y = s.y - BOX_H / 2; }
      }
      s.work = s.work.filter((c) => !leaving.includes(c));
      while (s.work.length < s.cap && s.q.length && (s.budget == null || s.budget > 0)) {
        if (s.budget != null) s.budget--;
        const c = s.q.shift(); c.state = "work"; c.t = 0; s.work.push(c);
      }
      const ease = Math.min(1, dt * 12);
      s.q.forEach((c, k) => { const p = pileSlot(i, k); c.x += (p.x - c.x) * ease; c.y += (p.y - c.y) * ease; });
      s.work.forEach((c, k) => { c.x = COL + (s.work.length > 1 ? (k - (s.work.length - 1) / 2) * 16 : 0); c.y = s.y; });
    });
    S.crates = S.crates.filter((c) => c.state !== "gone");
    for (const r of S.rockets) { r.v += 260 * dt; r.y -= r.v * dt; }
    S.rockets = S.rockets.filter((r) => r.y > -40);
    for (const f of S.floats) f.t += dt;
    S.floats = S.floats.filter((f) => f.t < 1.2);
    for (const r of S.ripples) r.t += dt;
    S.ripples = S.ripples.filter((r) => r.t < 0.6);
    if (S.you) { const e = Math.min(1, dt * 2.5); S.you.x += (S.you.tx - S.you.x) * e; S.you.y += (S.you.ty - S.you.y) * e; }
    director();
  }
  function launch(c) {
    c.state = "gone";
    S.rockets.push({ x: COL + ((S.shipped % 3) - 1) * 16, y: S.st[3].y - 34, v: 60 });
    S.shipped++;
    const n = $("shipped");
    n.textContent = S.shipped;
    n.parentElement.classList.remove("bump"); void n.parentElement.offsetWidth; n.parentElement.classList.add("bump");
  }
  function float(x, y, text, color) { S.floats.push({ x, y, text, color, t: 0 }); }

  // ---------- story director ----------
  function setBeat(b) {
    S.beat = b; S.beatT = 0;
    document.querySelectorAll(".dots li").forEach((d, i) => d.classList.toggle("on", i <= b));
    if (b === 0) { caption(BUILD[0].title, "Tap to start building."); prompt(BEATS[0].prompt); showGhost(-1); return; }
    caption(BEATS[b].title, BEATS[b].sub);
    prompt(BEATS[b].prompt);
    if (b === 1) {
      // A review step builds itself in. Work speeds up and every change now stops for a human call.
      build(2);
      float(COL - 80, S.st[2].y - 34, "+ review", "var(--you)");
      S.spawnEvery = 0.42;
      S.st[2].budget = 0;
      stationClass(2, "you pop");
      S.you = { x: YOU_X + 50, y: S.st[2].y - 26, tx: YOU_X, ty: S.st[2].y - 26 };
    }
    if (b === 2) showCard();
  }
  function caption(title, sub) {
    const c = document.querySelector(".caption");
    $("title").textContent = title; $("sub").textContent = sub;
    c.classList.remove("fade"); void c.offsetWidth; c.classList.add("fade");
  }
  function prompt(text) {
    const p = $("prompt");
    p.textContent = text;
    p.classList.toggle("pulse", !!text);
  }
  let pending = null; // one scheduled transition at a time
  function after(sec, fn) { if (!pending) pending = { at: S.t + sec, fn }; }
  function director() {
    if (pending && S.t >= pending.at) { const fn = pending.fn; pending = null; fn(); }
    if (S.beat === 0 && S.shipped >= 4) after(0.9, () => setBeat(1));
    if (S.beat === 1 && S.st[2].q.length >= 9) after(0.8, () => setBeat(2));
  }

  // ---------- actions ----------
  function tap(e) {
    if (e.target.closest && e.target.closest("button, a, .card")) return;
    if (S.beat !== 0) return;
    if (S.builds < BUILD.length) {
      const b = BUILD[S.builds++];
      build(b.piece);
      const y = b.piece < 0 ? SRC_Y : S.st[b.piece].y;
      float(COL - 80, y - 30, b.float, "var(--ink)");
      caption(b.title, b.sub);
      if (S.builds === 1) spawn();
      const more = S.builds < BUILD.length;
      showGhost(more ? BUILD[S.builds].piece : null);
      prompt(more ? "Tap to build the next piece" : "");
      if (!more) after(2.2, () => {
        S.live = true; S.spawnEvery = 1.1;
        caption("Software is a factory.", "Ideas go in. Rockets come out.");
        prompt("Tap to drop in more ideas");
      });
      return;
    }
    if (!S.live) return;
    spawn();
    S.ripples.push({ x: COL, y: SRC_Y, t: 0 });
    float(COL - 80, SRC_Y - 30, "+1 idea", "var(--crate)");
  }
  function showCard() {
    const card = $("card"), c = CARDS[S.swipes];
    $("card-title").textContent = c.title;
    $("card-sub").textContent = c.sub;
    const learn = $("card-learn"), left = 3 - S.swipes;
    learn.hidden = S.swipes === 0;
    learn.textContent = `${"●".repeat(S.swipes)}${"○".repeat(left)}  ${left} more like this and it's automatic`;
    card.hidden = false; card.classList.remove("gone"); card.style.transform = "";
    card.classList.remove("enter"); void card.offsetWidth; card.classList.add("enter");
  }
  function approve() {
    const card = $("card");
    if (S.beat < 2 || S.auto || card.hidden || card.classList.contains("gone")) return;
    card.classList.add("gone");
    S.swipes++;
    const you = S.st[2];
    // Each yes releases a batch of the pile, fast, so the swipe visibly moves the line.
    you.svc = 0.1; you.cap = 3; you.budget += Math.max(4, Math.ceil(you.q.length * 0.5));
    float(COL - 80, you.y - 34, "approved", "var(--ok)");
    S.ripples.push({ x: COL, y: you.y, t: 0 });
    setTimeout(() => { card.hidden = true; }, 260);
    if (S.swipes === 1) after(1.6, () => { setBeat(3); showCard(); });
    else if (S.swipes === 2) {
      caption("One more.", "Then this kind ships without you.");
      after(0.9, showCard);
    } else goAuto();
  }
  function goAuto() {
    S.auto = true;
    prompt("");
    const you = S.st[2];
    after(0.9, () => {
      you.budget = null; you.svc = 0.12; you.cap = 3;
      S.spawnEvery = 0.3;
      stationClass(2, "auto", "AUTOMATED");
      float(COL - 80, you.y - 34, "automatic", "var(--ok)");
      caption("Automated.", "It runs itself now. You step out of the line.");
      // You walk off the line to the next jam.
      S.you.ty = S.st[1].y - 26;
      after(2.6, () => {
        caption("You're free to fix the next jam.", "That's the whole game.");
        ring.classList.add("on");
        stationClass(1, "jam", "NEXT JAM");
        after(2.8, end);
      });
    });
  }
  function end() {
    S.ended = true;
    $("end").hidden = false;
    $("card").hidden = true;
    prompt("");
  }

  // Swipe: drag the card right past ~80px. The button and the right arrow key do the same.
  (function swipe() {
    const card = $("card");
    let x0 = null, dx = 0;
    card.addEventListener("pointerdown", (e) => {
      if (e.target.closest("button")) return;
      x0 = e.clientX; dx = 0; card.classList.add("drag"); card.setPointerCapture(e.pointerId);
    });
    card.addEventListener("pointermove", (e) => {
      if (x0 === null) return;
      dx = Math.max(-30, e.clientX - x0);
      card.style.transform = `translateX(${dx}px) rotate(${dx / 30}deg)`;
      card.style.borderColor = dx > 80 ? "var(--ok)" : "";
    });
    const up = () => {
      if (x0 === null) return;
      x0 = null; card.classList.remove("drag"); card.style.borderColor = "";
      if (dx > 80) approve(); else card.style.transform = "";
    };
    card.addEventListener("pointerup", up);
    card.addEventListener("pointercancel", up);
  })();
  $("approve").addEventListener("click", approve);
  addEventListener("keydown", (e) => {
    if (e.key === "ArrowRight") approve();
    if ((e.key === " " || e.key === "Enter") && !e.target.closest("button, a")) { e.preventDefault(); tap(e); }
  });
  $("app").addEventListener("pointerdown", tap);
  $("replay").addEventListener("click", start);

  // ---------- draw ----------
  function rocket(r) {
    const flick = 4 + Math.sin(S.t * 40 + r.x) * 2;
    return `<g transform="translate(${r.x.toFixed(1)} ${r.y.toFixed(1)})">` +
      `<path class="flame" d="M-4 14 L0 ${(14 + flick * 1.5).toFixed(1)} L4 14 Z"/>` +
      `<path class="rocket" d="M0 -14 L7 -3 L7 14 L-7 14 L-7 -3 Z"/></g>`;
  }
  function person(p) {
    const bob = S.auto ? Math.sin(S.t * 9) * 1.5 : 0;
    return `<g transform="translate(${p.x.toFixed(1)} ${(p.y + bob).toFixed(1)})" class="${S.auto ? "free" : "busy"}">` +
      `<circle class="agent" cx="0" cy="-12" r="7"/><rect class="agent" x="-7" y="-3" width="14" height="17" rx="6"/>` +
      `<text class="float" y="-25" fill="var(--you)">you</text></g>`;
  }
  function draw() {
    let h = !S.st[3].built ? "" : `<rect class="pad" x="${COL - 30}" y="${S.st[3].y - BOX_H / 2 - 6}" width="60" height="4" rx="2"/>`;
    for (const r of S.ripples) {
      const k = r.t / 0.6;
      h += `<circle cx="${r.x}" cy="${r.y}" r="${(10 + k * 30).toFixed(1)}" fill="none" stroke="var(--ink)" stroke-width="2" opacity="${(1 - k).toFixed(2)}"/>`;
    }
    for (const c of S.crates) {
      h += `<rect class="crate" x="${(c.x - 6).toFixed(1)}" y="${(c.y - 6).toFixed(1)}" width="12" height="12" rx="2"/>`;
    }
    if (S.you) h += person(S.you);
    for (const r of S.rockets) h += rocket(r);
    for (const f of S.floats) {
      const k = f.t / 1.2;
      h += `<text class="float" x="${f.x}" y="${(f.y - k * 18).toFixed(1)}" fill="${f.color}" opacity="${(1 - k * k).toFixed(2)}">${f.text}</text>`;
    }
    dyn.innerHTML = h;
  }

  let last = 0, raf = 0;
  function frame(now) {
    const dt = Math.min(0.05, (now - (last || now)) / 1000);
    last = now;
    step(dt);
    draw();
    raf = requestAnimationFrame(frame);
  }
  function start() {
    cancelAnimationFrame(raf);
    S = fresh(); pending = null; last = 0;
    $("shipped").textContent = "0";
    $("end").hidden = true; $("card").hidden = true;
    buildScene();
    setBeat(0);
    raf = requestAnimationFrame(frame);
  }
  window.__story = { get state() { return S; } }; // for screenshots/tests
  start();
})();
