# BLACK IRON LINE — module contract

> Historical prototype guidance (Oct 26, marked 2026-10-30). This is not the current game rulebook. The 2D pixel deck is the product; follow [VISION.md](../../VISION.md) and [pixel-deck.md](../../context/pixel-deck.md).

You are one of several agents building ONE world in parallel: Justin's chosen "Black Iron" Cogworks factory,
rebuilt as a **real, readable production line**. Read this whole file before writing code.

## What Justin asked for (his words, condensed)
- Black Iron is the winner: dark, dirty, gritty, oily, "get your hands dirty" foundry. **But a bit brighter** so you
  can see more, especially on a phone. Pixels at **1x** (default render is now 1x).
- Keep some **height** (multi-level belts like Undercroft) — e.g. rejected PRs ride a raised belt back.
- Steal from Aether Foundry: the **electricity feeding into the rocket** (tesla coils) and the **blue aether coils /
  conduits running around** the floor.
- The **underside of the island** must be far more visible and crazy detailed — lots going on underneath.
- **The whole point: see the work actually move.** "The issue moves down the conveyor belt, when it hits the
  clockwork assembler a little arm grabs that piece and puts it onto the thing with the papers that transforms it,
  the next thing grabs it and puts it into the clockwork that sucks it up the tube, through the tube to the other
  conveyor belt, to the Aether Splitter, which starts up and does its thing... you can literally see the journey."
  It must feel **intentional and satisfying**, not "a bunch of moving shit". Items glow / are clearly indicated.
- **Every machine has obvious IDLE / WORKING / BLOCKED states.** Blocked = stuck, needs a decision from the human:
  red / yellow caution, pinging, unmistakable.
- Extreme fidelity and fine detail everywhere.

## Files and ownership
```
/home/claude/iron/core.js        integrator only (read it! it's the API)
/home/claude/iron/template.html  integrator only (renderer, pixel pass, camera, HUD)
/home/claude/iron/modules/world.js      WORLD agent
/home/claude/iron/modules/underside.js  UNDERSIDE agent
/home/claude/iron/modules/belts.js      BELTS agent
/home/claude/iron/modules/assembler.js  ASSEMBLER agent
/home/claude/iron/modules/splitter.js   SPLITTER agent
/home/claude/iron/modules/launch.js     LAUNCH agent
```
Write ONLY your own module file. Never edit core.js, template.html, build.js, shot.js or another agent's module.
If you need a core change, put it in your final report (be specific). Wrap your module in an IIFE.
Reference art to copy from (read it, copy helpers you need into your own file — don't `require` across files):
`/home/claude/dioramas/styles/cogiron.js` (Black Iron, the base look: palette `C`, `mats`, `gear`, `gauge`,
`rivetRing`, `band`, `puff`, `lamp`, cobble/brick/stone textures, belt builder, drop forge, furnace, machines),
`/home/claude/dioramas/styles/cogaether.js` (tesla coils, teal aether conduits with pulses, pneumatic tubes),
`/home/claude/dioramas/styles/cogpit.js` (multi-level belts, catwalks, cranes, hoists).

## Coordinate system
Everything outside a machine is **root-local**: +x runs left→right across the screen, +z points toward the viewer,
+y is up. The camera is orthographic, yaw 45°, tilt 30° (looks down at the front). The platform deck top is y≈0.1.
Platform footprint x −18.5..18.5, z −7.5..7.5, slab from y 0.1 down to y −1.4. Below y −1.4 is the underside.

Machines are built in their own **LOCAL** frame: the engine puts each in a holder at root (slotX, 0, 0) rotated −45°
about y, so a machine is seen from its 45° corner: its **+x face (front-right) and +z face (front-left) face the camera**.
`M.toRoot(x,y,z)` converts local → root. Slots: assembler x=−10, splitter x=0, launch x=10. Footprint ≤ 5×5 local
(±2.5), plinth top ~y 0.4. Keep machines ≤ ~7.5 tall (rocket flies higher).

## The line (paths) — owned by core, built visually by BELTS / UNDERSIDE
Items travel these paths (root coords, y = surface the item sits on). Speeds in units/s.
```
rail    (UNDERSIDE builds) rail, speed 1.4, carrier 'cart'  : [8,-9.5,6.6] -> [-13.4,-9.5,6.6] -> [-15.2,-9.5,8.3]  -> lift
         mine mouths along the rail at x = 8 (INBOX, blue 0x5aa8ff), x = 1 (GITHUB, amber 0xffb040), x = -6 (SENTRY, red 0xff4a3a)
lift    (UNDERSIDE builds) vertical, speed 1.6, carrier 'cage' : [-15.2,-9.5,8.3] -> [-15.2,1.0,8.3]  -> ore
ore     (BELTS)  belt : [-15.2,1,8.3] -> [-15.2,1,4.49] -> [-13.82,1,3.11] -> [-12.4,1,1.7] = assembler.in
tube    (BELTS)  glass pneumatic tube, speed 3.4, smooth CatmullRom through
         [-10,4.45,-1.56] (=assembler.out) [-10,5.75,-1.56] [-8.6,6.15,-1.0] [-7.0,5.4,0.7] [-6.2,3.4,2.1] [-6.2,1.35,2.4] -> feed
         (use ctx.paths.tube.points: 49 already-smoothed points)
feed    (BELTS)  belt : [-6.2,1,2.4] -> [-4.24,1,2.55] -> [-2.9,1,1.2] = splitter.in
pass    (BELTS)  belt : [2.69,1,1.41] (=splitter.pass) -> [4.23,1,2.96] -> [6.18,1,2.97] -> [7.53,1,1.63] = launch.in
rw1     (BELTS)  belt : [-2.69,1,-1.41] (=splitter.reject) -> [-3.82,1,-2.55] -> rwUp
rwUp    (BELTS)  vertical lift, speed 1.5, carrier 'bucket' : [-3.82,1,-2.55] -> [-3.82,6.9,-2.55]
rwHigh  (BELTS)  HIGH belt : [-3.82,6.9,-2.55] -> [-14.6,6.9,-2.55]   (passes ~0.7 above the pneumatic tube's peak: a real crossing)
rwDown  (BELTS)  vertical drop, speed 1.5, carrier 'bucket' : [-14.6,6.9,-2.55] -> [-14.6,1,-2.55]
rwIn    (BELTS)  belt : [-14.6,1,-2.55] -> [-14.6,1,-0.5] -> [-13.96,1,0.14] -> [-12.4,1,1.7] = assembler.in
```
`ore` arrives at the assembler tray perpendicular to its front-left face; `rwIn` arrives along that face from the
left corner — the tray is a junction. Item spacing on a path ≥ 0.85 (1.2–1.4 on lifts). Items back up when a station
is blocked — that backlog is a feature (visible bottleneck).

Path objects (`ctx.paths[name]`): `points` (array of [x,y,z]), `segs`, `L` (length), `at(s, outVec3)` → seg with
`yaw`/`pitch`, `items` (items on it, each with `.s`), `speed`, `flow` (0..1: 1 running, →0 when jammed),
`jammed` (true when the front item has been stuck at the end for >1.2s and items are queued behind it).
Belt textures should scroll at `speed * flow` (match item speed so items don't slide), stop when jammed, and jam
warning lights go red.

## Ports (machine LOCAL coords → root)
```
assembler.in   local [-0.5, 1.0, 2.9]   root [-12.4, 1, 1.7]    intake TRAY just outside the front-left (+z) face
assembler.out  local [-1.1, 4.45,-1.1]  root [-10, 4.45, -1.56] top of the difference-engine dome: the tube starts here
splitter.in    local [-1.2, 1.0, 2.9]   root [-2.9, 1, 1.2]     intake tray on the front-left (+z) face, near left corner
splitter.pass  local [ 2.9, 1.0,-0.9]   root [2.69, 1, 1.41]    PASS outlet on the front-right (+x) face -> launch
splitter.reject local [-2.9,1.0, 0.9]   root [-2.69,1,-1.41]    REJECT outlet on the back-left (-x) face -> rework
launch.in      local [-0.6, 1.0, 2.9]   root [7.53, 1, 1.63]    intake tray on the front-left (+z) face
```
Machine agents build the tray/hopper/outlet hardware AT their ports; BELTS builds belts up to (not into) them.
Aether conduit sockets (BELTS runs teal conduits between them; machine agents add a visible brass socket fitting):
`splitter source` root [0, 0.35, -2.9] (= splitter local [-2.05,0.35,-2.05], its back corner), `assembler socket` root [-7.4, 0.35, -2.4]
(= assembler local [0.14,0.35,-3.53] — just behind its back face; put a junction box there), `launch socket`
root [7.2, 0.35, -2.3] (= launch local [-3.6,0.35,0.35]... i.e. just off its back-left face; put the coil feed there).

## Items (core-owned visuals)
`IRON.items` — each item: `id`, `label()` → "#142", `title`, `src` ('sentry'|'github'|'inbox'), `kind`, `attempts`,
`reason`, `stage`, `mesh` (child of root, origin = bottom center, ~0.5 units big), `parts.halo`.
Kinds: `issue` (ore lump w/ glowing crystals in source color) → `cards` (bound punch-card stack) → `capsule`
(brass capsule, amber band = PR) → `pass` (green band + check light) or `reject` (red band + red scar tag).
`item.setKind(k)` swaps the look with a flash ring. `item.follow(object3D, ox,oy,oz)` makes it ride an object
(gripper, platform, rocket); the core moves it after your update. `item.place(rootVec3)`, `item.hide()/show()`.
Items held by a BLOCKED station blink amber/red automatically.

## Machine API (`IRON.machine(id, (K, M) => ({ g, update(t, dt) }))`)
`g` is your LOCAL-frame group (engine parents + rotates it). `update` runs every frame (dt already sim-speed scaled).
```
M.waiting('in')        item sitting at your intake tray (or null)
M.take('in')           claim it (removes it from the belt) — then position it every frame with item.follow(...)
M.give(item, port)     hand to an output path ('out' assembler; 'pass'|'reject' splitter). false if the path entry is full → keep holding, retry next frame
M.canGive(port)
M.setState('IDLE'|'WORKING', detailText)   detail shows in the HUD chip, e.g. '#142 · punching cards'
M.blocked              true while a human decision is pending (random event or the user's STALL). FREEZE your cycle while true.
M.stateShown           'IDLE'|'WORKING'|'BLOCKED'
M.maybeDecision(text)  call at your natural decision point; may block (random, ~10–30%). Returns true if it blocked.
M.decision(text)       force a decision
M.judge(item)          splitter only: { pass: bool, reason }
M.pass(item) / M.reject(item, reason)   splitter only: logs + counters (call after setKind)
M.consume(item)        launch only: the PR shipped (removes item, SHIPPED++)
M.toRoot(x,y,z) M.rootOf(obj) M.port(name).local
K.caution(parent,x,y,z,scale) -> {update(t,dt,M.stateShown)}  hazard post: spinning amber beacon, "!" sign flips up, floor ping rings
K.statusLamp(parent,x,y,z,scale) -> {set(M.stateShown, t)}     green/amber/red stack
```
Every machine MUST: place one `K.caution` and one `K.statusLamp` where the camera sees them; drive them every
frame; set state/detail through the whole cycle; and give BLOCKED its own unmistakable machine-specific look
(alarm lamps, steam venting, gauges redlined, arms frozen with the item, warning strobes). IDLE must look idle
(slow, dim, waiting) and WORKING busy. Never let an item teleport: every handoff is a visible motion.

## World / underside / belts API
```
IRON.world((K, root, scene, ctx) => ({ update(t, dt) }))   also call IRON.look({ sky, light, finish }) — WORLD owns the look
IRON.underside((K, root, ctx) => ({ update(t, dt) }))
IRON.belts((K, root, ctx) => ({ update(t, dt) }))
IRON.carrier(name, (K, item) => object3D)   carrier mesh drawn around an item while it rides that path ('cart','cage' by UNDERSIDE, 'bucket' by BELTS); item origin = where the item sits
IRON.on('spawn'|'take'|'give'|'kind'|'pass'|'reject'|'ship'|'decision'|'resolve', fn)   events (e.g. mine mouth flashes on spawn)
ctx: { paths, PATH_DEFS, PORTS, PORT_ROOT, SLOTS, MINES, toRoot, items, I }
```

## Kit (K)
Same as the diorama kit: `box cyl cone sph torus rock lathe tube group mat(color,{e,ei,shine,spec,op,double,map,depthWrite}) glow(color,op,additive) canvasTex spawn keyframes lerp smooth clamp01 link rnd R`
plus `K.light(color,intensity,dist,x,y,z,parent)` (point lights are rationed per module: world 3, underside 3,
belts 0, assembler 1, splitter 1, launch 2 — extras silently become dummies; prefer emissive/glow materials) and
**`K.bake(group)`**: merges all static meshes under a group by material → far fewer draw calls. USE IT for all
static decor (put moving parts in separate groups that you don't bake). Particles: `K.spawn` (global cap 1100).

## Look + brightness (everyone)
Black Iron palette (oil-black iron, soot, rust, brass, copper, verdigris, brick, furnace orange, aether teal 0x7af0d8),
but **lift albedos ~25–40% vs cogiron.js** and keep strong value separation: dark grime areas next to readable
mid-tones, bright emissive accents. Must read on a phone at 1x. No pure-black mush. Grime = decals, oil sheen,
rust streaks, soot gradients, drips — not just darkness.

## Testing (use your OWN output + prefix so you don't clobber other agents)
```
cd /home/claude/iron
node build.js --out=out-<you>.html                 # includes every module that currently exists (others may be half-done; a broken
                                                    # module is skipped). Use --only=<you>[,belts,...] to isolate.
timeout 170 node shot.js out-<you>.html <you> --view=line,assembler --warm=30 --sheet
```
shot.js options: `--view=line|deck|under|follow|assembler|splitter|launch` (comma list), `--warm=SEC` fast-forward
the sim first, `--frames=N --gap=SEC` sequence (e.g. `--frames=9 --gap=0.6` to check a choreography),
`--block=assembler` force BLOCKED, `--px=2`, `--mobile`, `--zoom=0.6` (closer), `--sheet` grid image. It prints
console errors + line stats (items per path, counters). Read the PNGs. Headless is slow, so rely on --warm/--gap
(simulated time), not wall-clock. Check: no errors, items visibly flow through your part, states read at a glance
at LINE view and up close, mobile (--mobile) is readable.

Iterate many rounds. The bar is "phenomenal, extremely detailed, intentional". Report at the end in ≤8 lines:
what you built, anything you need from core, known rough spots.

## Round 2 additions (after independent QA — read QA.md)
- **Mine emerge**: a new issue now rolls OUT of its mine tunnel: its cart starts 2.4 units inside the rock
  (root z = 6.6 − 2.4 = 4.2, at the mine's x, y −9.5) and slides out to the rail over 1.8 s, facing +z, then turns
  onto the rail. `IRON.on('spawn', e)` gives `{ item, src, s, from, to, dur }` at the START of that motion.
- **Carrier handoff events** (kill the pop when an item changes carrier): `IRON.on('carrierDrop', e)` fires when an
  item leaves a path that had a carrier, `IRON.on('carrierPick', e)` when it boards one. `e = { item, carrier, path,
  pos, quat }` (root-space pose of the carrier at that instant). The owner of the carrier should draw an EMPTY stand-in
  at exactly that pose that carries on moving (cart tips and rolls back into a siding; the empty cage continues over
  the top sheave / down the return side; the bucket tips and returns down), and for picks show the empty carrier
  arriving just before (or keep an empty one waiting at the boarding point and hide it on pick).
- **Orientation now eases** at corners/handoffs (core slerps); tube items are centered in the glass.
- **State aura (core)**: every machine now has a floor ring (r 3.75, y 0.14 local: dim blue idle, green working,
  pulsing amber/red + ping when blocked) and a tall amber beacon beam above it when blocked. Don't fight it: keep
  y ≈ 0.1–0.2 at radius ~3.75 clear of opaque floor clutter so the ring reads.
- **Caution posts are 1.3x bigger** by default now — re-check placement.
- **Warm start**: the line is seeded with work at every stage on load (ore, lift, feed, pass) — your machine will
  be mid-cycle within seconds.
- **Fonts**: canvas text may use `'Silkscreen', monospace` (the template waits for the font before building).
- HUD chips are moving to compact pills at the deck's front edge (template), so the machines themselves are no longer
  covered.
