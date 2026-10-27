// =====================================================================
// THE SHAFT: the vertical layout (see CONTRACT.md before changing numbers)
// Work climbs the factory floor by floor: mined deep underground, planned and built on the foundry,
// checked one floor up, launched from the top.
//
//   LAUNCH  (tier y 22)  merge gate -> launch pad -> rocket into the sky (orbit watch up there)
//      ^ freight lift (left)
//   CHECKS  (tier y 11)  CI inspector -> researched checks -> verify bay -> AI review   (flows right to left)
//      ^ glass tubes up the wall (right)            rework belt on the front lip, drops at the left  v
//   BUILD   (tier y 0)   planner (Spark) -> assemblers (your Claude Code / Codex)           (flows left to right)
//      ^ ore lift (left)
//   MINE    (underground) tunnels in two rows -> carts tip into chutes -> ore cascades to the collector
//
// Root frame: +x left->right on screen, +y up, +z toward the viewer. The camera looks straight at the
// front (+z) and down 30deg. Each tier is set back (-z) from the one below so nothing hides anything.
// Machines are built in their own LOCAL frame and stand rotated -45deg about y (their +x face = front-right,
// +z face = front-left), exactly like the Black Iron mockup.
// =====================================================================

export const C45 = Math.SQRT1_2;

// Tiers: `y` is where machine holders stand (deck top 0.1 above it, belts at y + 1). Decks run x0..x1, z0..z1.
// Under the build deck is solid rock: its front is the mine CLIFF (z 7.5, y -16 up to the slab at -1.4) with the
// tunnel mouths in it; the mine tier is the quarry floor in front of the cliff's foot.
export const TIERS = {
  mine: { y: -16, x0: -19.5, x1: 19.5, z0: 7.5, z1: 11.5, label: 'MINE' }, // the quarry floor at the foot of the cliff
  build: { y: 0, x0: -18.5, x1: 18.5, z0: -4.5, z1: 7.5, label: 'PLAN + BUILD' },
  checks: { y: 11, x0: -18.5, x1: 18.5, z0: -15.5, z1: -4.5, label: 'CHECKS' },
  launch: { y: 22, x0: -15, x1: 15, z0: -26.5, z1: -15.5, label: 'LAUNCH' },
};
export const DECK_TOP = 0.1; // above tier y
export const SLAB = 1.5; // deck slab thickness (top 0.1 down to -1.4, like the mockup)
export const BELT = 1.0; // belt surface above tier y

// Mines: tunnel mouths in the rock face under the foundry. `y` = the cart ledge (item sits here), x = mouth center.
export const MINES = {
  github: { x: 1.5, y: -7.0, color: 0xffb040, label: 'GITHUB', row: 0 },
  inbox: { x: 11.0, y: -7.0, color: 0x5aa8ff, label: 'INBOX', row: 0 },
  sentry: { x: -6.5, y: -11.5, color: 0xff4a3a, label: 'SENTRY', row: 1 },
  posthog: { x: 6.0, y: -11.5, color: 0xb88aff, label: 'POSTHOG', row: 1 },
};
export const MINE_FACE_Z = 7.5; // the rock's front face
export const LEDGE_Z = 6.6; // carts stand on a ledge carved 0.9 into the face
export const TUNNEL_DEPTH = 2.4; // carts start this far inside the rock
export const COLLECTOR_Y = -15.5; // the bottom conveyor every chute lands on (on the quarry floor, z = LIFT_Z)
export const CHUTE_Z = 7.75; // chutes run down the cliff just in front of its face
export const LIFT_X = -17.5, LIFT_Z = 8.3; // the ore lift stands in front of the face at the left
export const RW_X = -18.0, RW_Z = -3.9; // the rework drop: in front of the checks tier's face, far left

// Ports per machine TYPE, in the machine's LOCAL frame. `out` = local outward direction [dx, dz].
export const PORTS = {
  // BUILD tier (flows left -> right): in on the front-left face, out to the right / up
  planner: { in: { p: [-1.2, 1.0, 2.9], out: [0, 1] }, pass: { p: [2.9, 1.0, -0.9], out: [1, 0] }, reject: { p: [-2.9, 1.0, 0.9], out: [-1, 0] } },
  assembler: { in: { p: [-0.5, 1.0, 2.9], out: [0, 1] }, out: { p: [-1.1, 4.45, -1.1], out: [0, 0] } },
  // CHECKS tier (flows right -> left): in on the front-right face, pass out the front-left face, rejects out the front corner
  ci: { in: { p: [2.9, 1.0, 0.6], out: [1, 0] }, pass: { p: [0.6, 1.0, 2.9], out: [0, 1] }, reject: { p: [2.05, 1.0, 2.05], out: [1, 1] } },
  verify: { in: { p: [2.9, 1.0, 0.6], out: [1, 0] }, pass: { p: [0.6, 1.0, 2.9], out: [0, 1] }, reject: { p: [2.05, 1.0, 2.05], out: [1, 1] } },
  review: { in: { p: [2.9, 1.0, 0.6], out: [1, 0] }, pass: { p: [0.6, 1.0, 2.9], out: [0, 1] }, reject: { p: [2.05, 1.0, 2.05], out: [1, 1] } },
  // researched checks are compact (footprint ±1.4): same faces, closer in
  check: { in: { p: [1.5, 1.0, 0.3], out: [1, 0] }, pass: { p: [0.3, 1.0, 1.5], out: [0, 1] }, reject: { p: [1.05, 1.0, 1.05], out: [1, 1] } },
  // LAUNCH tier (flows left -> right): in on the front-left face, pass out the front-right face
  gate: { in: { p: [-0.6, 1.0, 2.9], out: [0, 1] }, pass: { p: [2.9, 1.0, -0.6], out: [1, 0] }, reject: { p: [2.05, 1.0, 2.05], out: [1, 1] } },
  launch: { in: { p: [-0.6, 1.0, 2.9], out: [0, 1] } },
  // stations with no line ports (decor that still has states)
  orbit: {}, measure: {}, steam: {}, dynamo: {}, battery: {}, geothermal: {},
};

// Station kinds from the game (shared/src/model.ts StationKind) -> module type here.
export const KIND_TYPE = { ci: 'ci', custom: 'check', verify: 'verify', review: 'review', merge: 'gate', orbit: 'orbit', measure: 'measure' };

export const toRootAt = (st, x, y, z, out) => {
  const o = out || [0, 0, 0];
  o[0] = st.x + C45 * (x - z); o[1] = st.y + y; o[2] = st.z + C45 * (x + z);
  return o;
};
const N_FL = [-C45, C45]; // local +z (front-left face normal) in root x,z
const N_FR = [C45, C45]; // local +x (front-right face normal) in root x,z

// A plan of what's on the floor (from the game's FactoryState, or the harness):
//   { planner: {id}, assemblers: [{id, harness}], checks: [{id, kind, check?}] (CI first, line order, no merge/orbit),
//     gate: {id}|null, pad: {id}|null, orbit: {id}|null, measure: {id}|null, sources: ['github', ...],
//     power: [{id, type: 'steam'|'dynamo'|'battery'|'geothermal', feeds?: [assembler ids]}] }
export function defaultPlan() {
  return {
    planner: { id: 'planner' },
    assemblers: [{ id: 'asm-1', harness: 'claude_code' }, { id: 'asm-2', harness: 'codex' }],
    checks: [{ id: 'ci', kind: 'ci' }, { id: 'chk-secrets', kind: 'custom', check: 'secrets' }, { id: 'verify', kind: 'verify' }, { id: 'review', kind: 'review' }],
    gate: { id: 'gate' }, pad: { id: 'pad' }, orbit: { id: 'orbit' }, measure: null,
    sources: ['github', 'inbox', 'sentry', 'posthog'],
    power: [
      { id: 'steam', type: 'steam', feeds: ['planner'] },
      { id: 'dyn-1', type: 'dynamo', feeds: ['asm-1'], harness: 'claude_code' },
      { id: 'bat-1', type: 'battery', feeds: ['asm-1'] },
      { id: 'dyn-2', type: 'dynamo', feeds: ['asm-2'], harness: 'codex' },
      { id: 'geo', type: 'geothermal', feeds: [] },
    ],
  };
}

// Where the assemblers stand for 1..3 of them (the first must clear the planner's feed belt).
const ASM_X = { 1: [3.5], 2: [0, 10], 3: [-1.4, 6.6, 14.6] };
const PLANNER = { x: -12, z: 0.5 };
const BUILD_Z = 0.5, CHECKS_Z = -10, CHECK_SMALL_Z = -8.8, LAUNCH_Z = -21;

// Build the station list + path table for a plan. Pure data: the core turns it into paths and holders.
export function makeLayout(plan) {
  const stations = [];
  const paths = [];
  const B = TIERS.build.y, Ck = TIERS.checks.y, L = TIERS.launch.y;
  const add = (st) => { stations.push(st); return st; };
  const port = (st, name) => { const d = PORTS[st.type][name]; return toRootAt(st, d.p[0], d.p[1], d.p[2]); };
  const off = (p, n, k, dy) => [p[0] + n[0] * k, p[1] + (dy || 0), p[2] + n[1] * k];
  const P = (name, kind, label, pts, o) => { const d = Object.assign({ name, kind, label, pts }, o || {}); paths.push(d); return d; };

  // ---------------- MINE ----------------
  const sources = plan.sources || Object.keys(MINES);
  const collX0 = 15.0;
  // collector: right -> left along the quarry floor at the cliff's foot, into the lift boot
  P('collector', 'belt', 'ORE COLLECTOR', [[collX0, COLLECTOR_Y, LIFT_Z], [LIFT_X, COLLECTOR_Y, LIFT_Z]], { speed: 1.3, next: 'lift' });
  for (const src of Object.keys(MINES)) {
    const m = MINES[src];
    const live = sources.includes(src);
    // the cart rolls out of the tunnel (core 'emerge'), stops at the tipper and dumps the ore into the chute
    P('cart-' + src, 'rail', m.label + ' CART', [[m.x, m.y, LEDGE_Z], [m.x + 0.9, m.y, LEDGE_Z]], { speed: 1.2, carrier: 'cart', next: 'chute-' + src, mine: src, ghost: !live });
    // the chute zig-zags down the face to the collector (a cascade: three runs, each dropping and turning back)
    const top = m.y - 0.2, drop = top - COLLECTOR_Y - 0.4;
    const x0 = m.x + 1.5;
    const pts = [[m.x + 0.9, m.y, LEDGE_Z], [x0, top - 0.2, CHUTE_Z]];
    const runs = m.row === 0 ? 3 : 2;
    for (let i = 1; i <= runs; i++) pts.push([x0 + (i % 2 ? 1.6 : 0), top - 0.2 - (drop * i) / runs, i === runs ? LIFT_Z - 0.25 : CHUTE_Z]);
    const sLand = collX0 - pts[pts.length - 1][0];
    P('chute-' + src, 'chute', m.label + ' CHUTE', pts, { speed: 2.6, gap: 0.7, next: { path: 'collector', s: Math.max(0, sLand) }, mine: src, ghost: !live });
  }
  P('lift', 'lift', 'ORE LIFT', [[LIFT_X, COLLECTOR_Y, LIFT_Z], [LIFT_X, B + BELT, LIFT_Z]], { speed: 1.9, carrier: 'cage', gap: 1.4, next: 'ore' });

  // ---------------- BUILD ----------------
  const planner = add({ id: plan.planner?.id || 'planner', type: 'planner', tier: 'build', x: PLANNER.x, y: B, z: PLANNER.z, def: plan.planner || {} });
  const pIn = port(planner, 'in'), pPass = port(planner, 'pass');
  // ore belt: down from the lift landing, then a 45deg run, then square into the planner's tray
  const oreA = off(pIn, N_FL, 2.0);
  P('ore', 'belt', 'ORE BELT', [[LIFT_X, B + BELT, LIFT_Z], [LIFT_X, B + BELT, oreA[2] + (oreA[0] - LIFT_X)], oreA, pIn], { speed: 0.95, port: planner.id + '.in' });

  const asms = (plan.assemblers || []).slice(0, 3);
  const xs = ASM_X[asms.length] || [];
  const asmSt = asms.map((a, i) => add({ id: a.id, type: 'assembler', tier: 'build', x: xs[i], y: B, z: BUILD_Z, def: a }));
  // feed: out of the planner's front-right face, onto the front lane, then a spur into each assembler
  const LANE = 4.6;
  const p1 = off(pPass, N_FR, 1.6);
  const p2 = [p1[0] + (LANE - p1[2]), B + BELT, LANE];
  const J = asmSt.map((a) => { const aIn = port(a, 'in'); const A = off(aIn, N_FL, 2.0); return { a, aIn, A, J: [A[0] - (LANE - A[2]), B + BELT, LANE] }; });
  if (J.length) {
    let from = [pPass, p1, p2];
    J.forEach((j, i) => {
      const last = i === J.length - 1;
      const trunk = 'feed-' + i;
      const nextTrunk = 'feed-' + (i + 1);
      const spur = 'spur-' + j.a.id;
      const pts = i === 0 ? [...from, j.J] : [J[i - 1].J, j.J];
      P(trunk, 'belt', 'PLAN BELT', pts, { speed: 0.95, next: last ? spur : (it) => (it.dest === j.a.id ? spur : nextTrunk), junction: !last });
      P(spur, 'belt', 'PLAN BELT', [j.J, j.A, j.aIn], { speed: 0.95, port: j.a.id + '.in' });
      from = null;
    });
  }

  // ---------------- tubes up the wall to the checks tier ----------------
  const checks = plan.checks || [];
  const ckSt = [];
  // right -> left: CI at the right, then researched checks (compact), then verify, then review
  const types = checks.map((c) => KIND_TYPE[c.kind] || 'check');
  const gap = (a, b) => (a === 'check' && b === 'check' ? [2.9, 2.3] : a === 'check' || b === 'check' ? [4.9, 4.6] : [9.5, 7.6]);
  const want = types.slice(1).reduce((n, t, i) => n + gap(types[i], t)[0], 0);
  const least = types.slice(1).reduce((n, t, i) => n + gap(types[i], t)[1], 0);
  const room = 12.5 - -8.0; // CI at x 12.5, the last station no further left than x -8
  const squeeze = want <= room ? 0 : Math.min(1, (want - room) / Math.max(0.01, want - least));
  let x = 12.5;
  checks.forEach((c, i) => {
    const type = types[i];
    if (i > 0) { const [g0, g1] = gap(types[i - 1], type); x -= g0 - (g0 - g1) * squeeze; }
    ckSt.push(add({ id: c.id, type, tier: 'checks', x, y: Ck, z: type === 'check' ? CHECK_SMALL_Z : CHECKS_Z, def: c }));
  });
  const HEADER_Y = 8.2, HEADER_Z = -3.6, HEADER_X1 = 17.4;
  if (ckSt.length) {
    const ci = ckSt[0];
    const ciIn = port(ci, 'in');
    const feedStart = off(ciIn, N_FR, 2.0);
    // header: a glass tube along the wall under the checks deck, climbing up at the right end
    P('header', 'tube', 'TUBE HEADER', [[-3, HEADER_Y, HEADER_Z], [HEADER_X1 - 0.8, HEADER_Y, HEADER_Z], [HEADER_X1, HEADER_Y + 0.8, HEADER_Z], [HEADER_X1, Ck + 1.9, HEADER_Z],
      [HEADER_X1 - 0.6, Ck + 2.6, HEADER_Z - 0.9], [feedStart[0] + 0.7, Ck + 1.9, feedStart[2] + 0.4], [feedStart[0], Ck + 1.35, feedStart[2]]], { speed: 3.4, gap: 0.6, smooth: true, next: 'ci-feed' });
    P('ci-feed', 'belt', 'TO CI', [[feedStart[0], Ck + BELT, feedStart[2]], ciIn], { speed: 0.95, port: ci.id + '.in' });
    asmSt.forEach((a) => {
      const o = port(a, 'out');
      const land = a.x + 0.8;
      P('tube-' + a.id, 'tube', 'PNEUMATIC TUBE', [o, [o[0], o[1] + 1.5, o[2]], [o[0], HEADER_Y - 0.9, o[2] - 0.6], [o[0] + 0.35, HEADER_Y - 0.15, HEADER_Z + 0.9], [land, HEADER_Y, HEADER_Z]],
        { speed: 3.4, gap: 0.6, smooth: true, next: { path: 'header', s: land - -3 } });
    });
  }
  // lanes between checks (right -> left), each station's reject chute onto the red lip belt
  const LIP_Z = -5.0;
  const lipX0 = HEADER_X1 - 0.5;
  for (let i = 0; i < ckSt.length; i++) {
    const s = ckSt[i], t = ckSt[i + 1];
    const sp = port(s, 'pass');
    const small = s.type === 'check';
    if (t) {
      const ti = port(t, 'in');
      const k = small || t.type === 'check' ? 0.35 : 0.7;
      P('lane-' + s.id, 'belt', 'CHECK LINE', [sp, off(sp, N_FL, k), off(ti, N_FR, k), ti], { speed: 0.95, port: t.id + '.in' });
    }
    const r = port(s, 'reject');
    P('drop-' + s.id, 'chute', 'REJECT CHUTE', [r, [r[0], Ck + 1.25, LIP_Z - 0.9], [r[0], Ck + BELT, LIP_Z]], { speed: 1.6, next: { path: 'rework', s: lipX0 - r[0] } });
  }
  P('rework', 'belt', 'REWORK', [[lipX0, Ck + BELT, LIP_Z], [RW_X + 0.6, Ck + BELT, LIP_Z], [RW_X, Ck + BELT, RW_Z]], { speed: 1.1, next: 'rw-drop', rework: true });
  P('rw-drop', 'lift', 'REWORK DROP', [[RW_X, Ck + BELT, RW_Z], [RW_X, B + BELT, RW_Z]], { speed: 1.7, carrier: 'bucket', gap: 1.2, next: 'rw-in', rework: true });
  const rB = off(pIn, [C45, C45], -2.2);
  P('rw-in', 'belt', 'BACK TO THE PLANNER', [[RW_X, B + BELT, RW_Z], [RW_X, B + BELT, rB[2] - (rB[0] - RW_X)], rB, pIn], { speed: 0.95, port: planner.id + '.in', rework: true });

  // ---------------- up to the launch tier ----------------
  const FL_X = -15.5, FL_Z = -14.6;
  const last = ckSt[ckSt.length - 1];
  if (last) {
    const lp = port(last, 'pass');
    P('to-lift', 'belt', 'TO THE LAUNCH LIFT', [lp, off(lp, N_FL, 0.7), [FL_X, Ck + BELT, off(lp, N_FL, 0.7)[2]], [FL_X, Ck + BELT, FL_Z]], { speed: 0.95, next: 'freight' });
  }
  P('freight', 'lift', 'LAUNCH LIFT', [[FL_X, Ck + BELT, FL_Z], [FL_X, L + BELT, FL_Z]], { speed: 1.9, carrier: 'cage', gap: 1.4, next: 'to-gate' });
  const gate = plan.gate ? add({ id: plan.gate.id, type: 'gate', tier: 'launch', x: -7, y: L, z: LAUNCH_Z, def: plan.gate }) : null;
  const pad = plan.pad ? add({ id: plan.pad.id, type: 'launch', tier: 'launch', x: 5, y: L, z: LAUNCH_Z, def: plan.pad }) : null;
  if (gate) {
    const gIn = port(gate, 'in'), gA = off(gIn, N_FL, 1.6);
    // onto the deck, along it, then a 45deg run square into the gate's tray
    P('to-gate', 'belt', 'TO THE MERGE GATE', [[FL_X, L + BELT, FL_Z], [FL_X, L + BELT, -16.0], [gA[0] + 16.0 + gA[2], L + BELT, -16.0], gA, gIn], { speed: 0.95, port: gate.id + '.in' });
    if (pad) {
      const gp = port(gate, 'pass'), pIn2 = port(pad, 'in');
      P('to-pad', 'belt', 'TO THE PAD', [gp, off(gp, N_FR, 1.0), off(pIn2, N_FL, 1.0), pIn2], { speed: 0.95, port: pad.id + '.in' });
    }
    // the player said no at the gate: along the launch deck's front lip to the right end, down a bucket drop beside
    // the deck, and back along the right edge of the checks floor onto the rework belt
    const gr = port(gate, 'reject');
    const GZ = TIERS.launch.z1 - 0.4, GX = TIERS.launch.x1 + 1.0, GZ2 = TIERS.launch.z1 + 0.4;
    P('gate-reject', 'belt', 'SENT BACK', [gr, [gr[0], L + BELT, GZ], [GX - 0.8, L + BELT, GZ], [GX, L + BELT, GZ2]], { speed: 0.95, next: 'gate-drop', rework: true });
    P('gate-drop', 'lift', 'SENT BACK', [[GX, L + BELT, GZ2], [GX, Ck + BELT, GZ2]], { speed: 1.7, carrier: 'bucket', gap: 1.2, next: 'gate-return', rework: true });
    P('gate-return', 'belt', 'SENT BACK', [[GX, Ck + BELT, GZ2], [17.9, Ck + BELT, GZ2 + 1.9], [17.9, Ck + BELT, LIP_Z - 0.6], [lipX0, Ck + BELT, LIP_Z]], { speed: 0.95, next: 'rework', rework: true });
  }
  if (plan.orbit) add({ id: plan.orbit.id, type: 'orbit', tier: 'launch', x: 12.4, y: L, z: -22.4, def: plan.orbit });
  if (plan.measure) add({ id: plan.measure.id, type: 'measure', tier: 'launch', x: -12.6, y: L, z: -23.4, def: plan.measure });

  // ---------------- power ----------------
  // steam (the planner's boiler) beside the planner; one dynamo (+ battery) per subscription behind its assembler;
  // geothermal (your own computer running local models) down on the quarry floor, where the heat is.
  const power = plan.power || [];
  power.forEach((pw) => {
    const feeds = (pw.feeds || [])[0];
    const at = stations.find((s) => s.id === feeds);
    let px = at ? at.x : 0, pz = -3.2;
    if (pw.type === 'steam') { px = -6.0; pz = -2.2; } // between the planner and the first assembler
    else if (pw.type === 'battery') { px = (at ? at.x : 0) + 3.4; pz = -3.4; }
    else if (pw.type === 'dynamo') { px = (at ? at.x : 0) - 0.4; pz = -3.6; }
    if (pw.type === 'geothermal') { add({ id: pw.id, type: pw.type, tier: 'mine', x: 17.4, y: TIERS.mine.y, z: 9.7, def: pw, power: true }); return; } // heat from deep down
    add({ id: pw.id, type: pw.type, tier: 'build', x: px, y: B, z: pz, def: pw, power: true });
  });

  // where each path ends at a station port, and which path leaves each output port
  const portOut = {};
  for (const st of stations) {
    if (st.type === 'planner') portOut[st.id + '.pass'] = asmSt.length ? 'feed-0' : null;
    if (st.type === 'assembler') portOut[st.id + '.out'] = ckSt.length ? 'tube-' + st.id : null;
    if (ckSt.includes(st)) {
      const i = ckSt.indexOf(st);
      portOut[st.id + '.pass'] = i < ckSt.length - 1 ? 'lane-' + st.id : 'to-lift';
      portOut[st.id + '.reject'] = 'drop-' + st.id;
    }
    if (st.type === 'gate') { portOut[st.id + '.pass'] = pad ? 'to-pad' : null; portOut[st.id + '.reject'] = 'gate-reject'; }
  }
  return { stations, paths, portOut, tiers: TIERS, mines: MINES, sources, planner, assemblers: asmSt, checks: ckSt, gate, pad };
}
