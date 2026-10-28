# Build as you go: the contract

Justin (2026-10-27 20:06): the dimmed tour look becomes how the game starts. Camera parked, nothing exists until you
build it, each build takes 5 to 8 seconds, crackles with electricity when it comes online and stamps itself done, while a
real first issue rides through. Plan: https://claude.ai/artifact/T6puBBYVnZiFaBiqephirN (copy in project files,
`shiptorio/buildout/plan.html`). Everything is behind `?buildout=1` (`buildoutOn()` in `web/src/flags.ts`).

Ten slices build it in parallel. Read this file and `journey.ts` before writing code. **Keep the signatures here.** If you
need one changed, say so to the slice that owns it; don't edit another slice's file.

## The journey (`journey.ts`, slice 1)

`STEPS`: 8 builds in order. Each has `id`, `trigger` (hold, tap, continue, auto), `action` (button text), `line` /
`repoLine` (coach line, demo shop / own repo; `lineFor(step, repo)`), `reveals` (pieces that rise), `camera` (where it
parks), `lights` (floor that lights when it finishes) and `done(state)`.

| # | id | trigger | reveals | done when |
|---|---|---|---|---|
| 1 | `tunnel` | hold "Pry the planks off" | github mine (cart rail, chute), collector, ore lift | github source connected, or a github issue exists |
| 2 | `boiler` | hold "Light it" | the power plant feeding the first assembler | any power source online |
| 3 | `builder` | tap "Build it" | first assembler (spur, tube), ore belt | an assembler machine exists |
| 4 | `issue` | hold "Re-rail the cart" | nothing new; the cart rolls out with ore | any item exists |
| 5 | `planner` | continue "Approve the plan" | planner | an item is working or later (or has attempts) |
| 6 | `build` | auto | nothing new; the cart rides into the builder | an item has a PR (or is inspecting or later) |
| 7 | `checks` | auto (when the PR opens) | tube header, CI | CI reported on an item |
| 8 | `launch` | hold "Launch" (the big red button) | freight lift, merge gate, pad | a rocket shipped |
| | `look` | continue "Look around" | free camera, the two counters | (after all 8) |

`stepFrom(state) -> { id, index, step, built }`: the step you're on, read off real factory state. A later step done
counts every earlier one as done, so a returning factory never lands back on step 1. `id` is `"look"` (index 8) once all
eight are built.

`resolve(pieces, layout) -> { mines, stations, paths }` turns pieces into the layout's ids (never hard-code an x or an id
that moves with the plan). `cameraFor(step, layout)` gives director.ts its target (`"mine:github"`, `"asm-1"`, ...).

`STARTER_ISSUE`: the demo shop's scripted #1 and the starter issue (label `shiptorio-starter`) filed on a real repo only
when the player taps.

## One build moment (`BUILD_MS`, `phaseAt(ms)`)

About 7 s, the same for every piece now and every unlock later:

| phase | ms | what |
|---|---|---|
| `chalk` | 0 - 500 | the chalk outline and stakes on the deck glow |
| `construct` | 500 - 4500 | `construct.ts`: scaffold rises, real parts drop in bottom up, rivet sparks, steam |
| `burst` | 4500 - 5500 | `burst.ts`: arc down the cable, blue-white crackle, lamps snap on |
| `payoff` | 5500 - 7000 | brass ONLINE plate (`BuildStamp.tsx`), thunk, bell, one line |
| `done` | 7000+ | |

Tap speeds up chalk and construct (`run.finish()`); the payoff always plays. Real waits stay real: step 6 shows the bar
and lets you leave, no fake speed-up.

## The `shiptorio:build` event

`BUILD_EVENT = "shiptorio:build"` on `window`, detail `BuildDetail { id, phase: "start" | "burst" | "done", first? }`.
`first` is true the first time that kind of piece bursts online. Fire with `emitBuild(detail)`, listen with
`onBuild(fn)` (returns the remover). The scene (slice 2) fires it; sound (9), card (6) and tests (10) listen.

## Stub signatures (slice 1 lands no-op versions; the owner fills them in)

- `web/src/map/shaft/construct.ts` (slice 3): `construct(target: Object3D, opts?: { reduced?, seconds?, speed? }):
  ConstructRun` with `update(dt): boolean` (true once finished), `finish()`, `cancel()` (restore as-is), `done: Promise`,
  `progress` 0-1. The caller ticks `update` from its frame loop so `?raf=0` works. Works best on the live, un-baked
  group: slice 2 keeps unbuilt stations out of the bake (`userData.noBake`) until construct finishes.
- `web/src/map/shaft/burst.ts` (slice 4): `burst(target, opts?: { first?, reduced?, from?: Vector3 }): BurstRun`, same
  run shape as construct.
- `web/src/map/shaft/director.ts` (slice 5): `class Director(stage, layout, opts?: { reduceMotion? })` with
  `park(target: CamTarget, { snap? })` (1 s swoop then a gentle drift), `step(t, dt)` (every frame, before
  `stage.camStep`), `locked` (true until `unlock()`; the scene ignores drag, zoom and hover labels while locked),
  `unlock()` (first rocket), `setLayout(layout)`. `CamTarget = string | string[]`.
- `web/src/sound/build.ts` (slice 9): `installBuildSound(): () => void`, listens for the event, returns the remover.
  Slice 6 calls it once behind the flag.

## DOM hooks (slice 6 renders them, slice 10 tests them)

- A root element with `data-buildout` and `data-step="<id>"`. The step shown is the first step whose build hasn't fired
  `done` yet, never ahead of `stepFrom(state).id`: the sim and a real factory can run ahead of the art (the guided issue
  can reach the pad while the planner is still rising), and the card waits for the scene so every build plays in order.
  Steps that reveal nothing (`issue`, `build`) count as built as soon as `stepFrom` passes them.
- `data-phase="chalk|construct|burst|payoff|done"` while a build plays, driven by the scene's `shiptorio:build` events
  (start, then `phaseAt` from that moment until `burst`; `burst`; `done`), never by the card's own clock. Builds advance on frames using real elapsed time, independently of the movement physics clamp, so reduced-motion fades do not stretch on low-frame-rate devices.
- The coach card: `role="region"`, accessible name "Build", attribute `data-buildout-card`. Its main action button carries
  `data-buildout-action="<trigger>"` (`hold`, `tap` or `continue`). Later on the left, Continue on the right.
- Slice 6 also mounts `<BuildStamp />` (slice 4) next to the card, behind the flag.

## Demo shop vs your own repo

`station_action("buildout", step)` is sim-only (slice 7); the live server has no handler and must not get one for
pretend builds. On a real repo every step completes from real state: the tunnel when you pick the repo, the boiler when
your runner pairs, the builder when its assembler appears, the issue when the picked or starter issue arrives, and
the launch through `launch_pr` (the in-game Launch is the only merge path, never a link out to GitHub).

## Slices and the files they own

| # | slice | owns |
|---|---|---|
| 1 | contract | `web/src/buildout/journey.ts`, this file, the four stubs (first version only), `web/src/flags.ts` (buildoutOn), `docs/VISION.md` / `docs/GAMEPLAY-PICKS.md` lines, `web/test/buildout-journey.test.ts` |
| 2 | hide until built, wire it up | `web/src/map/shaft/buildout.ts`, `ShaftScene.ts`, `firstRun.ts`, `web/src/map/FactoryMap.tsx` |
| 3 | construct animation | `web/src/map/shaft/construct.ts`, `web/construct.html`, `web/test/construct.test.ts` |
| 4 | burst + ONLINE plate | `web/src/map/shaft/burst.ts`, `web/src/ui/BuildStamp.tsx`, `web/src/ui/buildstamp.css` |
| 5 | camera director | `web/src/map/shaft/director.ts`, `web/test/director.test.ts` |
| 6 | coach card | `web/src/ui/Buildout.tsx`, `web/src/ui/buildout.css`, `web/src/App.tsx` (the only edit: mount behind the flag) |
| 7 | demo shop scenario | `web/src/sim/engine.ts` (scenario `buildout`), `web/test/sim-buildout.test.ts` |
| 8 | first real issue | `server/src/starterIssue.ts`, its route, `server/test/starter-issue.test.ts` |
| 9 | build sound | `web/src/sound/build.ts`, `web/test/build-sound.test.ts` (leave `engine.ts` alone, #350) |
| 10 | end to end | `tests/e2e/buildout.pw.ts`, `scripts/shots/buildout.mjs` (`?buildout=1&source=sim&scenario=buildout`) |

Rules that carry over: no silhouettes (unbuilt means gone; only the next site gets a chalk outline), real game art only,
builds are big moments so they always sound, but ticks inside one go through the calm limits.
