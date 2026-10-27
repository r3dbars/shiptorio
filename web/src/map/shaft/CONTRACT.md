# THE SHAFT — module contract

You are one of several agents building ONE world in parallel: the Shiptorio factory map rebuilt as a **vertical
mine-to-launch factory** in Justin's chosen **Black Iron** style. Read this whole file before writing code.

## What Justin asked for (his words)
> "Right now this app is kind of linear from left to right. We gotta think differently ... maybe this is a vertical
> stacking up and down kind of situation where we're mining things deep from the underground and we're bringing them up
> to refine them and ultimately launch them, and that's where the upper launch goes ... The visual style of this is very
> important to me because if we don't get this right, it won't feel right for the user. And I want to make sure this is
> very clear in terms of what this is actually doing: we have ore coming out of the inbox and GitHub and Sentry, and that
> gets cascaded down and it goes up the track and then it goes into the assembler ... High fidelity work."

And the mockup brief that made Black Iron win (docs/art/black-iron/CONTRACT.md): dark, dirty, oily foundry, **a bit
brighter so you can see it on a phone**; **see the work actually move** — every handoff a visible motion, intentional and
satisfying, never "a bunch of moving shit"; items glow; **every machine has obvious IDLE / WORKING / BLOCKED states**
(blocked = needs a human decision: red/yellow caution, pinging, unmistakable); extreme fidelity and fine detail.

**The fidelity bar is the mockup itself.** Reference shots: `/mnt/project-files/shiptorio/shaft/ref/mock-*.png`
(line, deck, under, assembler, splitter, launch) and `/mnt/project-files/shiptorio/black-iron/mockup-match/`.
Source: `docs/art/black-iron/modules/*.js` (world, underside, belts, assembler, splitter, launch) and
`docs/art/black-iron/core.js`. Copy freely from those files — same kit, same palette, same density of detail.
Match it closely; a loose imitation is a fail. Justin hated the last rollout because it drifted from the mockup.

## The shaft (root frame: +x left→right on screen, +y up, +z toward the viewer; camera looks at the front, 30° down)
```
  LAUNCH  floor y 22  deck x -15..15, z -26.5..-15.5    merge gate (x -7) -> launch pad (x 5) -> rocket up into the sky
     ^ freight lift (left back, x -15.5 z -14.6)          orbit watch (x 12.4) on the right; sent-back drop on the far right
  CHECKS  floor y 11  deck x -18.5..18.5, z -15.5..-4.5  CI (right) -> researched checks -> verify bay -> AI review (left)
     ^ glass tubes up the wall (right end)                 red rework belt on the front lip runs right->left, drops at far left v
  BUILD   floor y 0   deck x -18.5..18.5, z -4.5..7.5    planner (x -12) -> assemblers (x 0 and 10, or 1-3 of them)
     ^ ore lift (far left, in front of the cliff, x -17.5 z 8.3)
  MINE    cliff face z 7.5 from y -16 up to the build slab (y -1.4); tunnel mouths in it (GITHUB, INBOX up top at y -7,
          SENTRY, POSTHOG lower at y -11.5); carts roll out onto ledges, tip into chutes that zig-zag down the cliff onto the
          collector belt on the quarry floor (y -16, z 7.5..11.5), which runs left into the ore lift.
```
Work zig-zags UP the shaft: up the ore lift on the left → right along the build floor → up the tubes on the right → left
along the checks floor → up the freight lift on the left → right along the launch floor → the rocket. Rejects ride the red
lip belt back left and drop to the planner. Every floor is set back (−z) from the one below, so the 30° camera sees all of
them; the front face of each floor's mass (z −4.5 for checks, z −15.5 for launch) is a **riser wall** you see above the
floor below it.

Decks: top at floor y + 0.1, slab 1.5 thick (to y − 1.4). Belts carry items at floor y + 1.0.

**Everything comes from `layout.js`**: `makeLayout(plan)` → `{ stations, paths, portOut, tiers, mines, sources }`.
The plan changes with the player's factory (1–3 assemblers; 2–11 checks: CI, up to 8 researched checks, verify, review;
which mines are connected; which power plants exist), so **read positions from ctx / M, never hard-code a station's x**.
Print the current table: `node -e "import('/home/user/shiptorio/web/src/map/shaft/layout.js').then(m=>console.log(JSON.stringify(m.makeLayout(m.defaultPlan()),null,1)))"`.

Default plan (what the harness shows): planner, assemblers `asm-1` (Claude Code, x 0) and `asm-2` (Codex, x 10); checks
`ci` (x 12.5), `chk-secrets` (researched, x 7.6), `verify` (x 2.7), `review` (x −6.8); `gate`, `pad`, `orbit`; mines
github, inbox, sentry, posthog; power: `steam` (−6, z −2.2), `dyn-1` (−0.4, z −3.6), `bat-1` (3.4, z −3.4), `dyn-2`
(9.6, z −3.6), `geo` (geothermal, on the quarry floor at 17.4, z 9.7).

## Files and ownership
```
web/src/map/shaft/core.js, layout.js, stage.ts, finish.ts, bake.ts, harness.ts, *.d.ts, CONTRACT.md   integrator only
web/src/map/shaft/modules/world.js      STRUCTURE agent  (IRON.world + IRON.look)
web/src/map/shaft/modules/mine.js       MINE agent       (IRON.underside, carriers 'cart' + 'cage')
web/src/map/shaft/modules/belts.js      CONVEYORS agent  (IRON.belts, carrier 'bucket')
web/src/map/shaft/modules/planner.js    MACHINES agent   (IRON.machine('planner'))
web/src/map/shaft/modules/assembler.js  MACHINES agent   (IRON.machine('assembler'))
web/src/map/shaft/modules/gauntlet.js   GAUNTLET agent   (machines 'ci', 'check', 'verify', 'review', 'gate')
web/src/map/shaft/modules/power.js      POWER agent      (machines 'steam', 'dynamo', 'battery', 'geothermal' + IRON.part('power'))
web/src/map/shaft/modules/launch.js     LAUNCH agent     (machines 'launch', 'orbit', 'measure')
```
Write ONLY your own module file(s). Never edit the integrator files or another agent's module. Don't commit, push, or
touch git. Don't run `bun run check`, the build, or start a second dev server. If you need a core/layout change, say
exactly what in your final report (the integrator applies it).

A module is an ES module whose default export installs itself:
```js
export default function install(IRON) {
  IRON.machine('assembler', function (K, M) { ... return { g, update(t, dt) {} }; });
}
```
Porting a mockup module = drop its IIFE wrapper, wrap it like this (the mockup modules use the name `IRON` already).

## Who builds what at the seams
- **Machines** build their own plinth, the intake TRAY at their `in` port and the outlet hardware at `pass` / `reject` /
  `out` ports. **CONVEYORS** builds belts up to (not into) them.
- The assembler's `out` port is the top of its dome: the assembler builds the brass tube fitting there; CONVEYORS builds
  the glass tube from it up the wall into the header.
- **MINE** builds the cliff, tunnels, cart ledges + rails + tippers, the chutes, the collector, the quarry floor and
  everything below it, and the ORE LIFT tower (collector → build deck). It owns carriers `cart` and `cage` (the freight
  lift uses `cage` too).
- **CONVEYORS** builds every path above the mine: ore belt (lift top → planner), plan belts (feed trunk + spurs, with
  diverters at the junctions), pneumatic tubes + header, CI feed, check lanes, reject chutes, the red rework lip belt,
  the rework drop (bucket lift) and return, the to-lift belt, the FREIGHT LIFT tower, the launch-floor belts, the
  sent-back belt/drop/return from the gate. Owns carrier `bucket`.
- **STRUCTURE** builds the decks (cobbled tops, slab faces, rims), the riser walls between floors (brick foundry walls,
  arched windows with furnace glow, pipes, gears, clocks, signage like the mockup's back wall), the framing that ties the
  floors into ONE building (columns, cross-bracing, ladders, stairs, catwalks), floor signs (MINE, PLAN + BUILD, CHECKS,
  LAUNCH), the skyline behind the top floor (chimneys, blast furnace, water tower), the airship, sky props, and
  IRON.look. Keeps clear of machine bays, paths, ports and lift columns (see "Keep clear").
- **POWER** builds the power plants and the cables/aether conduits from each plant to the machines it feeds
  (`ctx.stations[i].def.feeds`), with flowing pulses.
  Lines end in the machine's own power fitting, so these stay put unless power.js's `entryFor` moves with them:
  the assembler's aether socket (assembler.js `SOCK`: (0.35, 0.65, −2.1), face at z −2.35) and the planner's aether
  manifold (planner.js: group at (−2.05, 0, −2.05) turned π/4, stubs at x −0.3 / 0 / 0.3, y 0.32, tips at z −0.57).
  A machine without a fitting gets POWER's socket box at its back corner. The geothermal riser climbs the cliff's
  right edge at x 19.0: MINE keeps x ≥ 18.85 clear there, STRUCTURE keeps x > 18.1 clear along the build deck's
  right edge (z −4.5 to 6.9), where a geothermal line to a builder runs at x 18.3.
- Every module: keep out of other agents' areas; if two things meet (a belt into a tray, a tube onto a fitting, a cable
  onto a socket), make your half meet the coordinates exactly.

### Keep clear (other agents build here)
- Machine bays: a diamond |dx| + |dz| ≤ 3.25 around each big machine (planner, assembler, ci, verify, review, gate,
  launch), ≤ 2.0 around a researched check, radius ~2 around power plants.
- Paths: 0.7 either side of every path polyline in `ctx.pathList` (belts, tubes, chutes), lifts: 0.8 around the column.
- The front 1.2 of each deck is the walkway/lip (rework belt on the checks floor, sent-back belt on the launch floor).

## Coordinates and machine frames
Machines are built in their own **LOCAL** frame on a holder at the station's (x, y, z), rotated −45° about y, so a
machine is seen from its 45° corner: its **+x face (front-right) and +z face (front-left) face the camera**.
`M.toRoot(x, y, z)` converts local → root. Big machines: footprint ≤ ±2.5 local, plinth top ~0.4, keep ≤ ~7.5 tall
(the floor above starts 11 up and is set back). Researched checks: footprint ≤ ±1.4. Power plants: ≤ ±1.5.

### Ports (machine LOCAL [x, y, z]; `out` = local outward direction)
```
planner   in [-1.2,1,2.9] front-left face   pass [2.9,1,-0.9] front-right face (to the assemblers)   reject [-2.9,1,0.9] (unused)
assembler in [-0.5,1,2.9] front-left face   out  [-1.1,4.45,-1.1] dome top (pneumatic tube up)
ci / verify / review   in [2.9,1,0.6] front-right face (work arrives from the right)   pass [0.6,1,2.9] front-left face
                       reject [2.05,1,2.05] front corner (a chute drops it onto the rework lip belt)
check (researched)     in [1.5,1,0.3]   pass [0.3,1,1.5]   reject [1.05,1,1.05]
gate      in [-0.6,1,2.9] front-left face   pass [2.9,1,-0.6] front-right face (to the pad)   reject [2.05,1,2.05]
launch    in [-0.6,1,2.9] front-left face
```

### The paths (default plan; root coords; y is the surface the item sits on)
```
cart-<src>  rail  carrier 'cart'  out of the tunnel (core animates the emerge from TUNNEL_DEPTH 2.4 inside) a 0.9 roll to the tipper
chute-<src> chute speed 2.6  zig-zags down the cliff face (z 7.75) and drops onto the collector
collector   belt  [15,-15.5,8.3] -> [-17.5,-15.5,8.3]  (quarry floor, right to left)
lift        lift  carrier 'cage'  [-17.5,-15.5,8.3] -> [-17.5,1,8.3]   ORE LIFT
ore         belt  [-17.5,1,8.3] [-17.5,1,4.3] [-16.31,1,3.12] [-14.9,1,1.7] = planner.in
feed-0      belt  planner.pass [-9.31,1,1.91] [-8.18,1,3.05] [-6.63,1,4.6] [-4.81,1,4.6]  junction (diverter): asm-1's spur or on
spur-asm-1  belt  [-4.81,1,4.6] [-3.82,1,3.61] [-2.4,1,2.2] = asm-1.in
feed-1      belt  [-4.81,1,4.6] [5.19,1,4.6]  ->  spur-asm-2 [5.19,1,4.6] [6.18,1,3.61] [7.6,1,2.2] = asm-2.in
tube-asm-N  tube  smooth, from the dome top [x,4.45,-1.06] up and back into the header at y 8.2 z -3.6
header      tube  smooth  [-3,8.2,-3.6] along the riser wall -> [16.6,8.2,-3.6] climbs at x 17.4 up past the checks deck edge
                  and swoops back down onto [15.54,12,-6.11]
ci-feed     belt  [15.54,12,-6.11] -> [14.13,12,-7.53] = ci.in
lane-<st>   belt  st.pass -> next station's in (right to left), e.g. lane-ci [10.87,12,-7.53] [10.63,12,-7.28] [8.7,12,-7.28] [8.45,12,-7.53]
drop-<st>   chute st.reject -> [x,12.25,-5.9] -> onto the rework belt at [x,12,-5]
rework      belt  REWORK (red) [16.9,12,-5] -> [-17.4,12,-5] -> [-18,12,-3.9]   the front lip of the checks floor
rw-drop     lift  carrier 'bucket'  [-18,12,-3.9] -> [-18,1,-3.9]   (down the front of the riser wall, far left)
rw-in       belt  [-18,1,-3.9] [-18,1,-1.4] [-16.45,1,0.15] [-14.9,1,1.7] = planner.in (a junction with the ore belt)
to-lift     belt  review.pass [-8.43,12,-7.53] [-8.92,12,-7.03] [-15.5,12,-7.03] [-15.5,12,-14.6]
freight     lift  carrier 'cage'  [-15.5,12,-14.6] -> [-15.5,23,-14.6]   LAUNCH LIFT (against the launch floor's riser)
to-gate     belt  [-15.5,23,-14.6] [-15.5,23,-16] [-12.85,23,-16] [-10.61,23,-18.24] [-9.47,23,-19.37] = gate.in
to-pad      belt  gate.pass [-4.53,23,-19.37] [-3.82,23,-18.67] [1.82,23,-18.67] [2.53,23,-19.37] = pad.in
gate-reject belt  REWORK gate.reject [-7,23,-18.1] [-7,23,-15.9] [15.2,23,-15.9] [16,23,-15.1]   (launch floor front lip)
gate-drop   lift  carrier 'bucket'  [16,23,-15.1] -> [16,12,-15.1]   (beside the launch floor's right end)
gate-return belt  REWORK [16,12,-15.1] [17.9,12,-13.2] [17.9,12,-5.6] [16.9,12,-5] -> onto the rework belt
```
Paths with `rework: true` are the red loop. Path objects (`ctx.paths[name]`, `ctx.pathList`): `points` (smoothed for
tubes), `L`, `at(s, outVec3)` → segment with `yaw`/`pitch`, `items` (each with `.s`), `speed`, `flow` (0..1, eases to 0
when jammed), `jammed`, `kind`, `label`, `carrier`, `port`, `rework`, `ghost` (a mine that isn't connected yet), `mine`.
Belt textures scroll at `speed * flow` (match item speed so items don't slide); jam lights go red when `jammed`.

## Items (core-owned visuals)
`IRON.items`: `num`, `label()` → "#142", `title`, `src` ('github' | 'inbox' | 'sentry' | 'posthog'), `kind`, `attempts`,
`reason`, `stage`, `owner` (station id holding it), `dest` (the assembler it's routed to), `mesh` (origin = bottom center,
~0.5 big), `parts.halo`. Kinds: `issue` (ore lump, glowing crystals in the source color) → `cards` (bound punch cards: the
plan) → `capsule` (brass capsule, amber band: the PR) → `pass` (green band + check light) or `reject` (red band + scar tag).
`item.setKind(k)` swaps the look with a flash ring; `item.flash(color)` just flashes. `item.follow(obj, ox, oy, oz)` rides
an object (gripper, platform, rocket); the core moves it after your update. `item.place(v)`, `hide()`, `show()`.
Items held by a BLOCKED station blink amber/red automatically. Mine colors: github 0xffb040, inbox 0x5aa8ff, sentry
0xff4a3a, posthog 0xb88aff.

## Machine API — `IRON.machine(type, (K, M) => ({ g, update(t, dt) }))`
`g` is your LOCAL-frame group (the engine parents and rotates it). One call per instance (2 assemblers = 2 calls).
```
M.id M.type M.def M.harness M.tier     who you are: def = the plan entry ({ harness } for assemblers, { kind, check } for
                                       checks, { feeds, harness } for power plants)
M.waiting('in')        item sitting at your intake tray (or null)
M.take('in')           claim it — then position it every frame with item.follow(...)
M.give(item, port)     hand to an output path; false = path entry full or the real work isn't done → keep holding, retry
M.canGive(port)
M.ready(item)          false while the REAL work on this item is still running (see "Real time" below). give() checks it too.
M.judge(item)          checks + gate: { pass, reason } — or null while the real check is still running (ask again next frame)
M.pass(item) / M.reject(item, reason)  checks + gate: logs + counters (call after setKind / flash)
M.consume(item)        launch only: the PR shipped (removes it, SHIPPED++)
M.setState('IDLE'|'WORKING', detail)   detail shows in the chip, e.g. '#142 · punching cards'
M.blocked              true while a human decision is pending. FREEZE your cycle while true.
M.stateShown           'IDLE' | 'WORKING' | 'BLOCKED'
M.maybeDecision(text)  call at your natural decision point; may block (dice, harness only). true if it blocked.
M.decision(text)       force one
M.item                 the item the core thinks you hold (after take)
M.route(item)          planner: the assembler id this item goes to (set once; the plan-belt diverters follow item.dest)
M.last                 checks: true for the last check before the launch lift — it sets the green 'pass' band; the
                       others just flash green and keep the amber capsule
M.queue()              items waiting on your input belts
M.power()              power plants: { level 0..1, online }
M.toRoot(x,y,z) M.rootOf(obj) M.port(name) → { local, root, out }
K.caution(parent,x,y,z,scale) -> {update(t,dt,M.stateShown)}   hazard post: spinning beacon, "!" sign flips up, floor pings
K.statusLamp(parent,x,y,z,scale) -> {set(M.stateShown, t)}      green / amber / red stack
```
Every machine MUST: place one `K.caution` and one `K.statusLamp` where the camera sees them and drive them every frame;
set state/detail through the whole cycle; give BLOCKED its own unmistakable machine-specific look (alarm lamps, steam
venting, gauges redlined, arms frozen with the item, strobes); IDLE looks idle (slow, dim, waiting) and WORKING busy.
Never let an item teleport: every handoff is a visible motion.

### Real time (important)
In the game this world is driven by the REAL factory: an assembler really holds an issue for minutes while Claude Code
writes the PR, a check holds a PR while CI really runs. So: never finish a handoff on a timer alone. Loop a convincing
WORKING cycle (gears turning, cards punching, the dome bubbling) until `M.ready(item)` is true, then play the finish and
`M.give`. Checks keep scanning until `M.judge(item)` returns a verdict. If `M.give` returns false, hold and retry. The
harness's auto driver says ready/decided at once, so the cycle also has to look right at full speed. An item can vanish
(the real issue closed): then `give` returns true and nothing happens — just carry on.

## World / mine / belts / parts
```
IRON.world((K, root, scene, ctx) => ({ update(t, dt) }))   also call IRON.look({ sky, light, finish }) — STRUCTURE owns the look
IRON.underside((K, root, ctx) => ({ update(t, dt) }))      the mine (alias IRON.mine)
IRON.belts((K, root, ctx) => ({ update(t, dt) }))
IRON.part(name, (K, root, ctx) => ({ update(t, dt) }))     any other root-level builder (power lines)
IRON.carrier(name, (K, item) => object3D)   carrier drawn around an item while it rides that path; item origin = where it sits
IRON.on('spawn'|'take'|'give'|'kind'|'pass'|'reject'|'ship'|'decision'|'resolve'|'enter'|'carrierPick'|'carrierDrop'|'log', fn)
ctx: { I, layout, paths, pathList, stations (layout defs: id, type, tier, x, y, z, def), tiers, mines, sources, PORTS,
       portOut, toRootAt(st, x, y, z), C45, items }
```
`root` for a part is its own group (already in root space). 'spawn' gives `{ item, src, from, to, dur }` so the mine mouth
can light up as the cart rolls out.

## Kit (K)
Same as the mockup kit: `box cyl cone sph torus rock lathe tube group mesh mat(color, { e, ei, shine, spec, op, double,
map, depthWrite, flat }) glow(color, op, additive) canvasTex spawn keyframes lerp smooth clamp01 link rnd R bake caution
statusLamp signTex`, plus:
- **`K.dyn(obj)`** — marks an object that moves, rotates, scales, shows/hides or swaps geometry after build. **Required.**
  After build, every unmarked mesh is merged with the others sharing its material (per floor and per module), so an
  unmarked mover FREEZES. Material color/emissive changes are fine without marking (the merged mesh shares the material).
  Run the harness with `--verify` to list movers you forgot.
- `K.light(color, intensity, dist, x, y, z, parent)` — point lights are rationed (every one costs every lit pixel on a
  phone). Quota per module type, all instances share it: world 2, underside 3, belts 0, planner 1, assembler 2, verify 1,
  gate 1, launch 2, everything else 0. Extras silently become dummies. Prefer emissive / glow materials.
- `K.spawn(...)` particles: all drawn in two instanced draw calls; cap 1100 total — be frugal.
- Reuse materials (make a palette object once, like the mockup modules do) so static parts merge into few draw calls.

## Look + brightness (everyone)
Black Iron palette (oil-black iron, soot, rust, brass, copper, verdigris, brick, furnace orange, aether teal 0x7af0d8), with
albedos lifted ~25–40% vs the darkest diorama, strong value separation (dark grime next to readable mid-tones, bright
emissive accents). Must read on a phone at 1x. No pure-black mush. Grime = decals, oil sheen, rust streaks, soot gradients,
drips. Decor sits ~15% darker / less saturated than the line, so machines, belts and items stay the brightest things.
**Copy rule:** no "Spark" anywhere in the world (the planner is "PLANNER"); assemblers name their harness ("CLAUDE CODE",
"CODEX"); keep in-world text short and in the pixel style.

## Performance budget
The game runs on phones. After the static merge, with everything built: the BUILD view ≤ ~900 draw calls, the ALL view ≤
~1,500, ≤ ~1.2M triangles. Keep curved things at low segment counts (6–12), skip detail nobody can see from the camera
(backs of things facing −z, undersides), and mark only the parts that really move.

## Testing
A dev server runs at http://127.0.0.1:5173 (if it's down: `cd /home/user/shiptorio/web && (nohup bunx vite --port 5173
--host 127.0.0.1 --strictPort > /tmp/vite.log 2>&1 &)`). The harness page `shaft.html` runs the whole shaft on the auto
driver with whatever modules exist (missing ones are blockouts). Screenshot tool:
```
node /home/user/shiptorio/web/scripts/shaft-shot.mjs --base=http://127.0.0.1:5173 --out=/tmp/shaft-<you>/shot \
   --views=build,station:asm-1 [--warm=20] [--q=only=world,belts&asm=1] [--mobile] [--verify] [--hud=0] [--w=1440 --h=900]
```
Views: `stack` (ALL), `mine`, `build`, `checks`, `launch`, `line` (build + mine), `follow`, `station:<id>`. Query:
`only=`/`skip=` modules, `asm=1|2|3`, `checks=ci,custom:secrets,custom:types,verify,review`, `sources=github,sentry`, `measure=1`.
It prints draw calls, triangles, module failures, console errors and the line's stats (shipped / rework counts prove items
flow end to end). Use your OWN output folder. Look at your screenshots next to the mockup refs and iterate many times:
build → shoot → compare → refine. Shoot at least desktop 1440×900 and phone (`--mobile`), and with `--verify`.
Other agents are building at the same time; their modules may be missing or half done — use `only=` to isolate yourself.

## Done means
Your area matches the mockup's fidelity and style in side-by-side shots; every state reads; items never teleport; `--verify`
reports nothing of yours; no console errors from your module; it works for every plan size (try asm=1 and asm=3, and
checks with 1 and 4 researched checks); draw calls within budget. Final report: what you built, screenshot paths (desktop +
phone + a close-up), draw calls, anything you need from the integrator.
