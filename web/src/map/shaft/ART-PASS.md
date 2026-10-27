# THE FLOATING CITY — art pass contract

Justin (2026-10-27 20:15): the background should feel **infinite**, the factory **floating amid a cityscape**; the
island is **not all built at the start**; the **bottom of the island looks way better**; **new floors get constructed**
as the factory is built out. Plan: https://claude.ai/artifact/2dUp7aMyMaXHRcBCwjpCD5. Ten slices; this file is what
every one of them reads after `CONTRACT.md` (that file's rules all still hold: kit, `K.dyn`, light quota, palette,
budgets, testing).

## Flags
- **`?artpass=1`**: installs the new art (`artPass()` in `backdrop-kit.js`). Off (the default): the old city + haze
  (`modules/city-old.js`, called from world.js) and the old keel (`modules/keel-old.js`, called from mine.js) build
  exactly as before. Every new module starts with `if (!artPass()) return { update() {} };` (or skips its
  `IRON.part` call), so the flag off changes **nothing**.
- **`?buildout=1`**: floor growth (`modules/growth.js`, slice 10). Without it every floor stands from the start.
- Modules are found by the glob `./modules/*.js` and installed through their **default export**. A helper file in
  `modules/` without a default export (city-old.js, keel-old.js) is skipped by the loader.

## Files
```
backdrop-kit.js       artPass(), buildout(), backdrop(I, root) -> { follow, dim, calm }, ORDER, Z     slice 1
keel-shape.js         the rock's shape: radius(y), front(y), TIP, SOCKET, BANDS, CRACKS, LIPS, SMOG_TOP slice 1
floors.ts             FLOOR_IDS, FLOORS, floorAtY, STEP_FLOOR, floorsFor, floorToBuild, FloorRun        slice 1
floorbuild.ts         buildFloor(I, id, opts) -> FloorRun   (stub; slice 9 animates it)                 slice 1 / 9
bake.ts               userData.floor-aware merge + I.floorParts(id)                                    slice 1
modules/city-old.js   the old side city + haze (verbatim from world.js), flag off only                 slice 1
modules/keel-old.js   the old keel (verbatim from mine.js), flag off only                              slice 1
modules/skyline.js    IRON.part('skyline')   endless wrapped skyline bands                             slice 2
modules/smog.js       IRON.part('smog')      smog sea far below                                        slice 3
modules/flotilla.js   IRON.part('flotilla')  far floating foundries + a lane of lights                 slice 4
modules/keel.js       IRON.part('keel')      the new rock underside                                    slice 5
modules/engine.js     IRON.part('engine')    the aether engine at the tip (1 light)                    slice 6
modules/falls.js      IRON.part('falls')     falls, chains, rubble, tip mist                           slice 7
modules/world.js      every section tagged userData.floor                                              slice 8
modules/growth.js     IRON.part('growth')    floors rise with the build-as-you-go run                  slice 10
```
Never touch the Build As You Go files (buildout.ts, construct.ts, burst.ts, director.ts, ShaftScene.ts, firstRun.ts,
FactoryMap.tsx) or clog.ts.

## The camera and fake depth (backdrop-kit.js)
The shaft camera is **orthographic** (stage.ts: yaw/tilt fixed, 30° down, it only pans and zooms). Nothing shrinks or
slows with distance on its own, so depth is faked:
- `const B = backdrop(ctx.I, root)` once per part. stage.ts emits `'camera'` on the Iron every frame after the camera is
  placed and before the render; the kit does its work then, so nothing lags a frame.
- `B.follow(obj, factor, opts)`: obj follows the camera by `factor` of each pan (0 = stays in the world, 1 = stays on
  screen). Far = high factor. Skyline 0.92 / 0.8 / 0.62, flotilla 0.5–0.7, smog 0.4–0.7.
  `opts.wrap = texture` (RepeatWrapping) + `opts.span` (world units per repeat): the mesh rides the camera all the way
  across (so it **never ends**) and the texture scrolls by `(1 - factor)` of the pan. Make wrapped bands wider than the
  widest view (the ALL view on a 21:9 screen is ~200 wide; use 400).
  `opts.zoom` 0..1: how much obj keeps its screen size when the player zooms (`vh0` default 62, the ALL view).
  follow marks obj `dyn` and turns off frustum culling.
- `B.dim(materials, floor = 0.25)`: color (and emissive) × `scene.backgroundIntensity`, never below `floor`. The
  bottleneck veil (#389) darkens the sky with it ("users" = dark sky); the backdrop goes dark with it.
- `B.calm()`: reduced motion or the game's calm mode. Then **hold still** (drift, bob and spin stop; follow still runs).
- Calm everywhere: slow motion only (a full drift cycle ≥ 20 s, bob ≤ 0.15 / s), no new sounds, no flashing.

## Layers, z bands, render order (root space)
Far to near. All backdrop draws **before** the bottleneck veil (z −33.5, renderOrder −1) and the shaft (renderOrder 0).
```
layer            z (root)        renderOrder   factor      what
sky              scene.background     -        -           IRON.look sky gradient (unchanged)
skyline far      -95             -30           0.92        palest band, mostly haze               (skyline.js)
skyline mid      -80             -26           0.80                                               (skyline.js)
skyline near     -64             -22           0.62        old landmarks become this near ring    (skyline.js)
flotilla         -56 .. -40      -18           0.5..0.7    floating foundries, light lane          (flotilla.js)
smog             -60 .. -36      -14           0.4..0.7    below SMOG_TOP (-46), melts into skyline (smog.js)
haze             -34.5           -10           -           a thin wash in front of the backdrop     (any, optional)
--- bottleneck veil -33.5 (-1) ---
the shaft        -26.5 .. 11.5    0            0           floors, keel, engine, falls (world-fixed)
```
`ORDER` and `Z` in backdrop-kit.js hold these numbers. Transparent backdrop layers set `depthWrite: false`,
`fog: false`, and their renderOrder (non-zero renderOrder also keeps them out of the bake, which is right: they move).

## Budgets
- ALL view (`stack`) ≤ **1,500** draw calls with the flag on (1,331 on main, 2026-10-27).
- Backdrop total (skyline + smog + flotilla + haze) ≤ **18** draw calls, **0** lights, ≤ **3** full-screen transparent
  layers. Skyline ≤ 6, smog ≤ 4, flotilla ≤ 8.
- Underside total (keel + engine + falls) ≤ **62** calls, **1** light (the engine's: `LIGHT_QUOTA.engine = 1`, the
  scene cap is 13), ≤ **150k** tris, ≤ **120** particles. Keel ≤ 40 calls / 80k tris after the bake, engine ≤ 12,
  falls ≤ 10.
- Shoot desktop 1440×900 and phone (`--mobile`), `--verify` clean, `--q=artpass=1` for the flag on.

## Keel profile (keel-shape.js)
```
y  -16.3  TOP      half-width 19.5   front z 11.4   (under the quarry floor: tiers.mine y -16, x -19.5..19.5, z ..11.5)
   BANDS  -18.4 -21.2 -24.4 -28 -32  strata cuts; each band steps back (-z) as it narrows
y  -36    TIP_Y    half-width 1.6    front z 4.6    blunt tip, center x CX 0.4
TIP     [0.4, -36, 3.0]      the tip's bottom center
SOCKET  [0.4, -37.2, 3.0]    the aether engine's cage top hangs here
CRACKS  [{ at, dir, len }]   7 cracks on the front faces (teal veins: engine.js; dark seams: keel.js)
LIPS    [{ at, side, kind }] 2 water lips (left, right) + 1 slag lip (front) for falls.js
SMOG_TOP -46                 the smog sea's top
```
`radius(y)` (half-width), `front(y)` (front face z), `inside(x, y)`, `profile(n)` → `[y, r, z]` samples. The old keel
went down to about y −33; the new rock reaches −36 and the engine + beam to ~−44, so with the flag on the ALL view
(frame.ts) frames down to about −45.

## Floors (floors.ts, bake.ts)
```
id      deck y   root y band      at the start of a first run
mine    -16      below -6         always there (rock, quarry, mine cliff, the boarded tunnel)
build     0      -6 .. 6          rises after the tunnel   (journey step "boiler" sits on it)
checks   11       6 .. 17         rises after "build"      (step "checks")
launch   22      17 and up        rises after "checks"     (step "launch")
```
- Tag a section with `userData.floor = '<id>'` on its group (or on a mesh). Children inherit it. bake.ts merges each
  floor separately and the merged mesh keeps `userData.floor`; a tagged mover (`K.dyn`) belongs to its floor whole.
- After the bake, `I.floorParts(id)` → the top-most objects of that floor (merged meshes + tagged groups/movers).
  Hide a floor: `for (const o of I.floorParts(id)) o.visible = false`. Machines and paths are not floors: growth.js
  leaves them to Build As You Go (construct.ts).
- `STEP_FLOOR[step]`: the floor a journey step's site sits on. `floorsFor(next)`: what stands when the player is on
  step `next` (`'look'`/null = all). `floorToBuild(prev, next)`: the floor to raise before `next` plays, or null.
- `buildFloor(I, id, opts)` → `FloorRun` `{ update(dt) → done?, finish(), cancel(), done: Promise, progress }`, the
  same shape as construct.ts. ~6 s; reduced motion 1 s fade. Dev page: `web/floorbuild.html?floor=checks` (`&at=3.2` holds
  a moment for shots). Its props (crane, girders, scaffold, welders) are one `floorbuild:<id>` group, 18 draw calls, gone
  at the end.

## Light + look
Black Iron palette as CONTRACT.md. Backdrop sits ~15–30% darker and less saturated than the island, cooler with
distance (toward the sky's haze color), lit windows the only warm specks. The island stays the brightest thing; the
aether engine (teal 0x7af0d8) is the brightest thing under it.
