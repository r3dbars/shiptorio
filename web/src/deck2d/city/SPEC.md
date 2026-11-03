# The city reveal: build spec

Source of truth for what to build: `BRIEF.md` (Justin, 2026-10-29). This file turns it into numbers, APIs, a file
manifest and file ownership for four parallel builders (art, city, story, sound). Where this file and the brief
disagree, this file says why in section 7.

Read first: `BRIEF.md`, `../contract.ts` (the new `CityIsland`, `CityView`, `CITY_*` block and the `city-*` events),
`docs/context/pixel-deck.md`.

Units used below:

- **world**: deck world units (`STOP_X`, `BELT_Y`, ...). 1 deck art px = `ART_PX` = 5 world.
- **city px**: the city's art grid. 1 city px = `CITY_PX` = 10 world = 2 deck art px. Island sprites are authored in
  city px. City px coordinate (cx, cy) is world (cx * 10, cy * 10), so the line keeps its world position.
- **k**: device px per art px of the canvas being drawn (always a whole number). At city zoom, device px per city px.
- Screens: desktop = 1280x720 CSS at dpr 1 (`scripts/shots/deck.mjs` desktop-1280), phone = 390x844 CSS at dpr 2
  (phone-390). The engine caps dpr at 2.

The line in city px: the engine's `BOUNDS` (world x -20..3969, y -30..800) is city box **L = x -2..397, y -3..80**
(399 x 83, "about 411" in the brief). Belt row city y 24. Deck left end city x 0. Hull front edge city y 35. Launch
spot `LAUNCH` (3774, 250) is city (377, 25).

---

## 1. The reveal timeline

### Where it goes

Full story only (`createStory()` with `swipes` 3, the default): today, after the third approve, `goAuto()` runs
lever, "Review runs itself now.", the hero crate with no card, then the next-jam beat (Checks waiting, "You're free
to fix the next jam.") and the connect card. **The reveal replaces everything after the hero crate ships**: the
next-jam beat and the old connect card go (decision 7.2). Reveal time **t = 0** is the story step where the hero crate
leaves the Launch queue (`S.shipped` increments, `S.follow` clears). Everything before t = 0 is unchanged.

The short front-door story (`swipes: 1`, `?source=live` guest) does not play the reveal (decision 7.1).

### Normal motion (seconds from t = 0; all constants are `CITY_TIMING`)

| Beat | t from | t to | `view.city` | Caption (`CITY_COPY`) | What moves |
| --- | --- | --- | --- | --- | --- |
| 0 rocket | 0.0 | 4.0 | omitted (station zoom) | unchanged ("Shippy's got these now. No card." stays) | the hero rocket: count 0.6 + ignition 1.4 + 2.0 of climb; the engine's own rocket camera |
| 1 line | 4.0 | 5.8 | `zoom "line"`, `beat "line"`, all `lit 0`, all `plates false`, `focus null` | `line` "That's one line." from 4.0 | camera move 4.0-4.6, hold 1.2 |
| 2 city | 5.8 | 7.9 | `zoom "city"`, `beat "city"`, all lit 0, plates false, focus null | `city` "Here's the rest of the factory." from 5.8 | zoom cut at 5.8, camera glide 5.8-6.4, hold 1.5 |
| 3 islands | 7.9 | 19.5 | `zoom "city"`, `beat "islands"`, per island below | per island below | one island at a time |
| 4 grow | 19.5 | 22.0 | `beat "grow"`, all lit 1, plates false, focus null | `grow` "The factory must grow." from 19.5 | only the line and the five lit bridge belts |
| 5 dim | 22.0 | 24.1 | `beat "dim"`; island j of reverse order (marketing, customers, inbox, traffic, errors) steps to `lit 0`, `plates true` at 22.0 + 0.15 j; before that it stays lit 1, plates false | `dim` "For now: one line. Your repo." from 22.0 | 5 steps to dark, 150 ms apart (last at 22.6), hold 1.5 |
| 6 card | 24.1 | (end) | `beat "card"`, all lit 0, all plates true, focus null | null (the card talks) | the card slides up over the city |

Beat 3, island i (0 = errors, 1 traffic, 2 inbox, 3 customers, 4 marketing), step start `T_i = 7.9 + 2.2 i`, `u = t - T_i`:

- `focus = island i` from `u = 0`. The camera makes its move during `u` 0 .. 0.6 (`move`).
- `lit[i] = clamp((u - 0.6) / 1.6, 0, 1)`; islands before i are 1, after i are 0. Plates all false.
- Seconds into the light step `s = lit * 1.6`:
  - runway lamp k (k = 0 at the lit end, see section 4 for which end) lights at `s = 0.06 k`; at most 12 lamps,
    so the runway ends by 0.66. The lit part of the bridge grows with the lamps (section 3). The bridge belt starts
    moving once its last lamp is lit.
  - `s = 0.72`: the island picture steps dark -> 2x2 checker of lit over dark.
  - `s = 0.84`: lit picture, its lamp on, glow halo on. The caption switches to that island's line here
    (`CITY_COPY.island[i]`), so each island caption shows from `T_i + 1.44` until the next one replaces it (2.2 s each).
    Before that, during `u < 1.44`, the caption is the previous island's line (or `city` for errors).
  - Customers only: arc dot j (j = 0 at the Customers pad, 30 dots) lights at `s = 0.84 + 0.02 j` (last 1.42); the
    capsule sits on its pad at `s = 1.46` with one dust puff (3 frames, 0.13 s each, then gone).
  - Marketing only: no bridge, no runway; the mast-tip beacon lights at `s = 1.02`.
- Errors 7.9-10.1, Traffic 10.1-12.3, Inbox 12.3-14.5, Customers 14.5-16.7, Marketing 16.7-18.9.
- 18.9-19.5 is still beat "islands": all lit 1, `focus null` (the camera moves back to the ring), caption stays the
  Marketing line. Beat "grow" starts at 19.5, which is when `city-all-lit` fires and the caption changes.

### Reduced motion (`prefers-reduced-motion: reduce`)

| Beat | t from | t to | `view.city` | Caption |
| --- | --- | --- | --- | --- |
| 0 rocket | 0.0 | 4.0 | omitted | unchanged |
| 1 line | 4.0 | 5.2 | `zoom "line"`, `beat "line"` | `line` |
| 2 city | 5.2 | 6.7 | `zoom "city"`, `beat "city"`, all dark | `city` |
| 4 grow | 6.7 | 9.2 | `beat "grow"`, all five `lit 1` in the same frame | `grow` |
| 5 dim | 9.2 | 10.7 | `beat "dim"`, all five `lit 0`, `plates true` in the same frame | `dim` |
| 6 card | 10.7 | (end) | `beat "card"` | null |

No beat 3, no runway, no dither, no arc dot sequence, no puff. Camera moves are cuts. Bridge belts stay still. Clouds
don't drift. The line itself keeps running exactly as it does at station zoom with reduced motion.

### What the line does during the reveal

From t = 0 the story keeps crates rolling but calmer: `spawnEvery = 1.6`, Review stays automatic, `jam`, `nextJam`,
`watch` null, `attention []`, no `focus`. **`view.shipped` is frozen** at its value at t = 0 until the story resets, so
no new rockets launch during the reveal (crates reaching Launch just leave, the engine already deletes them there).
Shippy stays `{ pose: "happy", at: "review" }` on the line's island. He never floats.

### Camera per beat

Rules (engine + `city/camera.ts`, section 3):

- **Station zoom** (no `view.city`): the existing automatic camera, untouched.
- **Line zoom**: `shotTarget("line")`, the whole line rounded down to a whole k.
- **City zoom**: `cityCamera(view.city, screen)`.
  - Usable viewport, device px: width `W*dpr - 2*8*dpr`, height `H*dpr - captionBand*dpr - 16*dpr`, captionBand
    56 CSS px landscape, 64 portrait.
  - Ring box = the union of the line box, every island sprite box and every label box (section 3 layout), plus 20
    city px on every side. `k_ring` = the largest whole k >= 1 at which the ring box fits the usable viewport (1 if
    none does).
  - Ring target: centre x = ring box centre x; centre y = ring box centre y + (captionBand*dpr / 2) / k city px (so
    the ring sits centred above the caption band).
  - Island target (`focus` set): **landscape: same as the ring target** (decision 7.5). **Portrait: k = k_ring + 1**,
    centre x = the island box centre x clamped so the view stays inside the ring box's x range, centre y = the island
    box centre y (sprite plus label) + (captionBand*dpr / 2) / k. No y clamp.
- Moves: a change of zoom level or of k is a cut in scale (whole numbers only, pixel art never scales smoothly);
  x and y glide with `settleCamera(..., rate 5)` (`CITY_CAM_RATE`, about 95% in 0.6 s). With reduced motion, every move
  at line or city zoom is a cut. Leaving the city back to station: scale cut, x/y glide at the existing rate.

Numbers with the start layout of section 3 (world units = city px x 10; `s` = cam.s the engine stores):

| Beat | Desktop 1280x720 @1 | Phone 390x844 @2 |
| --- | --- | --- |
| 0 | existing rocket camera: x 3704, y 100, s = max(fit, W/1100) | existing rocket camera |
| 1 line | k 1 (art px), centre (1974.5, 415), s 0.2; line is 798 of 1280 px | k 1, centre (1974.5, 415), s 0.1; line 798 of 780 device px (edges clip, as "See all" does today) |
| 2 city | k_ring 1 (city px), centre city (198, 112.5) = world (1980, 1125), s 0.1; ring box 1260 x 635 | k_ring 1, centre city (198, 24) = world (1980, 240), s 0.05; ring box 740 x 1462 |
| 3 errors | holds the ring | k 2, centre city (23, -404) |
| 3 traffic | holds the ring | k 2, centre city (373, -134) |
| 3 inbox | holds the ring | k 2, centre city (23, 305.5) |
| 3 customers | holds the ring | k 2, centre city (373, 585) |
| 3 marketing | holds the ring | k 2, centre city (48, -641) |
| 18.9 / 4 / 5 / 6 | ring | ring, k 1, city (198, 24) |

Retina desktop (1280x720 @2): k_ring 2, same centres; still holds the ring in beat 3. 1440x900 @1: k_ring 1.

---

## 2. Contract additions (done, in `web/src/deck2d/contract.ts`)

Added, nothing renamed or removed:

- `type CityIsland = "errors" | "traffic" | "inbox" | "customers" | "marketing"`, `CITY_ISLANDS` (reveal order),
  `CITY_LABEL` (Errors, Traffic, Inbox, Customers, Marketing).
- `type CityZoom = "station" | "line" | "city"`, `type CityBeat = "line" | "city" | "islands" | "grow" | "dim" | "card"`.
- `interface CityView { zoom; beat?; lit: Record<CityIsland, number>; plates: Record<CityIsland, boolean>;
  focus: CityIsland | null; label: string }`. `beat` omitted = the manual city.
- `DeckView.city?: CityView`. Omitted = station zoom, exactly as before.
- `CITY_PX = 10`, `CITY_TIMING` (every number in section 1), `CITY_COPY` (every word the city shows, the card copy,
  the canvas's accessible name).
- `type CityShot = "city" | \`city-${CityIsland}\``. Kept **out of** `Shot` (decision 7.3).
- `DeckEvent` variants: `city-zoom { level }` (engine), `city-lamp { island, lamp, of }`, `city-lit { island }`,
  `city-all-lit`, `city-dim { island }` (city layer). The beat 6 card is a plain `CardView`.

`cd web && npx tsc --noEmit -p .` passes with these. Builders do not edit `contract.ts`.

---

## 3. The city layer and its wiring (city builder)

### Files

```
web/src/deck2d/city/
  index.ts      createCity, manualCity, nextZoom, zoomLabel, cityLabel (public API below)
  layout.ts     ringLayout(portrait), bridgePaths(layout, manifest), lampPositions(path), arcPoints(from, to, portrait)
  timeline.ts   islandState(lit, lamps, island), cityEvents(prev, next, lampsOf) (pure)
  camera.ts     cityCamera(view, screen, layout, manifest) (pure)
  manifest.ts   CityManifest type + loadManifest(url) (fetch /deck/art/city/manifest.json, then the webps)
  draw.ts       bridges, lamps, halos, arc, capsule, beacon, island sprites + checker (city px, palette only)
  labels.ts     the DOM labels and plates
  README.md     rewritten: what the city is, how to preview it (?shot=city, ?reveal=1), how to shoot it
  art.ts        DELETE (the mockup's code-drawn fallback islands; decision 7.14)
```

### Public API (`city/index.ts`)

```ts
export interface CityScreen { w: number; h: number; dpr: number; portrait: boolean } // CSS px, dpr capped at 2
export interface CityModule {
  /** Once per frame, before drawing. city = view.city (undefined = not at a city zoom). Advances its own clocks
   *  (cloud drift, capsule puff) and emits city-lamp / city-lit / city-all-lit / city-dim on the bus (cityEvents). */
  update(dt: number, city: CityView | undefined, screen: CityScreen): void;
  /** Camera target at city zoom: world centre and whole k (device px per city px). */
  camera(city: CityView, screen: CityScreen): { x: number; y: number; k: number };
  /** Into the city buffer, world transform set (1 buffer px = CITY_PX world): bridges, islands, lamps, halos. */
  drawBack(ctx: CanvasRenderingContext2D): void;
  /** After the line: the arc dots, Customers' capsule and puff, Marketing's beacon halo. */
  drawFront(ctx: CanvasRenderingContext2D): void;
  /** After the blit: place (or hide) the DOM labels and plates. toScreen maps world -> CSS px for this frame. */
  place(city: CityView | undefined, toScreen: (x: number, y: number) => { x: number; y: number }): void;
  destroy(): void;
}
export function createCity(art: ArtLoader, bus: DeckBus, host: HTMLElement): CityModule;
/** The manual Zoom button's view.city: line = all dark, no plates; city = end of beat 5 (all dark, plates on). */
export function manualCity(zoom: Exclude<CityZoom, "station">, label: string): CityView;
export const nextZoom: (z: CityZoom) => CityZoom;        // station -> line -> city -> station
export const zoomLabel: (z: CityZoom) => string;          // station "Zoom out", line "Zoom out", city "Zoom in"
export function cityLabel(search: string): string;        // ?repo=owner/name (valid) -> "owner/name", else CITY_COPY.repo
export function parseCityShot(shot: string | null): CityView | null; // "city" | "city-<island>" -> manualCity("city") + focus
```

`city/index.ts` does **not** export `createLayer` (it is not a `DeckLayer`). main.ts loads it with
`load("city", "createCity")` and passes it to the engine; main's layer list goes back to
`["grow", "build", "launch", "juice", "props"]`.

### Engine (`engine/engine.ts`, city builder)

- `createEngine(cv, art, bus, shippy, layers, options)`: `options.city?: CityModule`.
- Effective zoom each frame: `view.city?.zoom` if `view.city`, else `parseCityShot(?shot)` if the URL asks for a city
  preview, else `"station"`. When it changes (not on the first frame) emit `{ type: "city-zoom", level }` and set
  `document.body.dataset.deckZoom = level`; set `document.body.dataset.cityBeat = view.city?.beat ?? ""`.
- `Engine` gains `readonly zoom: CityZoom`. Remove the mockup's `zoomLevel()` method. `seeAll` stays.
- **Station**: the HEAD (dev) render and camera path, byte for byte. Revert every mockup change that touched it:
  the `if (zoomLevel === "station") return frameShot(...)` camera override, the reduced-motion snap of every camera
  move, the `dt = 0` freeze, the frozen `t`, Shippy, layers and rocket at city zoom, and the order change of `cam.all`
  vs `shot` (dev order: shot first).
- **Line**: target `shotTarget("line", fitAll())` (desktop now included), x/y/s settle at rate 5. Rendered by the
  normal `px` canvas. Everything runs as at station.
- **City**:
  1. `cityPx = createPixelCanvas(cv, CITY_PX, PALETTE_48)`; `cam.s = k / (CITY_PX * DPR)` from `city.camera()`.
  2. Screen space: the dimmed `sky.webp` (`dimArt("sky")`) **uncut** (skyline and cloud sea showing), scaled to cover
     the buffer; then two `farClouds` strips behind everything: y 0.70*bh, h 0.18*bh, speed 2, par 0.02, alpha 0.85;
     y 0.86*bh, h 0.22*bh, speed 4, par 0.04, alpha 0.95. Reduced motion: speed 0. No flat colour fills (the mockup's
     navy and brown fills go).
  3. `city.drawBack(ctx)`.
  4. The line: draw every world piece exactly as the station frame does (slots `sky-far` .. `front`, belt, crates,
     stations, lever, Shippy, puffs, juice) into a **line buffer** at `ART_PX` covering world x [-40, 4000),
     y [-400, 840) (808 x 248 art px; both origins are even art px), then `drawImage(lineBuf, -40, -400, 4040, 1240)`
     into the city buffer with smoothing off: a 2:1 nearest-neighbor halving. At city zoom crate x snaps to `CITY_PX`
     before drawing so crates don't shimmer between samples. Keep the mockup's city-only hiding of crate badges, the
     WAITING plate text, the intake stack, the work badge and Shippy's corner portrait.
  5. `city.drawFront(ctx)`, `cityPx.end()` (palette snap), then `city.place(view.city, toScreen)`.
  - Pointer, wheel, pinch and double-click do nothing at city zoom (as the mockup). Taps never open what-is notes there.
  - While the city shows, the canvas `aria-label` is `CITY_COPY.canvas`; otherwise it goes back to what
    `wireDeckAccessibility` set.
- `engine/pxdraw.ts`: `beltRun` gains an optional last parameter `dir: 1 | -1 = 1` (-1 = plates and chevrons run
  left); add `beltRunV(cx, x, ay, by, t, speed, phase, dir)` for a vertical run 12 art px wide, plates 14 art px,
  same colours, soot edges, rails on both sides. Existing calls and `deck2d-belt.test.ts` stay unchanged.
- `engine/camera.ts`: add `CITY_CAM_RATE = 5`. Existing exports unchanged.

### Drawing (`city/draw.ts`), in the city buffer, back to front

1. Bridges (all, behind islands and the line). Each bridge is a list of orthogonal segments (layout below). Per
   segment: an iron truss under/beside it, drawn natively in city px (top chord 1 px `iron[2]`, bottom chord 1 px
   `iron[1]`, 6 px deep, a post and a zigzag brace every 10 px in `iron[1]` (an X with its neighbours: a 4-row truss
   cannot show a flat X), soot outline, the sun-side edge `iron[3]`, brass rivet `brass[2]` at each brace top), and the
   belt on top: `beltRun` (horizontal) or `beltRunV` (vertical) drawn at
   `ART_PX` into a scratch buffer and halved 2:1 like the line, so bridge belts and the line's belt share one look.
   The belt is 7 city rows (drawn at an odd art row, so its soot outlines survive the halving). Corners: a 9x9 city px
   iron junction plate (7x7 inside its soot outline, as wide as the belt) with a brass rivet. Lamps every 40 city px of path length, on the back
   rail side: a 1x4 px `iron[2]` post and a 2x2 lamp, off `iron[3]` / on `brass[4]` with a `brass[5]` glint and a
   halo r 4 at 25%.
   - Dark (`lit 0`): a cached render with phase 0, posterized once (`soot` / `iron[0]` by luminance, sum RGB > 110 ->
     `iron[0]`), lamps off. Never redrawn per frame.
   - Lighting: the lit render is clipped to the path prefix up to (lamp k position + 20 city px) for the highest lit
     lamp k, over the dark cache. Fully lit and belt moving once the last lamp is on; belt phase advances only then
     (reduced motion: never).
2. Island sprites at their layout position: `lit 0` dark webp; dither step: the dark webp with the lit webp over it
   through a checker mask (pixel (x + y) % 2 === 0 shows lit), precomputed once per island; lit: the lit webp.
3. Lit islands: lamp halo at `manifest.lamp` (three stepped discs r 10 / 6 / 3 at 25 / 50 / 75% alpha of `brass[4]`,
   `lighter`), the one allowed partial alpha (it lands on the palette after `end()`).
4. (after the line) Arc: 30 dots, 3x3 city px (2x2 vanished among the skyline's own lit windows), along the quadratic curve from the line's rocket spot city (377, 25)
   to Customers' `pad`, control point = midpoint + 0.35 * |P2 - P0| along the normal (landscape: up, -y; portrait:
   right, +x). Dot j counts from the Customers end. Dark dots `soot` with an `iron[2]` top-right px (`iron[2]` alone
   vanished), lit dots `brass[4]` with a `brass[5]` top-right px and a halo r 3 at 25%. The arc is lit only while Customers is (decision 7.6).
5. Customers capsule on `pad` (7 wide x 9 tall city px: steel body, fins, brass band, soot outline, light upper right) from
   `s >= 1.46` while Customers is lit; puff = 3 frames of `haze[3]` / `white[0]` px around its foot, 0.13 s each.
6. Marketing beacon at `beacon` once `s >= 1.02` while lit: a 3x3 `brass[5]` core with a `white[0]` px, halo r 14 / 9 /
   4 at 25 / 50 / 75%.

### Labels and plates (`city/labels.ts`, DOM, deck.css)

`<div class="city-labels" aria-hidden="true">` in `host`, hidden unless the effective zoom is city. One
`<span class="city-label">` per island (text `CITY_LABEL`) at island position + `manifest.label` (top-centre), one
for the line (`view.city.label`) at city (197, 86). When `plates[island]`, a `<span class="city-plate">` with
`CITY_COPY.plate` sits 4 px under that label (appears as a step, no transition). Caption font (Silkscreen), 14 px
(min-width 900px and min-height 560px) / 12 px otherwise, `text-shadow: 0 2px #0a0604`. Island label colour
`#eed3c5` (haze[3]) when lit, `#c0988e` (haze[2]) when dark; line label `#fdec9a` (brass[5]). Plate: uppercase,
10 px / 12 px, `color #0a0604; background #c98115; border 2px solid #422616; box-shadow 0 2px 0 #0a0604;
padding 2px 6px` (6.5:1). Captions never go here: they stay in `#toast`, the existing `aria-live` element.

### Ring layout (`city/layout.ts`), start values

Top-left of each sprite, city px. The city builder may move any island by up to 24 city px after looking at shots;
the constraints (no overlaps, labels on screen at both sizes, nothing under the Zoom and mute buttons, ring box fits at
the k values in section 1) win, and the final numbers go in `city/README.md`.

| | Landscape | Portrait |
| --- | --- | --- |
| errors | (-412, -213) | (-152, -543) |
| traffic | (-412, 147) | (248, -277) |
| inbox | (78, 131) | (-152, 156) |
| customers | (508, 47) | (248, 443) |
| marketing | (420, -213) | (-52, -751) |
| line box L | (-2, -3) .. (397, 80) | same |

Ports on the line (belt centre line, city px): landscape errors (0, 16), traffic (0, 30); portrait errors (0, 30),
traffic (0, 16) (swapped so the two never cross); inbox port y 36 (hull front). `A.<side>` = island position +
`manifest.anchors[side]`.

Bridge paths (orthogonal polylines, lamps counted from the **lit end**: the line end for errors / traffic / inbox, the
Inbox end for customers):

- Landscape errors: `A.e -> (-40, A.e.y) -> (-40, 16) -> (0, 16)`.
- Landscape traffic: `A.e -> (-24, A.e.y) -> (-24, 30) -> (0, 30)`.
- Portrait errors: `L -> (L.x, -250) -> (-60, -250) -> (-60, 30) -> (0, 30)` with `L = A.w + (20, 0)`: at k 1 on a phone the
  label's COMING SOON plate is 190 city px wide, so the belt leaves the island's left end and passes under the plate.
- Portrait traffic: `A.w -> (-30, A.w.y) -> (-30, 16) -> (0, 16)`.
- Inbox (both): if 40 <= `A.n.x` <= 380: straight up `A.n -> (A.n.x, 36)`; else with `m = round((A.n.y + 36) / 2)`:
  `A.n -> (A.n.x, m) -> (96, m) -> (96, 36)` (96, not 110: its lamps clear the line's label). Drawn behind the line, so its top disappears under the rocks.
- Customers feedback: landscape `S -> (S.x, I.e.y) -> I.e` with `S = A.s + (-12, 0)` (clear of the label and its plate); portrait `A.w -> (200, A.w.y) -> (200, I.e.y) -> I.e`,
  where `I.e` = Inbox's east anchor. Belt flow runs toward Inbox (`dir -1` on leftward runs).
- Marketing: no bridge.
- If a path needs more than 12 lamps at 40 px spacing, spacing becomes `ceil(length / 11)`.

### Events (`city/timeline.ts`, emitted by `update`)

`cityEvents(prev, next, lampsOf)` compares the previous and current `view.city`, per island, in `s` (seconds into light):

- `city-lamp { island, lamp, of }` for each lamp crossed, only if the frame crossed at most 2 lamps (a jump is silent).
- `city-lit { island }` when `s` crosses 0.84 upward, unless more than one island crossed in the same frame.
- `city-dim { island }` when `lit` drops from >= 0.84 to 0; at most one per frame (reduced motion dims all five at
  once: one thud).
- `city-all-lit` when `beat` changes into `"grow"` from anything else.
- Nothing fires for the manual city (it is dark and never lights) or when `view.city` first appears already lit.

### main.ts (city builder)

- Zoom button: `zoom.hidden = !!view.card || !!storyCity?.beat || !!firstRun?.playing()`. Visible on desktop as well
  as phone now (brief: "in every source"). Text and `aria-label` = `zoomLabel(manual)` ("Zoom out", "Zoom out",
  "Zoom in"). Click: `manual = nextZoom(manual)`. `web/deck.html`: initial text and `aria-label` "Zoom out".
- Each frame: `storyCity = underlying.city` (only the story sets it). If `storyCity`, `manual = "station"` and the view
  passes through untouched. Else if `manual !== "station"`: `view = { ...underlying, city: manualCity(manual,
  cityLabel(location.search)), caption: manual === "city" ? null : underlying.caption }`.
- A new card (no card -> card) resets `manual` to `"station"` (dev's "a new question brings the camera back").
  Cards are never hidden at any zoom (the mockup's `card: null, caption: "The factory must grow."` override goes).
- Story options: `createStory({ seed, speed, swipes, reducedMotion: matchMedia("(prefers-reduced-motion: reduce)")
  .matches, startAt: params.get("reveal") === "1" ? "reveal" : undefined })`.
- Beat 6 card: `storyBeforeSignIn` keeps its behavior (it swallows `story-connect` and opens the connection card,
  `deck2d-front-door.test.ts` unchanged) and gains `ending(): CardView | null` (the swallowed story card while
  `finished`). New exported pure `dressSignIn(card, ending, city)`: when `city?.beat === "card"` and `card` is the
  connection sign-in card (`card.id.startsWith("connection-") && card.yes === "Sign in"`), return it with `title`,
  `line`, `yes`, `no` from `ending` and `setup: true`, same id. Applied in the frame after `connections.view(...)`.
  Yes then runs the existing sign-in (`/auth/login?next=...`, password gate when locked); Replay = the connection
  card's "no", which closes it, and `storyBeforeSignIn` replays the story.

### Shots (`scripts/shots/deck.mjs`)

Replace `CITY_MOCKUP` with `CITY=1`:

1. Manual: `DECK_PATH` default `/deck.html?seed=1&source=conveyor-demo` (click Start as now). Save `station.png`,
   then Zoom out -> wait `body[data-deck-zoom=line]` + 1 s -> `line.png`, Zoom out -> `city` + 1 s -> `city.png`,
   Zoom in -> back to `station`.
2. Reveal: `/deck.html?seed=1&reveal=1`. With `CLIP` set, record from load. Poll `#toast` text every 100 ms and record
   the distinct sequence. Save `reveal-line.png` at `body[data-city-beat=line]` + 1 s, `reveal-lit.png` at
   `data-city-beat=grow` + 1 s, `reveal-dark.png` at `dim` + 1.8 s, `reveal-card.png` once `.ic-card` shows
   "Start with your repo." (or 40 s). `CLIP=24` gives the 24 s clip from rocket to card.
3. Problems: page title not "Shiptorio"; not 6 `.city-label`s fully on screen above the caption band at city zoom;
   `canvas.dataset.pixelZoom` not a whole number; more than 48 distinct canvas colours; horizontal overflow; the
   caption sequence (normal motion) not equal to `[line, city, errors, traffic, inbox, customers, marketing, grow,
   dim]` from `CITY_COPY` (reduced: `[line, city, grow, dim]`); manual city caption not empty; card title wrong.
   Write them in `report.json` as today. Evidence goes in the PR body, never in the tree.

---

## 4. Asset manifest (art builder)

Files in `web/public/deck/art/city/`: `manifest.json` and ten lossless webps, `<island>-lit.webp` and
`<island>-dark.webp`. Each file under 200 KB (target under 80 KB). The 1536x1024 paintings never enter the tree;
`scripts/city-art.py` reads them from a directory passed as `--refs <dir>` (or `CITY_REFS`).

### Schema (`city/manifest.ts` mirrors it)

```ts
type XY = [number, number]; // whole sprite px from the sprite's top-left
interface CityManifest {
  version: 1;
  unit: "city-px"; // 1 sprite px = 1 city px = CITY_PX world units
  islands: Record<CityIsland, {
    lit: string; dark: string; // file names next to manifest.json
    w: number; h: number; // exact webp size
    anchors: Partial<Record<"n" | "e" | "s" | "w", XY>>; // all four for errors, traffic, inbox, customers; {} for marketing
    lamp: XY | null; // the glass of the island's own lamp post; null for marketing
    label: XY; // top-centre of the DOM label: x = centre of the rim band, y = lowest opaque px + 4
    pad: XY | null; // customers only: centre of the landing ring on the deck top
    beacon: XY | null; // marketing only: centre of the mast-tip ball
    colors: { lit: string[]; dark: string[] }; // audit: distinct "#rrggbb" used, sorted
    bytes: { lit: number; dark: number }; // audit: file sizes
  }>;
}
```

Anchor meaning (sprite px, on opaque pixels, 2 px inside the silhouette so the belt end tucks under the rim):
`e` = rightmost deck-rim pixel at the vertical centre of the riveted rim band; `w` = the same on the left; `n` = the
back edge of the deck top at x nearest 0.25 w where no building stands; `s` = the bottom row of the front rim band at
x = 0.3 w (a belt leaving at 0.4 w runs through the Customers label on desktop and the Errors label on a phone).

### Sizes (city px)

| Island | w | h (expected, +-1) |
| --- | --- | --- |
| errors | 300 | 191 |
| traffic | 300 | 199 |
| inbox | 300 | 211 |
| customers | 300 | 197 |
| marketing | 200 | 132 |

w includes a 1 px soot outline on each side: the content is scaled so its alpha bounding box is 298 (198) wide.

### Processing (`scripts/city-art.py`, python3 + PIL)

1. Load each painting as RGBA. **The paintings are already transparent-backed** (about half their pixels have alpha
   0; the brief's "white background" is not what is on disk). Key = alpha >= 128 -> opaque, else transparent. Crop
   to the alpha bounding box.
2. Nearest-neighbor downscale (sample the cell centre) to 298 (198) wide, height by aspect.
3. Snap every opaque pixel to the nearest `PALETTE_48` colour (RGB distance). Add a 1 px `soot` outline outside the
   silhouette. Result = lit.
4. Dark = lit with every opaque pixel posterized: sum RGB of the snapped colour > 115 -> `iron[0]`, else `soot`.
   Errors only: pixels whose snapped colour is in the `jam` ramp keep `jam[0]` (jam[0]) / `jam[1]` (jam[1], jam[2]).
5. Write lossless webp (`lossless=True, quality=100, method=6`), then the manifest with anchors, lamp, label, pad,
   beacon (found by the script from the painting coordinates it documents, scaled), and the audits.
6. `--check` re-opens every webp and asserts size, palette membership, dark colours, opaque anchors, under 200 KB.

`web/test/city-art.test.ts` (runs anywhere, no image decoder): manifest shape; five islands; files exist; each
file is RIFF/WEBP with a `VP8L` (lossless) chunk whose 14-bit width/height equal `w`/`h`; widths 300/300/300/300/200;
heights within the table +-3; every audited colour in `PALETTE_48`; dark colours only `soot`, `iron[0]` (plus `jam[0]`,
`jam[1]` for errors); every anchor, lamp, pad, beacon inside `[0, w) x [0, h)` and the label inside `[0, w) x [0, h + 4]` (it hangs 4 px under the lowest pixel); pad only on customers, beacon only
on marketing; every file under 200 KB and the folder under 1 MB.

Until the manifest loads, the city layer draws bridges and labels with the expected sizes above and no island sprites.

---

## 5. File ownership

Strictly disjoint. A builder edits only its own paths. Anything needed elsewhere goes in `HANDOFF-<area>.md` at the
repo root (owned by that builder, never committed by them) for the integrator. Nobody edits `contract.ts`,
`city/BRIEF.md` or `city/SPEC.md`.

**art**
- `scripts/city-art.py` (new)
- `web/public/deck/art/city/**` (new: `manifest.json`, 10 webps)
- `web/test/city-art.test.ts` (new)
- `HANDOFF-art.md`

**city**
- `web/src/deck2d/city/**` except `BRIEF.md` and `SPEC.md` (`index.ts`, `layout.ts`, `timeline.ts`, `camera.ts`,
  `manifest.ts`, `draw.ts`, `labels.ts`, `README.md`; delete `art.ts`)
- `web/src/deck2d/engine/**` (`engine.ts`, `camera.ts`, `pxdraw.ts`, `pixel.ts`, and any new file such as `sky.ts`)
- `web/src/deck2d/main.ts`, `web/src/deck2d/deck.css`, `web/deck.html`
- `scripts/shots/deck.mjs`
- `web/test/deck2d-city*.test.ts` (new: e.g. `deck2d-city.test.ts` layout/timeline/events, `deck2d-city-camera.test.ts`
  section 1 numbers, `deck2d-city-zoom.test.ts` the three-step cycle, labels, `manualCity`, `dressSignIn`)
- `HANDOFF-city.md`

**story**
- `web/src/deck2d/story/index.ts`, new `web/src/deck2d/story/reveal.ts` (`story/script.ts`, the tutorial, stays as is)
- `web/test/deck2d-story.test.ts` (existing; only the edits listed in section 6), `web/test/deck2d-story-city.test.ts`
  (new)
- `HANDOFF-story.md`

**sound**
- `web/src/deck2d/juice/**`, `web/src/deck2d/sound/**`
- `web/test/deck-juice.test.ts`, `web/test/deck-sound.test.ts` (existing: add tests, don't change existing assertions),
  `web/test/deck2d-juice-city.test.ts` (new)
- `HANDOFF-sound.md`

### What each builder delivers

**story** (`story/reveal.ts` + `story/index.ts`):

- `export function revealAt(t: number, reduced: boolean, label: string): { city?: CityView; caption: string | null |
  undefined; done: boolean }`: pure, exactly the tables in section 1 (`caption: undefined` = leave the caption alone,
  beat 0). `export const REVEAL_SECONDS = { normal: 24.1, reduced: 10.7 }` derived from `CITY_TIMING`.
- `StoryOptions` gains `reducedMotion?: boolean` and `startAt?: "reveal"`. `StoryPhase` gains `"reveal"`.
- `goAuto()`: after `{ until: hero gone }`, set phase `"reveal"`, freeze `shipped`, `spawnEvery = 1.6`, clear
  jam/nextJam/watch/follow, then drive `revealAt` from the reveal clock; at `done`: phase `"end"`, caption null, card
  `{ id: STORY_CARD.connect, title: CITY_COPY.card.title, line: CITY_COPY.card.line, yes: CITY_COPY.card.yes,
  no: CITY_COPY.card.no, setup: true, stop: "repo", dots: null }`, `view.city` stays at beat `"card"`.
- `view()` returns `city` while the reveal runs or the end card is up. `approve(connect)` and `later(connect)` keep
  today's behavior (later = `reset()`, which clears `city`).
- `startAt: "reveal"` (ignored when `swipes` is 1): fresh story with every stop built, Review automatic, `budget null`,
  Shippy happy at Review, phase `"reveal"`; after 0.5 s it increments `shipped` once (the beat 0 rocket) and that frame
  is reveal t = 0.
- The short story (`swipes: 1`) is untouched.

**sound** (`juice/sounds.ts` + `sound/`):

- `cuesFor`: `city-lamp` -> one quiet tick, pitch rising one semitone per lamp from about 880 Hz, at most 40 ms,
  every tick plays (60 ms apart, so it must not go through a 90 ms same-effect gap or the calm floor);
  `city-lit` -> one warm brass tap; `city-all-lit` -> the existing `shipped` chord one octave down;
  `city-dim` -> one soft thud; `city-zoom` -> nothing. Each at most one cue (the "every beat is one cue at most" test).
- Levels under the music: lamp, tap and thud peaks (`recipePeak`) no louder than the build kit's `bell_small`; the
  chord no louder than `shipped`. Mute (M or the button) silences all of them, as every other sound.
- Tests in `deck2d-juice-city.test.ts`: the mapping, one cue each, twelve ticks in 0.66 s all play, levels.

**art**: section 4.

**city**: section 3 and the shots.

---

## 6. Behaviors that must not change, and their guards

Until the player presses Zoom out or the full story reaches reveal t = 0, nothing visible or audible changes.

| Behavior | Guarded by |
| --- | --- |
| The story up to the hero crate: beats 1-4, cards, captions, the Gate build, ids, determinism, the three different fixes | `web/test/deck2d-story.test.ts` (all five tests) |
| The short front-door story ends on `story-connect` after one swipe, no reveal | `deck2d-story.test.ts` "the front door's short story..." |
| A stranger plays every story decision, then the existing sign-in card opens once; Close replays with fresh ids | `web/test/deck2d-front-door.test.ts` (unchanged, must pass as is) |
| Live guest first run, tutorial script, what-is notes | `deck2d-firstrun.test.ts`, `tutorial-script.test.ts`, `deck2d-whatis.test.ts` |
| Live, sim and replay views; the Zoom button stays usable during a replay take | `deck2d-view.test.ts`, `deck2d-replay.test.ts`, `deck2d-bugbash.test.ts`, `deck2d-journey.test.ts`, `deck2d-away.test.ts`, `deck2d-payoff.test.ts` |
| Conveyor demo | `deck2d-conveyor.test.ts` |
| Camera maths, belt drawing, dimming | `deck2d-camera.test.ts`, `deck2d-belt.test.ts`, `deck2d-dim.test.ts` |
| Card, keyboard, accessible names | `deck2d-a11y.test.ts`, `deck-card-dom.test.ts`, `deck-story-card.test.ts`, `node web/test/a11y/audit.mjs` |
| Sounds and calm rules | `deck-juice.test.ts`, `deck-sound.test.ts`, `calm-sound.test.ts`, `build-sound.test.ts` |
| Station names; no "launch pad" / "rocket pad" in any string literal under `web/src/deck2d` | `station-names.test.ts` |
| The deck imports nothing from the old app | `deck2d-boundary.test.ts` |
| Shippy, dock, rehearsal, flight, build, grow, launch | `deck2d-shippy.test.ts`, `deck2d-dock.test.ts`, `deck2d-rehearsal.test.ts`, `deck2d-flight.test.ts`, `deck2d-live-build.test.ts` |

The only allowed edits to an existing test: in `deck2d-story.test.ts` "the story plays all four beats and ends on the
connect card", the block after the hero ships ("the next jam, then the last card") changes to: run until
`card?.id === STORY_CARD.connect` with a 40 s limit; assert `phase() === "end"`, `view().city?.beat === "card"`,
all five plates true, `card` matches `{ title: "Start with your repo.", yes: "Sign in with GitHub", no: "Replay",
setup: true }`; the final `expect(t).toBeLessThan(120)` may rise to 150 if measured above 120. The `focus "checks"` /
`attention ["checks"]` assertions go with the next-jam beat (decision 7.2). Everything else in that file stays.

Intentional, visible changes outside the reveal: the Zoom button now shows on desktop too, cycles three levels and
reads "Zoom out" / "Zoom out" / "Zoom in".

Done means: `bun run check` green; new tests for the city view, the reveal phases and the three-step zoom; shots at
phone and desktop at all three zoom levels plus the 24 s clip; no file over 200 KB added.

---

## 7. Decisions made here

1. **Short front-door story: no reveal.** `?source=live` guests get one swipe then sign-in (its pacing is the point).
   Only the full story (`/deck.html`, `?source=story`, `?reveal=1`) plays it.
2. **The next-jam beat goes from the full story.** The brief puts the reveal right after the rocket; a yellow Checks
   jam and "You're free to fix the next jam." would sit under "That's one line." and break "only the line moves".
3. **`Shot` is unchanged; `CityShot` is a separate type.** Adding values to `Shot` breaks the engine's station-shot
   code (`STOP_X[shot]`), which belongs to the city builder. Sources say `view.city.focus`; `?shot=city` and
   `?shot=city-<island>` previews parse into `CityShot`.
4. **The beat 6 card is the existing sign-in card, dressed in the brief's words.** Yes runs today's sign-in
   (`/auth/login`, password gate) rather than `location.assign("/")`, which would drop a guest back into the short
   story. Replay is that card's Close, which replays the story. The front-door test stays green untouched.
5. **Desktop holds the ring through beat 3.** At 1280x720 @1 the ring fits at k 1 and k 2 shows 640x360 city px,
   smaller than any line + island pair (711 px wide or more), so a whole-number move can't frame a pair. The phone
   pans at k 2, as the brief asks.
6. **The arc is dark when Customers is dark.** The dark reference keeps it yellow; a lit route to a dark island would
   imply Customers works.
7. **`shipped` is frozen during the reveal**, so no extra rockets launch under it; crates keep rolling every 1.6 s.
8. **Keying is by alpha.** The paintings ship with transparency; keying white would eat their highlights.
9. **Labels and plates are DOM** (crisp text, real font, `aria-hidden` container); the canvas gets `CITY_COPY.canvas`
   as its accessible name at city zoom; captions stay in `#toast`.
10. **The line is halved 2:1 nearest-neighbor at city zoom** (drawn at `ART_PX` in its own buffer), so the whole city
    frame is one grid. `ART_PX` and the station renderer are untouched. Crates snap to `CITY_PX` there.
11. **Bridges are orthogonal runs** (horizontal `beltRun`, new vertical `beltRunV`), with iron junction plates, no
    stair-stepped diagonals.
12. **`?reveal=1`** starts the full story at the reveal, for shots and Justin's recording takes.
13. **Reduced motion**: camera cuts, bridge belts still, clouds still, all five light at once; the line runs as usual.
14. **`city/art.ts` is deleted.** Code-drawn stand-in islands break "pictures for static city"; until the manifest
    loads, islands just aren't drawn.
15. **The manual city keeps the line running** (the mockup froze stations, Shippy and the rocket). The brief: "the real
    deck drawn one zoom step smaller, crates still moving".
16. **Zoom labels**: "Zoom out" at station and line, "Zoom in" at city (back to station in one press), name = text.
