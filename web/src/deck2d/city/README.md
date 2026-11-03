# The city

The third zoom level of the 2D deck, and the ending of the intro story. Zoom out once: the whole line. Zoom out again: the
line is one lit island among six, floating over the sunset clouds, joined by suspension bridges, lifts and junction towers
that carry belts. The five other islands (Errors, Traffic, Inbox, Customers, Marketing) are **scenery that says where this goes**. Nothing here reads an
account, an issue or any service, and nothing on screen says or implies they work. GitHub is the only real source.

What to build and why: [`BRIEF.md`](BRIEF.md) (Justin's creative brief, his round 2 direction at the top),
[`DIRECTION.md`](DIRECTION.md) (round 2: island forms, the connector kit, captions, the hero line) and [`SPEC.md`](SPEC.md)
(round 1 numbers, APIs). This file is what the code actually does today, where it differs from those, and how to look at it.

## How it is put together

| File | What it owns |
| --- | --- |
| `index.ts` | `createCity` (the module the engine drives), `manualCity`, `nextZoom`, `zoomLabel`, `cityLabel`, `parseCityShot` |
| `layout.ts` | the ring (derived from the manifest's anchors, a phone's spread to its height), every connector's plan and its 12 runway lamps, `connectorBoxes`, the arc |
| `connector.ts` | the connector kit: pylon, pier, span, lift, junction tower, the Hub, the belts' chevrons, painted into a pure RGBA raster; the cached dark and lit pictures |
| `timeline.ts` | `islandState(lit, lamps, island, lights)`: one progress number becomes a picture (the island's own lights in `lightOrder`, its lamp's bloom, the capsule's flight and drop too); `cityEvents`: what a change of view fires; `growGlowOn` |
| `camera.ts` | `cityCamera(view, screen, layout, manifest)`: world centre and a whole-number `k`, as a pure function (the ring, beat 3's push-in and close-ups, the manual city's top reserve, the card); `createCityMove`: how the camera gets there |
| `manifest.ts` | the manifest schema, `parseManifest`, the expected sizes used until it loads, `loadManifest` |
| `draw.ts` | the dither, halo rings, the islands' own lights, arc dots and arrowhead, the small rocket (on its pad and in flight), its puff, the beacon, the grow glow's palette warm-up |
| `labels.ts` | the DOM labels and COMING SOON plates (styles in `deck.css`) |
| `../engine/engine.ts` | the zoom levels, the sky, the line drawn one step smaller (below), the pointer guards |
| `../engine/halve.ts` | the 2:1 nearest-neighbour halving, and belt phase in whole city px |
| `../engine/pxdraw.ts` | `beltRun` (with `dir`) and `beltRunV`, the line's own belts |

The city is **not a `DeckLayer`**. The engine owns the frame; this module owns the rest of the city and draws a pure
function of `view.city` (the story, or the Zoom button, owns time) plus four small clocks: belt phase, the rocket's dust
puff, the 0.12 s checker when an island steps back to dark, and the previous view (for the sound events). `main.ts` loads it
with `load("city", "createCity")` and hands it to the engine as `options.city`. The cached pictures (each island's dither,
each connector's dark picture) are built one a frame while the line zoom is up, so zooming into the city does not drop a
frame; a player who never zooms out pays nothing. The city is scenery: if it ever throws, the engine says so once on the
console and stays on the line, and the deck keeps running.

### One pixel grid

1 city px = `CITY_PX` = 10 world units = 2 deck art px. Island sprites are authored in city px and drawn 1:1. The line keeps
its world position: it is drawn exactly as at station zoom, into its own buffer at `ART_PX` (world x -40..4000,
y -400..840, 808 x 248 art px, both origins even), then **halved 2:1** into the city buffer, so the whole city frame is one
grid. The halving (`engine/halve.ts`) is plain nearest-neighbour with a fixed pick, the upper right pixel of each 2x2 block
(the light's side), instead of asking `drawImage` to downscale: a browser's own downscale of an exact half picks the left or
the right pixel depending on the GPU, and a test can pin mine. At a silhouette, where that pixel is transparent, the first solid
one is used, so an outline never half-disappears into the sky. (Preferring the odd pixel out in each block was tried and
dropped: it promotes every rivet and glint, and the line turns glittery and brassy next to the same art at station zoom.)
Two things keep the halved picture from shimmering: crates snap to a whole city px (on the odd art column the halving
samples, so both outlines survive), and belts move in whole city px steps (`quantPhase`).

### The zoom levels

`view.city` decides (a `?shot=city` preview stands in when the source sends none):

- no `view.city`: **station**, the usual camera, byte for byte as before the city existed;
- `zoom: "line"`: the whole line at a whole-number scale (`shotTarget("line")`), x and y gliding at `CITY_CAM_RATE` (5);
- `zoom: "city"`: the ring. The engine renders into a second pixel canvas on the city grid.

A change of level or of `k` is a **cut in scale** (pixel art never scales smoothly); x and y glide. The reveal's change from
the line to the city is a **match cut**: its first city frame keeps the line's middle (world 1975, 385) on the screen spot
the line zoom showed it at, and the camera then glides 0.6 s to the ring, inside beat 2's hold. The reveal's line zoom already
hangs the sky where that first city frame will, so the skyline and the cloud strips do not jump at the cut. The Zoom button's
own city cuts straight to the ring, as before. With `prefers-reduced-motion` every move at line or city zoom is a cut (no
match cut either), belts and clouds stand still, and the story lights all five islands in one frame. Pointer, wheel, pinch
and double-click do nothing at city zoom, and taps never open what-is notes there. Without the pixel canvas (`?px=0`) there
is no city: the Zoom button is just station <-> line.

### The sky

The dimmed `sky.webp` (skyline and cloud sea showing) scaled to cover the buffer, then two slow cloud strips behind
everything, in screen space so they never follow an island. No flat colour fills.

## The camera (`camera.ts`)

`cityCamera(view, screen, layout, manifest)` gives a world centre and a whole-number `k` (device px per city px). The screen is
CSS px, less `EDGE` (8) all round and the caption `BAND` at the bottom (96 on a desktop, 80 on a phone, two caption lines), and
the engine adds what a moment keeps clear (`CityScreen`): a phone's `top` reserve and `band`, and `cardTop`.

- **The ring** (no focus): the largest whole `k` at which the ring box (the line, every island with its label and plate, 20 px
  of air) fits the usable screen, centred in it.
- **Beat 3 on a desktop: one step closer.** Each island's turn pushes in to `k_ring + 1` and centres `pushBox` above the caption
  band: the island and its label, its connector's whole path (8 px of air round every point) and the end of the line it meets
  (the Hub's west face for Errors and Traffic, the line's belly for Inbox, the rocket for Customers, with its arc, and for
  Marketing, which has no connector and hangs off the launch end). A box up to `EDGE` too tall uses the top `EDGE` (Customers'
  arc at 1280 x 720); a taller one keeps the ring. Then, as on a phone, the picture moves at most 80 CSS px, the box still in
  the usable screen, so fewer other islands are cut by an edge. When the turns are over the camera cuts back out to the whole
  lit ring at `k_ring`: that cut is the payoff. At 1280 x 720 Inbox's push-in shows the line from its belt down: Inbox hangs 176
  px under the line, and the lift and Inbox with its label fill the 304 px a push-in has.
- **Beat 3 on a phone: a close-up** at `k_ring + 1`. The ring stands in two columns, left and right of the line's middle. The
  view's edge goes in the gap between them, 1 px clear of the other column (on a 390 px phone x 134 for Errors and Inbox, 390
  for Traffic, Customers and Marketing), stays in the room (the ring box, every connector, the arc) with 24 CSS px to spare at
  the sides and 300 of sky above, keeps the island, Errors' trunk and Customers' arc 24 CSS px from both sides, and moves at most
  80 CSS px so no other island is cut by an edge. In y the island's middle sits 37.5% of the way down the usable height (where
  the room allows: Inbox and Customers stand at the ring's foot, lower); an island or the line half under the caption band is
  lifted out (`LIFT`, up to 60 CSS px); then at most 80 CSS px again for the top and bottom edges.
- **The manual city on a phone** keeps clear of the Zoom button: the engine passes `top`, the button's bottom + 8, and no caption
  band (the manual city has no caption). `usable()` and `ringK` take the reserve off, the ring's middle moves down by half of
  it, and a phone's ring spreads to the height that is left.
- **Beat "card" on a phone**: 8 px above the sign-in card's top (its layout box, not its slide) is the band. The ring re-centres
  above the card if it fits there (a 390 x 844 phone), else its top stays `EDGE` under the screen's top and the card covers
  its foot. The camera glides up while the card slides up.
- **Moves** (`createCityMove`): a new `k` cuts x, y and the scale in the same frame, and so does a hop longer than half the usable
  height; any other new target glides 0.6 s on a smoothstep, on whole device px. Neither the push-ins nor the close-ups change
  the story's timing: each island's 0.6 s move is a cut or a glide.

## What lights when (`timeline.ts`)

`lit` per island is 0 (dark) to 1 (lit); in between it is seconds into the light step / `CITY_TIMING.light` (1.6 s). `s` =
seconds into the step:

| `s` | |
| --- | --- |
| > 0 | runway lamp 0 (at the lit end of the connector); then one lamp every 60 ms, exactly twelve |
| 0.66, after lamp 11 | Customers: the connector's belt starts, chevrons and all (never under reduced motion) |
| 0.72 | the island picture steps dark -> a checker of 2 x 2 px cells, lit over dark |
| 0.84 | lit: its label on; Customers: its lamp halo and its own lights (pad, thruster) too |
| 0.84 + 0.05 (j + 1) | Errors, Traffic, Inbox: their own lights come on one at a time (`lightOrder`: Errors' crack from the crater down, Traffic's signals west to east, Inbox's portholes bottom to top), then hold steady |
| then 3 x 0.06 | Errors, Traffic, Inbox: the lamp's halo blooms, r 3-2 at 50%, then r 5-3 at 25% round it, then the whole r 7-4 at 25% and r 4-2 at 50% |
| max(1.3, a step after that) | Errors, Traffic, Inbox: the connector's belt starts (Errors and Inbox at 1.3, Traffic at 1.47) |
| 0.84 + 0.02 j | Customers: arc dot j lights, from the line's rocket out to the pad (30 dots, the last at 1.42) |
| 1.42 to `capsule` - 0.12 | Customers: with every dot lit, the arrowhead shows at the pad and the capsule flies the dots from the line's rocket in whole px: nose up and right over dots 0-9, level over 10-16, then upright on a 1 x 2 `sun[4]` flame from dot 17 on (each pose its own drawing, no rotation) |
| `capsule` - 0.12 to `capsule` | Customers: the arrowhead goes and the capsule drops straight down from the last dot onto the pad, upright on its flame |
| `capsule` (1.94) | Customers: it sits on its pad, one dust puff (3 frames of 0.13 s) |
| 1.02 | Marketing: the mast-tip beacon lights (no connector, no runway) |

The step itself is `CITY_TIMING.light` (2.6 s) long; every time above is read from `CITY_TIMING`. Dropping back to 0 (beat 5)
shows the same 2 x 2 checker for 0.12 s on the city's own clock, then dark; the connector steps to dark at once. Under reduced
motion it is a straight step to dark, and the capsule is simply on its pad: no flight, no puff.

**The grow glow** is on for beat "grow" only (off from the dim on, never on the manual city, never at line zoom), on and off
as a step. It is a backlight, not a film over the sky: in `drawBack`, after the sky and before any connector or line pixel,
the backdrop under an ellipse round (150, 40) (rx 196, ry 78) is read back, each pixel snapped to its nearest palette colour
and, if it is sky (`sun` or `copper`), stepped one place up its own ramp, two inside the inner ellipse (rx 150, ry 56).
Everything else (the skyline's `iron`, `haze`, `plate`, `steel` and `soot` towers) stays as it is, so the towers stay dark
silhouettes and no edge of the glow crosses one. Each ellipse's edge is a 4 px band (r - 2 to r + 2) of the 2 x 2 checker,
which picks the inner or the outer count, never a hard arc. Opaque palette colours only. `cityEvents` turns changes into `city-lamp`, `city-lit`,
`city-all-lit` (beat enters `grow`) and `city-dim` for the sound; a jump over more than two lamps is silent, and nothing
fires for a view that has just appeared (the manual city never lights).

## The ring, final numbers

City px, top-left of each sprite (the line box is (-2, -3)..(397, 80), its label at (197, 86), the launch spot at
(377, 25)). Every position is **derived from the manifest's anchors** (`ringLayout(portrait, manifest, usableH)`), so a span's
slope stays exact whatever the art does; these are the numbers with the shipped manifest (and with `fallbackManifest()`, which
matches it), the phone's on a 390 x 844 screen.

| | Desktop | Phone (spread 1.25) |
| --- | --- | --- |
| errors | (-365, -142): `e` lands 196 left and 98 up of the Hub's upper west port | (**38**, -505): `w` at (42, -445), a 53 px stub east of the trunk's head junction |
| traffic | (-393, 55): `e` lands 178 left and 89 down of the Hub's lower west port | (330, -261): `w` on junction J's row, y -197 |
| inbox | (42, 140): its `n` anchor (54, 69) right under the lift at x 96, on row 209 | (-14, 188): its `n` anchor under the lift at x 40 |
| customers | (470, 152): `w` at x 473, on Inbox's `e` row | (354, 200): `w` at x 357, on Inbox's `e` row |
| marketing | (**670**, **-80**): low and right, so the Zoom button (top right, under the mute button in the demos) never covers its mast | (440, -660) |

**The phone's spread.** A phone stacks the ring vertically, and a plain stack left the bottom third of the screen empty. So
`ringLayout(true, manifest, usableH)` scales every island's offset from the line's middle (y 38.5) by
`sy = min(1.25, (usableH - 2 * RING_PAD) / ringH)` (never below 1), rounded to whole px. usableH is the screen's usable height
at the ring's k 1 in city px (the caption band and the edges taken off; 1496 on a 390 x 844 phone, the default), and ringH the
plain ring's height with its labels and plates. The rows scaled are the ones the connectors attach to, so lifts stretch and spans
stay flat: Errors' `w` row (the trunk's head), Traffic's `w` row with junction J, Inbox's `n` row under its lift (Customers
sits on Inbox's `e` row), and Marketing's top. On a 390 x 844 phone the ring box then fills 77% of the usable height (it was
two thirds); a shorter phone gets a smaller spread that still fits (390 x 664: 1.19), and a whole-px overshoot steps sy back
until it does. The city module keeps one layout per usable height (in steps of 8 px), so a browser bar sliding in or out
rebuilds nothing.

Where these differ from DIRECTION.md's start values (bold), and why:

- **Inbox stands under its lift again** (DIRECTION.md B; round 2's "L" of a junction tower and a west span is gone): it is
  placed by its `n` anchor, so the lift lands on the plinth beside the post tower whatever the art does (left edge x 42 on a
  desktop, -14 on a phone), left of the YOUR REPO label. Only the Customers span touches it, on its east side.
- **Phone Errors 32 px right**: a phone's COMING SOON plate is 108 CSS px (216 city px) wide since deck.css set it in 12 px
  Silkscreen; at x 6 Errors' plate would sit over the trunk. Its stub to the trunk's head junction is 53 px instead.

## The connectors (`connector.ts`, DIRECTION.md section B)

One kit, drawn in city px with palette colours only, light from the upper right, 1 px soot outlines. Every connector is a
plan (`connectorPlans(layout, manifest)`): its path (the belt's centre line, island end first, lit end last), its spans,
lifts, pylons, junctions, cables, brackets and exactly 12 lamps.

- **Pylon**: an A-frame lattice tower 30 px above the belt, legs 9 apart at the foot and 5 at the top (shade leg `iron[1]`,
  sun leg `iron[3]`), an X brace every 6 rows in `iron[2]`, a 7 x 3 brass saddle for the cables and a 5 x 7 lantern on a
  2 px stem. A **rim** pylon stands on an island's anchor on an 11 x 2 foot plate and is drawn in front of the island; a
  **pier** pylon stands mid-span on its own floating rock.
- **Pier** (the rock under a mid pylon): a lattice leg under the truss that narrows from 7 px wide to a 4 px foot over 10 rows
  (shade chord `iron[1]`, sun chord `iron[3]`, soot outline, one K brace in `iron[2]`), standing on one irregular 14 x 9
  boulder whose flat 6 px top takes the foot: `plate[3]`/`plate[2]` facets up on the right, `plate[1]` through the middle,
  `iron[0]` low on the left, a soot outline with a 2 px notch bitten out of its lower left, no crevice. Once lit, one
  `energy[1]` fleck of crystal in it is the only cyan. Under a sloped span it hangs 2 rows lower, under the deeper truss.
- **Span**: flat or sloped (+-1/4, +-1/2), painted column by column: the band's top row at column x is
  `round(ya + (x - xa) * slope) - 3`, so a 1/2 slope steps one px every two columns. 7 band rows (soot, `iron[2]` back rail
  with a `brass[2]` stud every 8 px, three plate rows with a soot seam every 7 px, `iron[1]` front rail, soot), then the truss
  (`iron[3]` sun lip, `iron[2]` top chord, the web, `iron[0]` bottom chord, soot). Flat spans carry a 4-row Warren web in 12 px
  bays with a riveted vertical at each bay end. Sloped ones carry a 6-row web (the truss is 2 rows deeper) in 12 px panels:
  an upright vertical with its `brass[2]` rivet every 12 px and one clear diagonal per panel, from the top of one vertical to
  the foot of the next, leaning down the slope; a flat truss ends in a riveted post at each end. Main cables (1 px `iron[3]`
  over soot) sag `clamp(round(0.12 * run), 6, 24)` between rests and never come within 4 px of the top rail; a taut backstay
  down to a deck anchor sags an eighth of its fall; hangers every 6 px. A span over 120 px gets mid piers, evenly spaced, at
  most 120 apart.
- **Chevrons**: every belt (spans, lifts, the Hub's ports) carries a 3 x 3 chevron every 14 px on its three plate rows (or
  columns), pointing the way the ore runs: toward the Hub or the line, and toward Inbox on the Customers span. Lit, a
  `brass[3]` body with a `brass[4]` tip; dark, `iron[1]` at rest (`iron[0]` once posterized). They advance one whole px per belt
  step with the plates, so a belt has 14 pictures, not 7. On a sloped span each chevron stays upright: its three columns sit
  on the middle column's rows. On a lift they are drawn over the cage's braces, which would otherwise hide three in four.
- **Lift**: 13 wide, a 7-wide belt standing up inside a lattice cage (K braces every 8 rows, in front of the belt, its
  chevrons over them), lanterns on 3 px arms on the sun side, a foot plate on the rim it stands on.
- **Junction tower**: 15 x 15, `iron[2]` frame lit top and right, X braces, a 7 x 7 brass gear housing, a lantern.
- **The Hub**: 15 x 50 at x -18..-4, y -6..43, drawn behind the line; a gear housing and a short belt at each port the layout
  uses. Each belt leaves its east face as a 7-row stub across the gap and under the line's west rail (to x +1, a soot cap),
  so no sky shows between the Hub and the line on that belt's rows; a phone's trunk runs on down inside it and turns east on
  the upper port's row (16). Two 4 x 3 brackets at y 13 and 27, just above each port, clamp it to the line over the stubs.
  It lights with the first connector that feeds it.

Where each runs:

| | Desktop | Phone (390 x 844) |
| --- | --- | --- |
| errors | span `e` (-214, -82) -> Hub upper west (-18, 16), slope 1/2, 219 long, 1 pier; its cable rests on the Hub's top corner | the **trunk**: a stub from `w` (42, -445) into a head junction at (-11, -445), then a lift down x -11 to the Hub's top port (-11, -6), 492 long |
| traffic | span `e` (-196, 119) -> Hub lower west (-18, 30), slope -1/2, 199 long, 1 pier; its cable is anchored on its own deck 14 px short of the Hub (a cable to the Hub would cross the Errors span) | flat span `w` (332, -197) -> junction **J** at (-11, -197) on the trunk, 343 long, 2 piers |
| inbox | a lift alone from `n` (96, 209) on Inbox's plinth straight up into the line's belly (96, 36), behind the rocks, its foot plate on the plinth's top; 173 long | the same: `n` (40, 257) -> belly (40, 36) |
| customers | flat span `w` (473, 212) -> Inbox `e` (104, 212), 369 long, a rim pylon on Customers and 3 piers; Inbox's end has no pylon (its lift stands there): the last cable is a taut backstay to the span's own deck 14 px from Inbox | flat span `w` (357, 260) -> Inbox `e` (48, 260), 309 long, 2 piers, self-anchored the same way |

A phone's stack is taller than it is wide, so its trunk and Traffic's span are longer.

**Runway lamps.** Exactly 12 on every connector: its pylon and junction lanterns plus deck lanterns (3 x 4 on a 3 px post on the
back rail) or arm lanterns (on a lift), spread evenly over the free stretches, 12 px or more from a pylon (so the lit reach,
cut halfway between two lamps, never splits a pylon or its pier rock), clear of the cables, never closer than 10 px to each
other. Lamp 0 is the nearest the lit end along the belt: the Hub for Errors and Traffic on a desktop, the line's belly for
Inbox, the Inbox end for Customers, the bottom of the trunk for a phone's Errors, junction J's own lantern for a phone's
Traffic. Inbox's twelve are arm lanterns up its lift's sun side, from just under the line's rocks down to just above the
plinth, evenly apart. Lamp k lights at 0.06 k s; `litReach` grows the lit part halfway to the next lamp each time.

**Dark and lit.** Each connector has one dark picture, made once: painted with its lanterns off (`iron[1]` glass, an `iron[2]`
glint) and its belt at rest, then posterized (RGB sum < 60 `soot`, < 150 `iron[0]`, else `iron[1]`), never redrawn. The
lit picture (lanterns `brass[4]` with a `brass[5]` glint) is made per belt step, 14 at most, each the first time it is needed,
and drawn over the dark one clipped to the lit reach. Then each lit lantern's halo: a ring r 7-4 in `brass[3]` at 25% and a
ring r 4-2 in `brass[4]` at 50%, source-over, around (not over) the lantern. The belt runs toward the lit end in whole px
once the last lamp is on. The Hub's port belts run with the first feed whose belt runs (phase 0, at rest, until then and under
reduced motion). Errors', Traffic's and Inbox's belts wait for their island to finish lighting (lights, then the halo's bloom)
and never start before 1.3 s into the step, so one thing moves at a time.

**Draw order** (`drawBack`): the grow glow's warm-up of the sky, every connector's back part (spans, cables, lifts, piers,
junctions), the Hub, the islands, every connector's front part (rim pylons, foot plates, brackets), the islands' own lights,
every halo. Then the engine draws the line over all of it, and `drawFront` adds the arc, the capsule (in flight or on its pad,
with its puff) and the beacon.

`connectorBoxes(layout, manifest)` gives every member's box (spans, cables and lifts in 12 px chunks) with the connector it
belongs to. `deck2d-city.test.ts` checks that none of them is over another island's sprite or over any label or COMING SOON
plate (measured sizes) at k 1 on a 1280 x 720 desktop and a 390 x 844 phone.

### Arc, rocket, beacon, lights

The arc is 30 dots on a quadratic from the rocket spot (377, 25) to a point 16 px straight above the Customers pad. Dot 0 is
at the line's rocket and dot 29 over the pad: they light in that order, and the capsule flies them in that order. A 7 x 5
arrowhead points down at the pad while every dot is lit and the capsule is still on its way. Desktop: the control point puts
the curve's highest point exactly 70 px above the rocket spot, 0.3 of the way across, which keeps the dots clear of Marketing
and its plate. Phone: the curve bows right by **0.7** of the chord (round 1's 1.0 put the furthest dot near the right edge of
the Customers close-up; at 0.4 the curve is too short for 30 dots 9 px apart): its dots stay 9 px apart and, at the close-up
(k 2), 78 device px or more inside the right edge (94 on a 390 x 844 phone). While the camera is on another island, a phone
leaves out the dots that would sit in its caption band (`arcDotsShown`). Lit dots are 5 x 5, a soot outline round a `brass[4]`
bead with a `brass[5]` glint and a ring halo r 4-2 at 25%; dark ones the same 5 x 5, an `iron[1]` bead with an `iron[3]`
glint. The arc is dark whenever Customers is: a lit route to a dark island would imply Customers works.

The capsule is the line's rocket in small, 9 x 15: a copper nose 1, 3 and 5 px wide (`copper[3]`, its right edge `copper[4]`),
a 5 px body inside its soot outline (`haze[3]` on the left two columns, `white[0]` on the right three) with a 2 x 2 `energy[2]`
porthole, a `brass[4]` band, fins 2 px out each side (`copper[1]` in the shade, `copper[3]` in the sun) and an `iron[2]`
nozzle. A pose nose up and to the right (15 x 15, the side toward the sun white), a level one (15 x 9) and the upright rocket
with a 1 x 2 `sun[4]` flame under its nozzle carry it along the lit dots in whole px, then down onto the pad. On the pad, one
dust puff: three frames of 0.13 s, each a pair of 7 x 5 clumps (a soot outline round a `white[0]` top row and a `haze[3]`
body) 9, 15, then 21 px either side of its foot, the third a px higher, the first with an 11 x 1 `haze[2]` skirt under it.
Marketing's beacon, steady: rings r 14-9 `brass[3]` at 25% and r 9-4 `brass[4]` at 50% round a 3 x 3 `brass[5]` core with one
`white[0]` px. A lit island's own lights from the manifest, steady, never blinking: signal and pad
2 x 2 `brass[4]` with a `brass[5]` glint, window 2 x 2 `brass[4]`, thruster a 3 x 2 `energy[3]` core with a ring r 5-2 of
`energy[2]` at 25%, crack a ring r 6-3 of `sun[3]` at 25%; its lamp gets the lantern halo.

## Art

The ten sprites and `manifest.json` in `web/public/deck/art/city/` are generated, not hand-edited
(`python3 -I scripts/city-art.py --refs <folder with the five 1536x1024 paintings> --out web/public/deck/art/city --check`).
The paintings never enter the tree. `city/art.ts` (the first mockup's code-drawn islands) is **gone**: until the manifest and
the pictures load, the city draws the connectors and labels at the expected sizes and no islands. The ten webps start loading as
soon as the manifest arrives, well before the reveal needs them; a missing manifest means no further requests.

## Looking at it

```sh
bun run dev:web
open 'http://localhost:5173/deck.html?seed=1&source=demo&shot=city'          # the manual city, no card in the way
open 'http://localhost:5173/deck.html?seed=1&source=demo&shot=city-customers' # that island one step closer (a phone's close-up, a desktop's push-in)
open 'http://localhost:5173/deck.html?seed=1&reveal=1'                       # the story from the hero rocket to the sign-in card
open 'http://localhost:5173/deck.html?seed=1&reveal=1&speed=0.25'            # the same, slowly (min 0.1)
```

The Zoom button (top right, next to mute) cycles station -> line -> city -> station in every source and reads "Zoom out",
"Zoom out", "Zoom in". `body[data-deck-zoom]` is `station|line|city` and `body[data-city-beat]` is the story's beat (or empty).

**Shots.** `CITY=1 node scripts/shots/deck.mjs <outdir>` (add `ONLY=phone-390,desktop-1280`, `CLIP=31` for the clip from
rocket to card: the reveal runs 29.1 s, and a shorter clip is reported as "clip ends before the card"). Per view: `station.png`,
`line.png`, `city.png`, `reveal-line.png`, `reveal-lit.png`, `reveal-dark.png`, `reveal-card.png`, `report.json`. It exits 1 if a
label is clipped, a plate is off screen, the zoom is not a whole number, more than 48 colours are drawn, the page overflows
sideways, the captions are out of order, the manual city shows a caption, the card title is wrong, or the card ever says
"Finding your repositories…", changes height, wears a focus ring, wraps "Sign in with GitHub" or has a label under it.
Plain vite has no worker, so the script answers `/api/me` as a guest, after `ME_DELAY` ms (300 by default, so the card is shot
while it is still waiting; `STRICT=1` leaves it).

To step the reveal frame by frame, use Playwright's clock: `page.clock.install({ time: 0 })`, `page.clock.pauseAt(100)`
*before* `goto`, then `page.clock.runFor(16)` per frame. Screenshots of the canvas are then repeatable to the pixel (that is
how station zoom was checked to be identical to the tree before the city existed).

## Tests

`web/test/deck2d-city.test.ts` (the ring and the phone's spread, Inbox's lift, the connector kit and its pixels, chevrons, piers,
the sloped truss, lamps, room, arc and the capsule's flight, timeline, events, the grow glow's warm-up, pixel helpers, halving,
belts),
`deck2d-city-camera.test.ts` (the camera numbers, beat 3's push-ins and close-ups, the manual city's top reserve, the card, room
for labels and buttons), `deck2d-city-zoom.test.ts` (the three-step
cycle, `manualCity`, labels, the sign-in card, the module's events, the shots script's caption list). The reveal's own
clock is `story/reveal.ts` (`deck2d-story-city.test.ts`); the sounds are `deck2d-juice-city.test.ts`.

## Known limits

- The phone's ring is spread to the height of the screen it was laid out for (in steps of 8 px). A phone as short as an
  iPhone SE (375 x 667) fits it at k 1 with a smaller spread (1.19). Under about 580 CSS px of screen height (at dpr 2) even
  the plain ring (sy 1, 963 city px tall) no longer fits the usable height, and its top and bottom clip.
- On a phone the ring rises above the sign-in card when it fits there (it does on a 390 x 844 phone); on a shorter phone its top
  stays under the screen's top and the card covers its foot, as the brief has it ("the card slides up over the city").
- `labels.ts` hides a tag that reaches into the caption band; the manual city on a phone has no caption, so there it measures
  the bottom as `EDGE`, as its camera does.
- At beat 6 the connection card the sign-in is built on is dressed as the sign-in card from its first frame, also while it is
  still "Finding your repositories…" (`dressSignIn` in main.ts), so the card never changes words or height.
- A label the sign-in card would cover steps beside its island's sprite (left, else right, else above) when its plate drops in
  the dim, so nothing moves while the card slides up. If only its plate would be covered the plate hides and the label stays;
  if no spot is clear the tag hides (`cardAt` in labels.ts says where the card settles).
- Silkscreen is an 8 px grid font: the labels, plates and a phone's city caption are 12 px (3 device px per font px at dpr 2)
  and the city's text turns font smoothing off. A 14 px caption (a phone's line caption) is not a multiple of the grid and may
  render a touch soft on some screens.
