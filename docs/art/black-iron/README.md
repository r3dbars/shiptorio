# Black Iron line (source)

The chosen art direction (Justin, Oct 26): the "Black Iron" Cogworks foundry, rebuilt as a real, readable
production line. Built page: `docs/black-iron.html` (served at `/art/black-iron.html`).

Work items are simulated, not decoration: an issue is mined under the island (Sentry / GitHub / Inbox mines),
rides a cart and the ore lift, the clockwork assembler's arm puts it on the punch machine (→ punch cards), a claw
loads the clockwork engine which sucks it up the pneumatic tube (→ PR capsule), the Aether Splitter (Spark)
reviews it, passes ride to the launch pad (crane load → tesla coils → countdown → liftoff = shipped) and rejects
climb the high rework line back to the assembler. Any machine can block on a human decision (caution beacon,
"NEEDS YOU" chip with RESOLVE). 1x pixels by default; FOLLOW WORK camera tracks one item end to end.

## Layout
- `core.js` — the line: kit, ports + paths contract, items, stations/decision API, fallback machines. Integrator-owned.
- `template.html` — renderer, pixel pass, camera presets (LINE / DECK / UNDERSIDE / FOLLOW), HUD chips, ticker.
- `modules/` — `world`, `underside`, `belts`, `assembler`, `splitter`, `launch` (one owner each; see CONTRACT.md).
- `CONTRACT.md` — coordinates, paths, ports, machine API, look rules. Read before changing a module.
- `tools/` — headless checks (need `playwright`): `shot.js` (views, fast-forward, frame sequences, contact sheets),
  `simcheck.js` (flow counters over simulated time), `perf.js`, `meshcount.js`.

## Build
```sh
node docs/art/black-iron/build.js --out=../../black-iron.html     # inlines core + modules into docs/black-iron.html
node docs/art/black-iron/tools/shot.js docs/black-iron.html bi --view=line,deck,under --warm=40   # writes ./shots/
```
