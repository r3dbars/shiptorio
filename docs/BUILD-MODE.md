# Build mode (spec)

> Justin, 2026-10-27: "a system where people can build themselves, kind of like Roller Coaster Tycoon or
> Factorio, where they can add on and redesign things. They don't need to do this, it's an advanced thing.
> Focus on the building blocks of this game, what each piece does, and how it connects with the rails."

Build mode is the optional, advanced way to play. The default factory runs fine without it: Spark lays out
a starter line and the check-in deck is the game. Build mode lets a player pick up any piece of that line,
move it, rotate it, add more, and rewire the belts and rails, and **every change they make is a real change
to how their repo ships** (which agents build what, which checks run in which order, how much work can pile
up where). It's not a level editor bolted onto a picture. The layout *is* the pipeline config.

Status: spec, **parked until after Nov 4** (plan lock, PR #264). Built later in phases by the Codex pack `shiptorio/codex-prompts/build-mode.md` (project files),
which starts only after the deadline and once the vertical shaft map is on main.

Builds on:
- **Art:** Black Iron (`docs/art/IRON-STYLE.md`, mockup `docs/art/black-iron/`, its `CONTRACT.md` for ports,
  paths, carriers and the IDLE / WORKING / BLOCKED machine API). Every piece in build mode is the same mesh
  the live map draws. No new art style, no placeholder boxes.
- **Map:** the vertical mine-to-launch shaft (thread "Rebuild the map as a vertical mine-to-launch factory",
  `?world=shaft`). Its hand-tuned layout becomes the **default blueprint** below.
- **Model:** `shared/src/model.ts` (`Machine`, `Belt`, `Station`, `PowerSource`, `Harness`), the gauntlet
  (`server/src/gauntlet.ts`), research checks (`shared/src/research.ts`), permits (`server/src/permits.ts`).

---

## 1. The idea in one picture

```
 launch      [merge gate]══►[launch pad]   (orbit mast beside the pad)
                       ▲ tube
 checks       ═►[CI]══►[verify]══►[AI review]══►      fails ─┐
                 ▲ tube                                      │ rework high line
 build        [planner]══►[splitter]══►[assembler ×N]      │
                 ▲ ore lift      ▲ rework drop ◄─────────────┘
                 │          power wall: [solar][solar][geo][steam] ~~aether conduits~~►
 mine         ═rail═[GitHub]═[Sentry]═[PostHog]═[Inbox]═
```

Ore comes up from the mine, Spark plans it, assemblers build PRs, tubes shoot PRs up through the checks,
fails drop back down the rework line to the planner, passes ride up to the merge gate and the pad.
Build mode lets you change **everything between the mine mouths and the pad**, inside safety rules (§6).

---

## 2. The building blocks

Every piece has: what it is on the map, what it does for real, its ports, its footprint, where it may go,
and what the player can configure. Footprints are in grid cells (§4). Ports are listed for rotation 0
(facing the camera's front-left, `+z`); rotating turns the ports with the piece.

Port kinds: **ore** (raw signal), **plan** (punched cards: a triaged, planned task), **pr** (a brass PR
capsule), **pass** / **reject** (judged PR), **power** (aether). A link may only join an output to an input
of the same kind. Rework links are the exception: they carry `reject` back into the planner's `in` tray,
which is a junction for fresh ore and rework (like the mockup's assembler tray).

### 2.1 Sources (the mine)

| Piece | On the map | Real thing | Ports | Size | Config |
| --- | --- | --- | --- | --- | --- |
| **Mine mouth** | Tunnel in the cliff face under the foundry, colored by source (GitHub amber, Sentry red, Inbox blue, PostHog purple), carts roll out | One connected `SourceKind` (`github`, `sentry`, `posthog`, `email`) plus its intake filter | out: `ore` | a fixed tunnel slot in the cliff (two rows, `MINES`) | Source (must be connected, else it's a dark ghost with a "connect" button); filter: GitHub labels / milestone, Sentry min level and environment, PostHog funnel steps, Inbox kinds (bug, feature, question) |
| **Lint seam** (unlocks with research) | A dull grey vein in the rock | The repo-health ore source (`OreSource: "lint"`) | out: `ore` | a free cliff slot | Which rules count as ore |

Mines don't generate work by being placed. Connecting the source makes the mine; placing it decides
**where its carts go**. A disconnected mine is a ghost with a one-tap connect.

### 2.2 Transport (the rails and belts)

Transport pieces have no logic of their own except **capacity** and an optional **filter**. They are the
graph edges. All of them show items moving and **back up visibly when the thing at the end is jammed**:
that backlog is the bottleneck you're supposed to see.

| Piece | On the map | Real thing | Where | Notes |
| --- | --- | --- | --- | --- |
| **Rail** | Mine-cart track, chutes down the cliff | Edge carrying `ore` | mine only | Drawn tile by tile. Junctions merge. Carriers: `cart` |
| **Ore lift** (trunk) | Cage lift at the left of the cliff | Vertical `ore` edge mine → build | fixed in v1 | Capacity = how many ore chunks can wait for triage (an intake WIP cap) |
| **Belt** | Conveyor with scrolling slats | Edge for `plan`, `pr`, `pass` on one tier | build, checks, launch | Optional **filter** by item kind (bug / feature / cleanup / tests): a typed belt (`Belt.carries` today) |
| **Pneumatic tube** (trunk header) | Glass tube up the wall, capsule whooshes through | Vertical `pr` edge build → checks; freight lift checks → launch | fixed header in v1; each assembler's own tube joins it | The branch becomes a PR on GitHub when the capsule enters the tube |
| **Rework line** (trunk) | Reject chutes onto the front lip of the checks tier, bucket drop at the far left, belt back to the planner | Edge from any `reject` port back to the planner's `in` | fixed in v1; each station's chute joins it | Required: every reject output must reach a planner (§6). Carries the scar tag |
| **Aether conduit** | Teal cable with travelling pulses | `power` edge from a plant to a machine | Any floor, along walls and floors | Pulses only while the machine draws power; dark when the plant is offline or out of credit |

### 2.3 Planning and routing (build tier)

| Piece | On the map | Real thing | Ports | Size | Config |
| --- | --- | --- | --- | --- | --- |
| **Planner** (Spark; player copy says "Planner") | The difference-engine that reads ore and punches a card | Spark triage + plan (`think("triage")`, plan comment). Never writes code | in: `ore` + rework (one tray, it's a junction); out: `plan`; out: `reject` ("won't build": duplicates, spam, needs you) | 3×3 | Which mines feed it (by link); at most **one planner per factory in v1** (it's the brain; a second one is a later research unlock) |
| **Splitter** | The aether splitter with a brass flap | A **deterministic routing rule**, no model call. Sends a plan out of A if it matches, else out of B | in: `plan`; out A: `plan`, out B: `plan` | 2×2 | Match on: kind, district (folder), size (files estimate), source, paying customer. Splitters chain into a decision tree |
| **Buffer chest** (unlock) | Riveted iron crate with a counter | A **WIP limit**: holds up to N items, stops upstream when full | in, out: same kind | 1×1 | Capacity 1–20. Put one before an assembler to cap how many plans queue for it |

Splitter is the new meaning of the existing `MachineType: "splitter"`. Today `splitter-1` is where Spark
triages; in build mode that job is the **Planner**, and splitters are the cheap rule-based routers that
come after it. Migration keeps `splitter-1`'s id on the planner piece (§7).

### 2.4 Building (build tier)

| Piece | On the map | Real thing | Ports | Size | Config |
| --- | --- | --- | --- | --- | --- |
| **Assembler** | Clockwork assembler; arm grabs the cards, the dome turns them into a capsule | A runner job slot on the player's agent (`Harness`: Claude Code, Codex, Cursor, Grok, local) | in: `plan`; out: `pr`; power in | 3×3 | Harness (limited to harnesses the runner reported); district affinity (optional); tier later |
| **Power plant** | Dynamo + battery behind its assembler (Claude / ChatGPT sign-in), geothermal on the quarry floor (local model), Spark's steam boiler beside the planner | A `PowerSource`: one sign-in or endpoint | out: `power` (several conduits) | 2×2, build tier (geothermal: mine floor) | None; it's the sign-in. Its level is credit headroom |

Rules that make it real:
- An assembler with no conduit to an online plant whose kind matches its harness is **dark** and gets no
  jobs (matches `pickAssembler` today, which requires power, an inbound belt from a splitter and an outbound
  belt to an inspector).
- **Number of assemblers = max parallel jobs** for that harness. Each plant has slots (v1: 2 per sign-in,
  1 per geothermal) so you can't place 40 Codex assemblers on one login.
- Steam (Spark) powers only the planner. It can't power an assembler (Spark never writes code).

### 2.5 The gauntlet (checks tier) and launch (launch tier)

| Piece | On the map | Real thing | Ports | Size | Config |
| --- | --- | --- | --- | --- | --- |
| **CI inspector** | Inspector booth with a lamp stack | Current-head CI checks (`gate: "ci"`) | in: `pr`; out: `pass`, `reject` | 3×3 | None |
| **Verify bay** | Hydraulic press that slams on FAIL | Proof: repro before, gone after (`gate: "verify"`) | in, pass, reject | 3×3 | None; a second bay = 2 PRs proved at once |
| **AI review** | Aether lens with a different-model judge | Independent review by a different model (`gate: "ai"`) | in, pass, reject | 3×3 | None |
| **Research check** | Tinted inspector per tech (`buildCheck(id)`) | A researched check from `TECHS` (`check:<tech>` station) | in, pass, reject | 2×2 | Which districts it applies to |
| **Measure station** | Gauge tower | Growth experiments (`StationKind: "measure"`) | in, pass, reject | 2×2 | Funnel step |
| **Merge gate** | Amber caution gate on the launch tier | Human approval or a district launch permit (`gate: "human"`) | in: `pass`; out: `pass` | 3×2 | None; always last before the pad |
| **Launch pad** | Pad, gantry, tesla coils, rocket | Merge to the base branch | in: `pass` | 4×4, launch only | None; exactly one per factory |
| **Orbit mast** | Watch mast beside the pad | 24h orbit watch (`server/src/orbit.ts`) | out: `reject` (regressions ride rework) | 1×1, adjacent to the pad | None |

A station placed **twice** (two verify bays side by side on a split belt) means that check runs with
concurrency 2. A station placed on a **filtered branch** of the line (after a splitter that only lets
`web/` through) means it runs only for that district: that's how a player builds stricter lines for risky
folders, which is exactly what launch permits need.

### 2.6 Not functional (later)

Catwalks, lamps, signs, paint, skins, the airship. Cosmetic, never change config, unlocked by progression.
Not in the first pack.

---

## 3. How items move through ports

- An item leaves a piece only through an **output port** onto a link that starts there, and enters only at
  an **input port**. Ports sit on a cell edge with a facing direction; a belt connects when its end tile is
  the cell outside the port and points into it. Vertical connectors (lift, tube, drop) connect at the cell
  they occupy on each floor they touch.
- **Merges** are free: two belts into one tile merge (round robin). **Splits** happen only at a splitter or
  at a station with two outputs (pass / reject). A belt can't fork by itself. Two parallel stations are fed
  by a splitter whose rule is `round_robin`.
- Every input queue is visible: items stop at the end of a belt when the piece is busy or BLOCKED and pile
  back along it. Capacity per link = its tile count (one item per tile, matches the mockup's ≥0.85 spacing).

---

## 4. The grid

The shaft is four **tiers** stacked bottom to top, each set back in `-z` so the camera sees them all. Their
bounds live in the shaft's layout contract, `web/src/map/shaft/layout.js` (`TIERS`, `MINES`, `PORTS`,
`makeLayout(plan)`). Build mode reads them from there; it never copies numbers, because they still move
while the art lands. Floor ids in build mode are the `TIERS` keys.

| Floor | id (`TIERS` key) | Allowed pieces |
| --- | --- | --- |
| Mine (quarry floor at the cliff's foot) | `mine` | mine mouths (fixed slots in the cliff face, two rows, from `MINES`), lint seam, geothermal plant, ore collector + ore lift (trunk) |
| Plan and build | `build` | planner, splitters, buffers, assemblers, power (steam beside the planner, dynamo + battery per sign-in behind assemblers), belts, conduits |
| Checks | `checks` | CI, verify, AI review, research checks, measure, belts. Flows right to left |
| Launch | `launch` | merge gate, launch pad, orbit mast, belts |

- **Cells:** each tier's deck (`x0..x1`, `z0..z1`) is cut into square cells of 1.25 world units, so a 3×3
  machine is ~3.75 across, close to the mockup's ≤5×5 machine footprint with room for trays and ports.
  `grid.ts` exposes `cellToWorld(floor, col, row)` and `worldToCell(floor, point)` built from `TIERS`.
- **Trunks are fixed in v1.** The shaft already draws the vertical infrastructure from the layout: the ore
  collector and ore lift, the glass tube header up the wall, the rework lip and drop, and the launch
  freight lift and gate drop. In v1 the player doesn't move those; their ends are **trunk ports** that the
  player's belts connect to on each tier (an assembler's tube joins the header, a station's reject chute
  joins the rework lip). Player-drawn trunks come later. That keeps every vertical hop looking as hand-made
  as the mockup.
- **Machines stand at −45°** like the mockup, so rotation steps are 90° around that, and `PORTS` (per machine
  type, local frame, with an `out` direction) are the source of truth for where trays and outlets are.
- **Rotation:** 0, 90, 180, 270 degrees about the vertical. Ports rotate with the piece. The mockup's 45°
  camera means rotation 0 shows the front-left (`+z`) face to the camera, like `CONTRACT.md`.
- **Placement rules** (all checked in `shared/` so web, server and tests agree):
  1. Footprint inside the floor's grid and on an allowed floor (and back row only where the table says).
  2. No overlap with another piece's footprint, with a vertical connector's column, or with a belt tile.
  3. A 1-cell **clearance ring** in front of every input and output port (where the tray and the belt end go).
  4. Vertical connectors need the same `(col, row)` free on every floor they pass through.
  5. Required singletons stay: one planner, one merge gate, one launch pad. They can move, never be deleted.
  6. Gauntlet stations that exist on the live line stay (you can move them, add more, reorder research
     checks), but CI, verify bay, AI review and the merge gate can't be removed (§6).
- **Expansion:** a floor grows in width as the factory grows (research or progression unlock +8 cols). Later
  floors can be added (a second checks floor for a strict lane). Not in the first pack.

---

## 5. Data model (`shared/src/blueprint.ts`)

```ts
type FloorId = "mine" | "build" | "checks" | "launch";   // TIERS keys in web/src/map/shaft/layout.js
type Rot = 0 | 90 | 180 | 270;
type PieceType =
  | "mine" | "lint_seam"
  | "planner" | "splitter" | "buffer"
  | "assembler" | "power"
  | "ci" | "verify" | "review" | "check" | "measure"
  | "merge_gate" | "launch_pad" | "orbit_mast";
type LinkKind = "rail" | "lift" | "belt" | "tube" | "rework" | "conduit";

interface Piece {
  id: string;              // stable; equals the Machine id it drives ("assembler-1", "ci-1", "launch-pad")
  type: PieceType;
  floor: FloorId;
  col: number; row: number;  // footprint's min corner, before rotation
  rot: Rot;
  config: PieceConfig;     // discriminated by type: { source, filter } | { harness, district? } | { rule } | { capacity } | { tech, districts? } ...
}
interface Link {
  id: string;
  kind: LinkKind;
  from: { piece: string; port: string };   // "out", "pass", "reject", "a", "b", "power"
  to:   { piece: string; port: string };   // "in", "rework", "power"
  cells: { floor: FloorId; col: number; row: number }[];  // routed path, start to end; vertical hops repeat col/row on the next floor
  filter?: ItemKind;       // typed belt
}
interface Blueprint {
  v: 1;
  floors: Record<FloorId, { cols: number; rows: number }>;
  pieces: Piece[];
  links: Link[];
}
```

- **Zod schemas**, like the rest of `model.ts`. `FactoryState.blueprint?: Blueprint` (optional, so old
  snapshots still parse) plus `FactoryState.blueprintVersion?: number`.
- **Catalog:** `PIECES: Record<PieceType, PieceSpec>` with footprint, allowed floors, back-row flag, ports
  (`{ id, kind, dir: "in" | "out", cell: [dc, dr], face: "n" | "e" | "s" | "w" }` at rotation 0), max count,
  required flag, and the player-copy name key in `web/src/copy.ts`.
- **Pure helpers:** `footprint(piece)`, `portsOf(piece)` (rotated, in floor cells), `canPlace(bp, piece)`,
  `applyOp(bp, op) → { bp, error? }`, `validate(bp) → Problem[]`, `compile(bp) → PipelineConfig`.
- **Ops** (what the web sends and what undo replays):
  `place`, `move`, `rotate`, `remove`, `link`, `unlink`, `configure`. Every op is invertible
  (`invert(bp, op)`), which is how undo works.
- **Serialization:** JSON for storage and the wire. A share string later (`SHIP1:` + base64url of deflated
  JSON, like a Factorio blueprint string) so players can trade layouts. Strings are validated like any input.
- **Default blueprint:** `defaultBlueprint(machines, power)` reproduces the shaft layout the map thread built
  (same pieces, same places), so turning build mode on changes nothing until the player edits.
- **How it reaches the renderer:** the shaft is already data-driven: `makeLayout(plan)` turns a `Plan`
  (planner, assemblers, checks in line order, gate, pad, orbit, measure, sources, power with `feeds`) into
  stations and paths, and `core.js` builds everything from that. Build mode adds `toPlan(blueprint)` in
  `web/src/build/` and one small extension to the shaft contract: optional per-station `{ x, z, rot }`
  overrides and optional player belts in the `Plan`. When an override is absent, `makeLayout` auto-places
  as today. So the first web prompt can ship placement without touching any machine module.

---

## 6. From layout to real pipeline (`compile`)

`compile(blueprint, ctx) → PipelineConfig` is a pure function in `shared/`. The server runs it on every
applied change and the factory uses its output instead of today's hard-coded line.

```ts
interface PipelineConfig {
  sources: { kind: SourceKind; filter: SourceFilter; planner: string }[];
  routes: Route[];            // splitter tree flattened: ordered (match → assembler ids)
  assemblers: { id: string; harness: Harness; powerId: string; district?: string }[];
  lines: { match: Match; stations: StationPlan[] }[];  // gauntlet per branch, in order
  wip: Record<string, number>;   // piece id → max queued (buffers, lift capacity, link length)
  rework: { to: string; maxStrikes: number };          // planner id; 3rd strike goes to the player
  launch: { gate: string; pad: string; orbit?: string };
}
interface StationPlan { id: string; kind: StationKind; gate?: "ci" | "verify" | "ai" | "human"; tech?: string; concurrency: number }
```

What each piece compiles to:

| Layout | Real effect |
| --- | --- |
| Mine → rail → lift → planner | That source's ore is triaged by that planner, filtered by the mine's config |
| Planner → splitters → assemblers | `routes`: which assembler (harness) builds which kind / district / size. Replaces `pickAssembler`'s "first idle Spark assembler" |
| Count of assemblers per harness | Max parallel jobs per agent |
| Conduits from plants | Which sign-in pays for which assembler |
| Station order along the belt | Gauntlet order for PRs on that branch (`lines[].stations`) |
| Two copies of a station fed by a round-robin splitter | `concurrency: 2` |
| A filtered branch with an extra check | That check runs only for matching PRs (e.g. `web/` gets the visual diff camera) |
| Buffer chest / lift capacity / belt length | WIP limits: upstream stops pulling when full (and the jam shows) |
| Rework links | Where fails go; scar tags ride along |
| Merge gate → pad | Merge needs your tap or a permit for that lane; unchanged |

**Safety rules (`validate`), enforced on the server, can't be built around:**

1. Every path from an assembler `pr` output to the launch pad passes **CI → verify bay → AI review →
   merge gate**, in that order, with any research checks after CI and before the merge gate
   (cheapest first is a suggestion, not a rule). No bypass belt.
2. The merge gate is the last piece before the pad. One pad.
3. Every `reject` output reaches the planner's `in` through the rework line. No dead ends, no reject → pad.
4. No cycles except rework links.
5. Every assembler has power from a plant that matches its harness; steam powers only the planner.
6. Every link joins ports of matching kinds; every input that has work routed to it has a path from a mine.
7. A district that holds a launch permit keeps every station its permit requires (`Station.districts`).
8. Size caps: ≤ 200 pieces, ≤ 400 links, ≤ 2,000 link cells per blueprint (perf and abuse guard).

A blueprint with problems can still be **saved as a draft** (ghosted in the world, problems listed with a
tap-to-focus). Only a blueprint with zero problems can be **applied** to the live factory.

---

## 7. Server (persistence, validation, rollout)

- **Where it lives:** the Factory Durable Object's storage, next to `FactoryState` (`blueprint` key), plus
  the last 20 applied versions (`blueprint:v<n>`) for history and rollback. No D1 table in v1; if a later
  share gallery needs one, add a migration with the next free number.
- **Messages** (`shared/src/protocol.ts`, WebToServer):
  - `blueprint_ops { baseVersion, ops[] }` edits the **draft**. The server applies each op with `applyOp`,
    rejects the batch on any error, and answers with the new draft and its `Problem[]`.
  - `blueprint_apply { draftVersion }` validates, compiles, swaps the live config, bumps `blueprintVersion`,
    derives `machines` / `belts` for the existing renderers and logs one line ("Layout v7 live: 2 Codex
    assemblers, visual check on web/").
  - `blueprint_revert { version }` puts an older version back into the draft.
  - ServerToWeb `blueprint { draft, live, problems, version }` (full replacement, like `stations`).
- **Optimistic concurrency:** `baseVersion` must match, else the server answers with the current draft and
  the client rebases its pending ops (two tabs, or the player and a Spark proposal).
- **Live safety:** applying never strands work. Items in flight on a removed piece finish where they are or
  go back to the planner; a running job on a removed assembler finishes first (the piece shows
  "removing after #142").
- **Migration:** factories without a blueprint get `defaultBlueprint` from their current machines on load.
  `splitter-1` becomes the planner (same id). Gauntlet ids (`ci-1`, `verify-1`, `review-1`, `gate-1`,
  `launch-pad`, `orbit-1`) keep their ids, so `Station.machineId`, scars and history stay valid.
- **Rollout:** server flag `build` (default off, per-user opt-in like `autonomy`). Phase 1 compiles in
  **shadow**: the factory keeps its current logic and logs any difference from the compiled config. Phase 2
  switches routing and gauntlet order to the compiled config once shadow shows zero diffs on the default
  blueprint.
- **Spark's part (later):** Spark can propose a blueprint diff as a deck card ("Add a second verify bay: 4
  PRs waited 3h there"), shown as ghosts. Yes applies it through the same validation.

---

## 8. Web (the build tools)

All behind `?build=1` (remembered in localStorage `shiptorio:build`, `?build=0` turns it off), on the shaft
map only. Real Black Iron meshes from the map's builders; nothing new drawn in a different style.

- **Enter build mode:** a riveted BUILD toggle (amber when on). The camera eases to the active floor, the
  others dim to 30%. Grid overlay: brass dots at cell corners, faint plate seams. Floor tabs (Mine, Build, Checks, Launch) on the side.
- **Palette:** a bottom plate of pixel icons (Silkscreen labels, IRON-STYLE §4–5), grouped Sources /
  Transport / Plan & build / Checks / Launch. Locked pieces show as `???` with the unlock line. Phone: the
  palette is a pull-up sheet, ≥44px targets.
- **Ghost preview:** the real mesh in a teal aether hologram material over the hovered cell; red caution
  tint and a one-line reason when `canPlace` says no ("Needs the back wall"). Ports draw as small brass arrows.
- **Place / move / rotate / remove:** tap or click a palette piece then a cell; drag a placed piece to move;
  `R` or the rotate button; `X` or the scrap button. Desktop keys: `R` rotate, `Q` pick up the hovered type,
  `Esc` cancel, `Ctrl+Z` / `Ctrl+Shift+Z` undo and redo. Phone: long-press to pick up, two-finger pan stays
  the camera.
- **Links:** drag from an output port; the route auto-paths around footprints (A* on the floor grid, prefer
  straight runs, at most one vertical hop per connector) and snaps to the nearest matching input port.
  Valid = brass, invalid = red. Belt tiles render with the shaft's belt builder; tubes with its tube builder.
- **Draft vs live:** edits change the draft only (ghosted). A plate in the corner says "3 changes · 1
  problem" and opens the **Apply** sheet: a plain list of what changes for real ("Codex builds `web/`
  bugs", "Verify bay runs 2 at once", "Visual diff camera on `web/`"), problems with tap-to-focus, and
  **Apply** (amber) / **Discard**.
- **Undo:** a client op stack (inverses from `invert`), 100 deep, survives a reconnect by replaying unsent
  ops after the server's draft arrives.
- **Sim:** `?source=sim&build=1` works offline with the same shared helpers, so every screenshot and test
  runs without a backend.
- **Perf:** placed pieces join the shaft's static merge per floor; only ghosts and the selection are live
  meshes. Perf budgets from #167 still hold in build mode.
- **A11y:** every palette item and placed piece is focusable; arrow keys move the selection cell; `Enter`
  places; screen-reader lines name the piece, cell and problem.

---

## 9. Phases (what the Codex pack builds)

| # | Prompt | Lane | Needs |
| --- | --- | --- | --- |
| 1 | Blueprint model, catalog, ops, serialization, default blueprint | `shared/` | the shaft layout on main |
| 2 | `validate` + `compile` + golden tests (default compiles to today's line) | `shared/` | 1 |
| 3 | Server persistence, messages, versions, shadow compile, `build` flag | `server/` | 1, 2 |
| 4 | Grid + placement / drag / rotate in the shaft map behind `?build=1` | `web/` | 1, map rebuild |
| 5 | Links: port snapping, rail / belt / tube routing, rendered with shaft builders | `web/` | 4 |
| 6 | Undo / redo, draft vs live, Apply sheet, sim support | `web/` | 3, 4 |
| 7 | Switch the live loop to the compiled config (routing, gauntlet order, WIP) | `server/` | 3, shadow clean |
| 8 | E2E tests + phone / desktop screenshots of the whole flow | `web/`, `tests/` | 5, 6 |

Not in this pack: share strings, Spark blueprint proposals, extra floors, cosmetics, a second planner.

## 10. Open calls (made, change if wrong)

- **One planner in v1.** Two brains would mean two Spark budgets and conflicting triage. Unlock later.
- **Required gauntlet can't be removed or reordered.** Build mode adds and rearranges checks; it never makes
  the factory less verified. That matches "verify, then automate" (VISION).
- **Grid, not free placement.** Cells keep routing, validation and phone input simple, and it's what
  Factorio and RCT players expect.
- **Draft then Apply.** Every live change is one deliberate tap with a plain list of its real effects,
  because it changes how real PRs ship.
