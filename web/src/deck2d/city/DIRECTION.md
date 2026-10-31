# The city, round 2: art direction

Written 2026-10-29 (evening) after Justin saw round 1. It turns his three changes into one plan that four builders can
carry out in parallel. **Where this file and `SPEC.md` disagree, this file wins.** `BRIEF.md` (Justin's direction at the
top) wins over both.

Justin: "I think this looks really good." Then three changes, and one more art pass so everything matches:

1. The islands look too alike: same pointy tip under, same flat platform on top. Each needs its own silhouette, top and
   underside.
2. Describe each island as it lights, and name the integrations: Sentry, Cloudflare, PostHog, customer acquisition and
   automated marketing, the email inbox and support tickets. Keep it honest: these are coming. They don't work yet.
3. The bridges "look like a two-year-old drew it". Redo them as engineering that could really link floating islands.

Still true: the line ("YOUR REPO") is the hero, the biggest and brightest island. Every art rule in `BRIEF.md` and
`docs/context/pixel-deck.md` applies in full: `ART_PX = 5`, whole-number zoom, nearest-neighbor, the 48 `PALETTE`
colours, partial alpha only for glow halos, light from the upper right, 1 px dark outlines, one thing moves at a time,
nothing flashes, no humans, original art only.

Units: **city px** is the city's own art grid (1 city px = `CITY_PX` = 10 world units = 2 deck art px). Every size below is
in city px unless it says CSS px. At city zoom on a 1280x720 desktop, 1 city px = 1 screen px. On a 390 px phone (dpr 2) it
is 1 device px = 0.5 CSS px, so a DOM label is twice as many city px as CSS px.

What round 1 got right and keeps: the ring idea, the sunset sky, keying by alpha, the palette snap, the pixel grid,
the reveal clock (`CITY_TIMING` is unchanged), the sounds, the labels as DOM text, captions in `#toast`.

---

## A. Five island forms

### The common recipe (all five)

- **One painting scale.** Every surviving painting crop is downscaled at `PAINT_SCALE = 7.5` painting px per city px,
  nearest-neighbor (the source pixel under each cell's centre), then palette-snapped in CIELAB as today. One scale for all
  five, so a door, a lamp or a cart is the same size on every island. Round 1 scaled each painting to 298 px wide, which made
  every island a big flat disc.
- **What survives from a painting:** only the buildings and the deck surface they stand on (the crop boxes below). The rim
  band, the copper pillars and the hanging rock wedge of every painting are thrown away: they are why all five looked alike.
- **What replaces it:** a new base drawn in palette indices by `scripts/city-art.py` (a deck outline, a rim and an
  underside, different for each island), with the crop composited on top. Rock is shaded the way the line's underside is
  (`web/src/deck2d/props/underside.ts`: boulders lit on their upper right, dark crevices, facets), at half its size so it
  matches the line as the city shows it: big stones `BIG = 9` city px, facets `FACET = 4`, ramp
  `soot, iron[0], iron[1], brass[0], iron[2], plate[1], plate[2], plate[3]`.
- **Why python, not runtime drawing:** every base is static, so it belongs in a picture (pixel-deck rule: pictures for
  static city art, code for what moves). Python makes it once, `city-art.py --check` and `city-art.test.ts` audit it, and the
  runtime only draws what moves or lights (lamps, lights, halos, beacon, capsule). Nothing here is drawn per frame that
  does not change.
- **Warm, not steel.** After the snap, remap the cold ramp: `steel[0] -> iron[0]`, `steel[1] -> iron[1]`,
  `steel[2] -> plate[2]`, `steel[3] -> plate[4]`. Keep the `energy` cyans (crystals, thrusters).
- **The line stays brightest.** In lit island sprites remap `white[0] -> haze[3]`, `brass[5] -> brass[4]`,
  `sun[6] -> sun[5]`, `energy[3] -> energy[2]`, except within 2 px of the manifest's `lamp`, `pad` and `beacon` points.
  At most 16 px of `white[0]` plus `brass[5]` per lit sprite.
- **Sun rim, lit:** an opaque, non-outline pixel whose upper or right neighbour is the outline or transparent becomes
  `plate[3]`. The 1 px `soot` outline goes round everything, holes included, as today.
- **Dark keeps relief.** Dark is the lit sprite (before its sun rim) posterized by the CIELAB L of each pixel's lit colour:
  L < 20 `soot`, L < 40 `iron[0]`, otherwise `iron[1]`. Then a rim light: the same upper-or-right edge rule as the lit sun
  rim, in `plate[1]`. The outline stays `soot`. Errors keeps its crack: lit `jam[2]` -> dark `jam[1]`, lit `jam[1]` and
  `jam[0]` -> dark `jam[0]`. Allowed dark colours: `soot, iron[0], iron[1], plate[1]` (plus `jam[0], jam[1]` on Errors).
  Same silhouette as lit, so the city can dither one over the other.
- **Distinct on purpose.** No two islands share an underside shape, a deck outline or a height class:

| Island | Form | Sprite w x h | Deck outline | Underside | Height class |
| --- | --- | --- | --- | --- | --- |
| Traffic | rail slab | 200 x 78 | long thin strip | four braced legs, no rock mass | low, 72-80 |
| Customers | landing disc | 196 x 96 | flat ellipse | shallow saucer with three thrusters | medium, 92-100 |
| Errors | caldera | 156 x 128 | peaked cone with a crater | three jagged basalt prongs | tall, 124-132 |
| Marketing | beacon rock | 76 x 148 | bare rock, iron foot plate | one round boulder, two pebbles | mast, 144-152 |
| Inbox | post tower | 64 x 176 | small square plinth | a riveted iron shaft | tallest, 172-180 |

Sizes include the 1 px outline. Widths are exact; heights may land within +-3.

### A1. Errors: the caldera (156 x 128)

```
                      _/\_  _/\
        [hut]  o     / \\  \/  \_        crater at the summit, glowing crack (jam)
     ___|#|##|_|___ /   \\       \
    /____ledge_____/  /\ \\  /\   \__    rim line at y 60: the widest row
    \  /\   basalt  /\/  \\/  \  / /     columns lit on their right faces
     \/  \    /\   /      \\   \/ /      the crack runs down the right flank
          \  /  \ /   /\   \\    /
           \/    V   /  \   \\  /        three prongs, not one tip:
                 |  /    \   \\/         left 104, main 127, right 110
                  \/      \  /
```

- **Survives:** the hut with its waveform monitor, the tank and the lamp post. Crop painting box `(100, 30, 610, 330)`
  (about 68 x 40 city px), feet on the ledge at y 44, left edge at x 8.
- **Replaced:** the whole flat rocky deck, the rim band and the rock wedge. New base: a basalt cone. Summit at (104, 6),
  crater bowl x 92-126, y 8-22. A flat ledge at y 44 from x 6 to x 80 for the hut. Flanks fall to the rim at y 60 (x 1-154).
  Underneath, three jagged prongs of vertical basalt columns 4 to 6 px wide (right face `plate[2]`/`iron[3]`, left face
  `iron[0]`): left tip (40, 104), main tip (84, 127), right tip (122, 110). Sawtooth edges, no rounded boulders.
- **The crack** (the island's identity): a polyline from the crater (108, 18) down the right flank to (130, 58) and on
  under the rim to (96, 100). Lit: 2 px `jam[2]` core, 1 px `jam[1]` edges, 1 px `sun[4]` glow outside. At least 350 jam
  pixels lit. Dark: `jam[1]` core, `jam[0]` edges.
- **Points:** lamp = the painting lamp's glass (about (70, 19)); anchors `e (151, 60)`, `w (4, 60)`, `n (44, 44)`,
  `s (84, 120)`; label `(78, 131)`; lights: three `crack` points on the polyline.

### A2. Traffic: the rail slab (200 x 78)

```
     _#_         ______gantry______              _crane_
    |#|#|  o    |  o           o  |       ___   /  \   \
    |#|#|__|____|[cart]________[cart]____|###|_/____\__O    rail yard (the painting's deck surface)
   =====================================================    iron slab, 6 rows: sun lip, riveted face
   o     o     o     o     o     o     o     o              8 signal lights along the face
     ||          ||          ||          ||                 four legs, X-braced between them
     /\          /\          /\          /\                 each leg ends in a small rock clump
```

- **Survives:** the stack and pump house, the gantry, both carts on their rails, the crane and the crates. Crop painting box
  `(20, 0, 1510, 470)` (about 198 x 63).
- **Replaced:** the rim band and the rock wedge. New base: a flat iron slab, rows 63-68: top row `plate[3]` sun lip, face
  `plate[1]` with a `brass[2]` rivet every 6 px, bottom row `iron[0]`, `soot` outline. Under it four lattice legs at x 22,
  74, 126, 178 (4 px wide, 8 px tall, `iron[1]` with an `iron[3]` right edge), an X brace of 1 px `iron[1]` between each
  pair, and an 8 x 5 rock clump under each leg. No rock mass, no point.
- **Points:** lamp = painting lamp glass (about (68, 35)); anchors `e (197, 64)`, `w (2, 64)`, `n (126, 58)` (deck top
  between the second cart and the crane: a phone lift tower can stand there), `s (100, 72)`; label `(100, 81)`; lights:
  eight `signal` points on the slab face at x 12 + 24 i (i = 0..7), y 66.

### A3. Inbox: the post tower (64 x 176)

```
          ^
         /#\          spire (painting)
        |#==|
        |[@]|   =     envelope window; the lift tower stands at x 54
       _|#__|___|_    plinth: 64 wide, rows 68-77, brass trim
       \##########/
        |[]  ()  |    riveted iron shaft, 40 wide (x 12-51), rows 77-160
        |    ()  |=   brass band every 16 px, round portholes,
        |[]  ()  |=   three copper mail pipes down its right face
         \######/     stepped taper: 32 wide, then 20 wide (rows 160-172)
          \_**_/      cap with one cyan crystal cluster
```

- **Survives:** the post tower with its envelope window, door and steps. Crop painting box `(290, 0, 560, 512)` (about
  36 x 68), placed with its left edge at x 4.
- **Replaced:** the round deck, the shed, the pipes to the shed, the rim and the rocks. New base: a riveted plinth
  (x 0-63, rows 68-77, `brass[2]` top trim, `plate[1]` face), a riveted iron shaft (x 12-51, rows 77-160, `iron[1]` with an
  `iron[3]` right edge, `brass[2]` bands every 16 px, two portholes per band), three 2 px copper pipes
  (`copper[1..3]`) down its right face, a stepped taper and a cap with one `energy` crystal cluster. A small lamp post on the
  plinth at x 5 (a 3 x 3 lantern like the bridge lanterns in section B).
- **Points:** lamp `(5, 58)`; anchors `n (54, 69)` (where the lift tower stands), `e (62, 72)` (where the Customers span
  lands), `w (1, 72)`, `s (32, 172)`; label `(32, 179)`; lights: four `window` points at the portholes.

### A4. Customers: the landing disc (196 x 96)

```
   _[ vault ]_   _/\_ _/\_      ___ pad ___
  |   (@)    |__|stall|stall|__/  ( O )    \      vault, market stalls, landing pad (painting)
 (o====o====o====o====o====o====o====o====o==)    elliptical rim, 8 rows, a ring of 12 pad lights
  \_______________________________________/       shallow saucer, panel seams, 20 rows
        \_/            \_/            \_/         three thruster bells, cyan glow under each
```

- **Survives:** the vault with its brass wheel, the four market stalls, the landing pad ring and the lamp. Crop painting
  box `(30, 40, 1500, 460)` (about 196 x 56).
- **Replaced:** the rim band and the rock wedge. New base: an elliptical rim band, rows 56-63 (`brass[2]` top lip,
  `plate[1]`/`iron[2]` panels, `plate[3]` sun lip on its right third), a shallow saucer under it (a half ellipse x 8-188,
  rows 64-84, `iron[1]`/`iron[2]` panels with `iron[0]` seams every 12 px), three thruster bells (10 x 8, `iron[2]` with
  `brass[2]` rims) at x 48, 98, 148, an `energy[1]` throat in each. No rock.
- **Points:** lamp = painting lamp glass (about (146, 20)); pad = the painting pad's centre (about (164, 43)); anchors
  `w (3, 60)`, `e (193, 60)`, `n (40, 30)`, `s (98, 92)`; label `(98, 99)`; lights: twelve `pad` points along the rim
  face, three `thruster` points at (48, 90), (98, 90), (148, 90).

### A5. Marketing: the beacon rock (76 x 148)

```
            o            beacon ball (the runtime draws its glow)
            #
           /#\           lattice mast, 92 tall, 5 wide, X-braced, brass collar every 16 px
          / # \          three guy wires (1 px iron[2]) down to the rock's edges
         /  #  \
        /   #   \
       /  _[#]_  \       mast base ring (painting)
      /__/#####\__\      iron foot plate on the rock's top
      (  boulder  )      one round boulder, 76 x 44, no point
        o      o         two loose pebbles under it
```

- **Survives:** the mast's base ring with its brass guy-wire anchors. Crop painting box `(700, 300, 1210, 430)` (about
  68 x 17).
- **Replaced:** the whole big flat deck, the rim and the rock wedge. New base: one round boulder (x 0-75, rows 100-144,
  boulder shading), a 40 x 3 iron foot plate on its top, the base ring on the plate, and a lattice mast drawn in python
  (rows 6-98, 5 wide, `iron[1]` left chord, `iron[3]` right chord, `iron[2]` X braces every 6 px, `brass[2]` collars every
  16 px), a 5 x 5 brass ball at its tip (lit `brass[4]`, dark `iron[1]`), three guy wires and two pebbles (3 x 2) under.
  The painting's mast is too short at this scale, so the mast is drawn, not cropped.
- **Points:** anchors `{}` (no bridge); lamp `null`; beacon at the mast tip; label `(38, 153)`; lights: four signal lamps
  on the foot plate and four 2 x 2 windows on its lugs and the guy collar (round 2; manifest.json has the exact points).

---

## B. The connector system

One kit, five parts, all drawn by the runtime in city px (`city/connector.ts`). It reads as a real system: towers footed on
rims, cables in a sag, hangers, a riveted truss deck carrying the belt, cross-bracing, brass lanterns on the towers.

### Parts (city px; deck art px = 2x these)

1. **Pylon** (the end of a span on an island rim, and every mid pier).
   A-frame lattice tower, 30 tall above the belt's top rail, 9 wide at the foot, 5 at the top. Legs 1 px: left `iron[1]`,
   right (sun side) `iron[3]`. An X brace every 6 px in `iron[2]`. `soot` outline round the legs. Foot plate 11 x 2
   `iron[2]` with a `soot` outline, bolted to the rim at the anchor. Cap: a 7 x 3 saddle, `brass[2]` with a `brass[3]` top
   row, where the cables rest. On top, a **lantern** on a 1 x 2 `iron[2]` stem: 5 wide x 7 tall (3-px `soot` cap row, a
   5 x 4 body with a `soot` outline round a 3 x 2 glass, 3-px base row). Glass off `iron[1]` with an `iron[2]` top-right
   px; on `brass[4]` with a `brass[5]` top-right px.
2. **Span** (a straight run between two pylons, or a pylon and a hub). Slope exactly 0, +-1/4 or +-1/2 (dy/dx). Cross
   section, top to bottom, the same at every column:
   - belt band, 7 rows: `soot` / back rail `iron[2]` with a `brass[2]` stud every 8 px / three rows of belt plates (`iron[3]`
     top, `iron[2]`, `iron[2]`, a `soot` seam every 7 px, shifted by the belt step when it runs) / front rail `iron[1]` /
     `soot`. Same look as the line's belt halved, so they read as one set.
   - truss, 8 rows: top chord `iron[2]` with an `iron[3]` sun lip, a Warren pattern of 1 px `iron[1]` diagonals in 12 px
     bays (one up, one down per bay), a 1 px `iron[1]` vertical every 12 px with a `brass[2]` rivet at its top, bottom chord
     `iron[0]`, `soot` outline row. The underside of the deck is in shadow: no lit pixel under the top chord except the
     verticals' rivets.
   - **Main cables**: saddle to saddle, 1 px `iron[3]` with a 1 px `soot` line under it, a parabola sagging
     `clamp(round(0.12 * length), 6, 24)` px below the straight saddle line, never closer than 4 px to the belt's top rail.
   - **Hangers**: 1 px `iron[2]`, vertical, every 6 px from cable to back rail.
   - **Mid piers**: a span longer than 120 px gets mid pylons at even spacing, at most 120 apart. Each mid pylon stands on
     a lattice leg 16 px under the deck that ends in a **pier rock** (14 x 8, boulder shading, `soot` outline): the bridge's
     own floating support. Cables sag between each pair of saddles.
   - Horizontal spans may keep `beltRun` at `ART_PX`, halved (as round 1). Sloped spans draw the same 7-row band column by
     column in city px: the band's top row at column x is `round(ya + (x - xa) * slope)`, so a 1/2 slope steps 1 px every
     2 columns (clean pixel-art stairs), seams stay vertical, truss verticals stay vertical.
3. **Lift** (a vertical run, for an island straight above or below what it feeds).
   A lattice tower 13 wide: left chord `iron[1]`, right chord `iron[3]`, a K brace every 8 px in `iron[2]`, `soot` outline.
   Inside, a 7-wide belt standing up (`beltRunV` look: plates 7 tall, `soot` seams). It stands on the lower body (its foot
   plate on that rim) and is braced to the upper one with a 6 x 3 iron bracket. Lanterns on 3 px arms on the sun (right)
   side.
4. **Junction tower** (where a run turns, or where a phone span meets a lift).
   15 wide x 15 tall lattice block, `iron[2]` frame, `soot` outline, a 7 x 7 brass gear housing (`brass[2]` ring,
   `brass[3]` hub, `iron[1]` spokes) where the belt turns, a lantern on top.
5. **The Hub** (the line's west end, where ore enters at Repo). A junction tower 15 x 50 at x -18..-4, y -6..44, bolted
   to the line's west end face with two 4 x 3 iron brackets. Ports (belt centre): upper west (-18, 16), lower west
   (-18, 30), top (-11, -6), bottom (-11, 44). Its gears turn every incoming belt east into the line. Drawn in `drawBack`,
   behind the line.

### Lit and dark

- **Dark** (`lit 0`): the whole connector posterized once and cached: sum RGB < 60 `soot`, < 150 `iron[0]`, otherwise
  `iron[1]`. Lanterns off, no halos, belt at rest (phase 0). Never redrawn per frame.
- **Lit**: full colours, lanterns `brass[4]`, each with a halo of two rings drawn source-over (never additive): r 7 to 4 in
  `brass[3]` at 25%, r 4 to 2 in `brass[4]` at 50%. The lit picture is clipped to the lit reach over the dark cache, as
  round 1 does.

### The runway (beat 3) and the belt

- **Every connector carries exactly 12 runway lamps** (`CITY_TIMING.lamps`): its pylon and junction lanterns plus deck
  lanterns spaced evenly between them (a 3 x 4 lantern on a 3 px post on the back rail), never closer than 10 px. Marketing
  has none. So every island gets the same 0.66 s runway (round 1's Inbox had four lamps: a blink).
- Lamp 0 is the lantern nearest the lit end: the line end (the Hub, or the line's belly for Inbox) for Errors, Traffic and
  Inbox, the Inbox end for Customers, and on a phone the junction on the Errors trunk for Traffic. Lamp k lights at
  `s = 0.06 k` (`CITY_TIMING.lamp`), from the line outward, pylon to pylon. The lit part grows lamp by lamp (`litReach`).
- The belt starts once the last lamp is on, at the line's belt speed, moving in whole city px (`beltStep`), toward the line
  (toward Inbox for Customers). Reduced motion: lamps all on at once when the island lights, belt still.

### Routing rules

- Spans are straight, island to island: slope 0, +-1/4 or +-1/2 only. Lifts are vertical. A run turns only inside a
  junction tower or the Hub.
- No member within 24 CSS px of a screen edge at the ring framing. No member through a label or a COMING SOON plate. No
  member over another island's sprite box (only its own two ends touch islands). Inbox's lift may pass behind the line's
  rocks.
- Island positions are **derived from the anchors** so the slopes come out exact: `layout.ts` computes each island's x
  from the anchor, the port and the slope, so a +-2 px change in the art never bends a span.

### Desktop ring (start values; top-left of each sprite, city px)

```
                                                          [MARKETING] (600,-180)
   [ERRORS] (-365,-142)                                       beacon, no bridge
          \  span, slope 1/2, 1 mid pier
           \______                 ....dotted brass arc....
                  [HUB]==[ THE LINE  (-2,-3)..(397,80) ]       .
           _______/  |                                    [CUSTOMERS] (470,152)
          /  span,   | lift (x 96) into the line's belly           |
   [TRAFFIC] (-393,55)  slope -1/2, 1 mid pier                     |
                     [INBOX] (42,140) =====span, flat, 3 piers=====/
```

- Errors: span from `e` (-214, -82) to the Hub's upper west port (-18, 16): dx 196, dy 98, slope 1/2.
- Traffic: span from `e` (-196, 119) to the Hub's lower west port (-18, 30): dx 178, dy -89, slope -1/2.
- Inbox: lift from `n` (96, 209) up into the hull front (96, 36), behind the line's rocks. Clear of the line's label
  (x 141-253 with its chip at 16 px).
- Customers: flat span from `w` (473, 212) to Inbox `e` (104, 212), 369 long, three pier rocks.
- Marketing: no connector.
- Ring box about x -413..730, y -200..387: 1143 x 587, inside the 1264 x 608 usable at 1280x720 (k 1) and at k 2 on a
  retina 1280x720.

### Phone arrangement (390 x 844 @2; a zigzag around one trunk)

```
                         [MARKETING] (440,-520)
   [ERRORS] (-5,-400)
   |  trunk lift on x -11, Errors' west end docks to it
   |
   J==============span, flat, 2-3 piers============[TRAFFIC] (330,-214)
   |
  [HUB]==[ THE LINE ]
      | lift (x 40)
  [INBOX] (-14,150) =======span, flat, 2 piers=======[CUSTOMERS] (330,162)
```

- Errors: the **trunk**, a lift on x -11 from the Hub's top port (-11, -6) up to Errors' `w` anchor (about y -340), with a
  6 px bracket to the rim. Errors sits right of the trunk, so its label and plate (152 city px wide at k 1) clear it.
- Traffic: a flat span from `w` (332, -150) west to junction J on the trunk at (-5, -150). Its lit end is J (the trunk is
  already lit: Errors lit first). The span passes 110 px above the line and below Errors' plate.
- Inbox: lift from `n` (40, 219) up into the line's belly at x 40 (clear of the line's label, x 111-283 at 12 px).
- Customers: flat span from `w` (333, 222) to Inbox `e` (48, 222).
- Ring box about x -78..574, y -540..421: 652 x 961 at k 1 inside 748 x 1496. Everything sits above the sign-in card.
  The builder may spread y by up to 1.25x to use the height.

### The rocket arc (Customers)

- 30 dots (`CITY_TIMING.arcDots`) from the line's rocket spot (377, 25) to the Customers pad, a quadratic curve.
  Desktop: the control point is chosen so the curve's highest point is 70 px above the rocket spot (apex about
  (505, -45)). Phone: it bows right by 0.6 of the chord (apex about 64 px right of the chord), staying 24 CSS px inside the
  screen.
- Each dot 5 x 5: `soot` outline, 3 x 3 body. Lit: `brass[4]` with a `brass[5]` top-right px and a ring halo r 4 to 2 at
  25%. Dark: `soot` body with an `iron[2]` top-right px. Spacing at least 11 px along the curve. A 7 x 5 `brass[5]`
  arrowhead at the pad end while lit.
- The capsule is the line's rocket in small: 7 x 15, `white[0]`/`haze[3]` body, `copper[3]` nose, `brass[4]` band, fins,
  `soot` outline, light upper right. It sits on the pad at `s = 1.46`. One dust puff: three frames of 0.13 s, each a pair
  of 3 x 2 clumps (`haze[3]` top row, `haze[2]` bottom), out to 6, 9 and 12 px either side of the foot, then gone.
- Lit only while Customers is lit (round 1 decision 7.6 stands).

---

## C. The captions

Each island gets two lines. Plain words, honest tense: what **will** come in, never what works today. The plates say COMING
SOON and the card says "The rest lights up later."

**The band.** `#toast` is 14 px Silkscreen on a phone, `width: calc(100% - 24px)` = 366 CSS px at 390. Silkscreen is
proportional (m and w are 12.25 px, i is 5.25 px, a space 7 px at 14 px), so the limit is a width, not a character count:
**every line at most 340 px at 14 px** (13 px of air each side). In practice that is 33 characters or fewer of ordinary
text. Desktop is 24 px with `max-width: 960px`; the longest line below is 552 px there. Widths measured in Chromium with
`web/public/fonts/silkscreen-400.woff2`:

| Island | Line 1 (chars, px at 14) | Line 2 (chars, px at 14) |
| --- | --- | --- |
| Errors | Sentry will send in the crashes (31, 292) | from your real product. (23, 222) |
| Traffic | Cloudflare and PostHog will show (32, 310) | how people move through your app. (33, 322) |
| Inbox | Your email inbox and support (28, 273) | tickets will come in here. (26, 229) |
| Customers | Rockets will land here. Funnels (31, 291) | will show where people drop off. (32, 298) |
| Marketing | Customer acquisition comes next: (32, 303) | plan and automate your marketing. (33, 322) |

Unchanged, one line each: "That's one line." (140), "Here's the rest of the factory." (280), "The factory must grow." (212),
"For now: one line. Your repo." (266). Card unchanged: "Start with your repo.", "GitHub first. The rest lights up later.",
"Sign in with GitHub", "Replay". Plate: "Coming soon".

**How two lines show.** Each island's caption is one string with a `\n` between its lines
(`CITY_COPY.island.errors = "Sentry will send in the crashes\nfrom your real product."`). `#toast` keeps getting it through
`textContent` (the existing `aria-live="polite"`, `aria-atomic="true"`, `role="status"` element), so a screen reader hears
one sentence. One CSS rule shows the break: `body[data-deck-zoom="city"] .toast { white-space: pre-line; line-height: 1.25; }`
(scoped to the city, so no other caption changes). The caption band at city zoom grows to fit two lines:
`BAND = { landscape: 96, portrait: 80 }` CSS px (24 px x 1.25 x 2 = 60 + 24 bottom on desktop; 14 x 1.25 x 2 = 35 + 24 on a
phone).

**When each caption shows.** An island's lines switch in **when the camera arrives** at it (0.6 s into its 2.2 s turn), not
when it lights (1.44 s). Round 1 left the previous island's line under the new island for most of each turn on a phone.
The line is then up for 1.6 s and never sits under the wrong island.

---

## D. The hero line

- **Scale step.** At city zoom the line is drawn one zoom step smaller (halved 2:1), `LINE_BOX` 399 x 83 city px, its deck
  300 wide. Every island is at most 200 wide (0.67 of the deck), and every island's opaque pixel count is at most 12,500
  (0.38 of the line box's 33,117). Only Inbox (176) and Marketing (148, mostly mast) are taller than the line, and both are
  76 px wide or less. Round 1's islands were 300 wide and 191-211 tall: each outweighed the line about two to one.
- **Brightness.** Lit islands top out at `haze[3]`, `brass[4]`, `sun[5]`, `energy[2]` outside their lamps (section A).
  The line keeps its whites, `brass[5]` lanterns and cyan cores, so it is the brightest thing on screen at every beat.
- **Grow glow.** From the start of beat "grow" (t 19.5) to the start of "dim" (22.0), and on the manual city never, the city
  draws a backlight behind the line's hull, before the line, in `drawBack`: an ellipse centred on (150, 40) city px, two
  rings drawn source-over: rx 196 / ry 78 to rx 172 / ry 66 in `sun[5]` at 25%, and rx 172 / ry 66 to rx 150 / ry 54 in
  `brass[4]` at 25%. It switches on and off as a step (no fade), the same under reduced motion. It is the one glow on screen
  during "The factory must grow." Nothing else lights then.
- **Its label** stays `brass[5]` (#fdec9a) on a soot chip, the brightest label in the ring.

---

## E. Builders

Four builders, strictly disjoint files. A file never appears in two lists; a builder creates new files only inside its own
globs. Nobody edits `BRIEF.md`, `SPEC.md` or this file. If a builder needs a change in someone else's file, it says so in
its final report with the exact diff and does not make it.

### Who owns what

| Builder | Model | Files |
| --- | --- | --- |
| islands | opus | `scripts/city-art.py`, `web/public/deck/art/city/**`, `web/src/deck2d/city/manifest.ts`, `web/test/city-art.test.ts` |
| connector | opus | `web/src/deck2d/city/layout.ts`, `web/src/deck2d/city/draw.ts`, `web/src/deck2d/city/index.ts`, `web/src/deck2d/city/timeline.ts`, `web/src/deck2d/city/connector.ts` (new), `web/src/deck2d/city/README.md`, `web/test/deck2d-city.test.ts` |
| camera | opus | `web/src/deck2d/city/camera.ts`, `web/src/deck2d/engine/**`, `web/test/deck2d-city-camera.test.ts` |
| copy | sonnet | `web/src/deck2d/contract.ts`, `web/src/deck2d/story/reveal.ts`, `web/src/deck2d/city/labels.ts`, `web/src/deck2d/deck.css`, `web/src/deck2d/main.ts`, `web/deck.html`, `scripts/shots/deck.mjs`, `web/test/deck2d-city-zoom.test.ts`, `web/test/deck2d-story-city.test.ts` |

Tests nobody edits that must stay green: `web/test/deck2d-juice-city.test.ts`, `deck-juice.test.ts`, `deck2d-story.test.ts`,
`deck2d-front-door.test.ts`, `deck2d-belt.test.ts`, `station-names.test.ts`, and every other suite `bun run check` runs.

### The manifest contract (pinned)

`web/public/deck/art/city/manifest.json` is **written only by islands** (`scripts/city-art.py`) and read at runtime
through `city/manifest.ts` (also islands). connector reads it through the `CityManifest` type; camera reads it through
`islandRect` and `labelAt` in `layout.ts`.

- **Stay, same meaning:** `version: 1`, `unit: "city-px"`, and per island `lit`, `dark`, `w`, `h`, `lamp`, `label`,
  `pad`, `beacon`, `colors`, `bytes`.
- **Stay, new meaning:** `anchors` (`n`, `e`, `s`, `w`, all four on errors, traffic, inbox, customers; `{}` on marketing):
  the **foot points where a pylon, lift or span end stands**, on an opaque pixel of the rim or deck top, positions in the
  section A tables. The old "2 px inside the rim edge" rule goes.
- **Added:** `form` (`"caldera" | "rail-slab" | "post-tower" | "landing-disc" | "beacon-rock"`), `opaque` (the lit
  sprite's count of opaque px), `lights` (`{ at: [x, y], kind: "signal" | "pad" | "thruster" | "window" | "crack" }[]`).
  All three are required in the file. `parseManifest` defaults them when missing (`form` from the island, `opaque` 0,
  `lights` []) so older fixtures still parse.
- **Sizes:** `EXPECTED_SIZE` = errors 156 x 128, traffic 200 x 78, inbox 64 x 176, customers 196 x 96,
  marketing 76 x 148 (w exact, h +-3). `fallbackManifest()` returns these sizes and the section A anchor, lamp, pad, beacon
  and label numbers, so connector and camera can build and test before the art lands.
- Anchors, lamp, pad, beacon and label in the shipped file land within 2 px of the section A numbers.

### Pinned numbers between camera, connector and copy

- `camera.ts` keeps exporting `BAND`, `EDGE`, `RING_PAD`, `LABEL_CSS`, `labelCss`, `isBig`, `usable`, `ringBox`, `ringK`,
  `islandBox`, `cityCamera(view, screen, layout, manifest)` with today's signatures. `BAND = { landscape: 96, portrait: 80 }`.
  `LABEL_CSS = { big: { text: 20, plate: 24 }, small: { text: 16, plate: 16 }, gap: 4 }`.
- `deck.css` (copy) makes those boxes true: `.city-label` 16 px (big) / 12 px (small), `padding: 2px 4px`,
  `line-height: 1`; `.city-plate` 16 px (big) / 8 px (small), `padding: 2px 6px` (big) / `2px 4px` (small),
  `border: 2px solid #422616`, `line-height: 1`. Big = min-width 900 px and min-height 560 px, as today.
- `layout.ts` keeps exporting `LINE_BOX`, `LINE_LABEL`, `ROCKET_SPOT`, `ringLayout(portrait)`, `islandRect`, `at`,
  `labelAt`, `anchorAt`, `bridgePaths(layout, manifest): Record<BridgeId, Path>` (each connector's belt centre line, island
  end first, lit end last; segments may now be sloped 0, +-1/4, +-1/2 or vertical), `bridges`, `arcPoints`, `BRIDGE_IDS`,
  `ARC_DOTS`, and adds `connectorBoxes(layout, manifest): Rect[]` (every member's bounding box, for overlap tests).
- `labels.ts` keeps `createLabels(host)` and `place(view, places, lit)` unchanged in signature.
- `CITY_TIMING` is unchanged. Every connector has exactly 12 lamps.

### islands (opus)

Files: `scripts/city-art.py`, `web/public/deck/art/city/**`, `web/src/deck2d/city/manifest.ts`, `web/test/city-art.test.ts`.

1. In `city-art.py` replace "scale every painting to 298 wide" with one `PAINT_SCALE = 7.5` and the five crop boxes of
   section A; composite each crop onto a new palette-drawn base per island (`FORMS` table, one function per form).
2. Draw the five bases exactly as section A specifies (outline, rim, underside, sizes 200x78, 196x96, 156x128, 76x148,
   64x176), shading rock with a python port of the line's boulder recipe at `BIG = 9`, `FACET = 4`.
3. Add the warm remap, the brightness cap, the lit sun rim and the new dark rule (3 tones by CIELAB L 20/40, `plate[1]`
   rim) from section A; Errors' crack at least 350 jam px lit, `jam[1]`/`jam[0]` dark.
4. Write `form`, `opaque` and `lights` into manifest.json and the section A anchors (foot points), lamp, pad, beacon and
   label, each within 2 px; keep `version: 1`.
5. Update `--check` and `--self-test`: new sizes (w exact, h +-3), dark colours `soot, iron[0], iron[1], plate[1]`
   (+ `jam[0], jam[1]` on Errors), at most 16 px of `white[0]` + `brass[5]` per lit sprite, `opaque <= 12500`, `w <= 200`,
   anchors on opaque px (drop the 2-px-inside-the-rim rule), every file under 80 KB.
6. Run it with `--refs <city-refs dir> --sheet <scratchpad>/city-shots/round2-sheet.png` and look at the sheet; the five
   silhouettes must be told apart at 1x lit and dark.
7. `manifest.ts`: the new `IslandArt` fields, `EXPECTED_SIZE` and `fallbackManifest()` from section A, `parseManifest`
   defaults for missing `form`/`opaque`/`lights`.
8. `city-art.test.ts`: assert the new sizes, the dark colour set, `opaque <= 12500`, `w <= 200`, five distinct `form`s,
   five distinct height classes (72-80, 92-100, 124-132, 144-152, 172-180), `lights` inside the sprite.

### connector (opus)

Files: `city/layout.ts`, `city/draw.ts`, `city/index.ts`, `city/timeline.ts`, `city/connector.ts` (new), `city/README.md`,
`web/test/deck2d-city.test.ts`.

1. Build the section B kit in `connector.ts`: pylon, span (flat and sloped, cables, hangers, piers), lift, junction tower,
   Hub, with the dark cache and the lit clip; retire round 1's thin truss and junction plates in `draw.ts`.
2. `layout.ts`: the section B desktop ring and phone zigzag, island x derived from anchors so slopes are exact; 12 lamps
   per connector; phone Traffic ends at junction J on the Errors trunk.
3. Draw manifest `lights` when an island is lit (from `s >= 0.84`): signal and pad 2 x 2 `brass[4]` with a `brass[5]`
   top-right px; window 2 x 2 `brass[4]`; thruster a 3 x 2 `energy[3]` core with a ring halo r 5 to 2 `energy[2]` at 25%;
   crack a ring halo r 6 to 3 `sun[3]` at 25%. Steady, never blinking.
4. Halos: replace the stacked additive discs with source-over rings (lamps r 7-4 at 25% + r 4-2 at 50%; beacon r 8-5
   `brass[2]` 25%, r 5-2 `brass[3]` 50%, core `brass[5]`).
5. The arc, capsule and puff of section B (5 x 5 dots, desktop apex 70 px above the rocket spot, phone bow 0.6, 7 x 15
   capsule, 3 x 2 clumps out to 12 px).
6. The dither in 2 x 2 px cells (`((x >> 1) + (y >> 1)) & 1`); on dim, show that checker for 0.12 s before dark (not under
   reduced motion).
7. The grow glow of section D in `drawBack`, on from beat "grow" to beat "dim", as a step.
8. `deck2d-city.test.ts`: rewrite the bridge, lamp and arc tests for the new kit (slopes 0, +-1/4, +-1/2 or vertical;
   12 lamps each; no member over another island or a label; phone Traffic ends on the trunk; 30 dots at least 11 px apart).
   Update `README.md` with the final positions.

### camera (opus)

Files: `city/camera.ts`, `engine/**`, `web/test/deck2d-city-camera.test.ts`.

1. `BAND = { landscape: 96, portrait: 80 }`, `LABEL_CSS` as pinned above.
2. Line zoom: draw the city backdrop (the sky picture uncut, cloud strips) instead of `sky(..., floor)` + `hazeBand`, so
   no flat colour band sits under the line and beats 1 and 2 share one sky.
3. City sky: integer scale only (n = 1 at 1280x720 and on a phone). On a phone anchor the picture's skyline behind the line,
   tile its top 96 rows upward, fill below with cloud strips at integer scale; offset the sky by
   `round((cam.y - ringCentreY) * 0.08 / CITY_PX)` and the strips by 0.2 so pans have depth.
4. Shift the city sky by a whole number of px so none of the picture's own floating islands is within 24 px of an island
   sprite, connector or label in the desktop ring.
5. Phone line zoom: the launch islet's right edge 8 device px inside the screen; the Repo end may clip.
6. Phone pans: when k changes, cut x and y with the scale; a hop longer than 0.75 of the usable height is a cut; desktop
   keeps holding the ring in beat 3.
7. Beat "card": hold the ring. At 1280x720 the card may cover Inbox's lower shaft; the line, its label and every island's
   upper half stay clear (decision E1).
8. `engine.ts`: `if (v.city?.beat) pendingLaunches = 0` in `take()`, and hold `rocket.mode` at "away" while `view.city` is
   set so the hero rocket does not land back during the reveal. If the pixel launch layer (`launch/px.ts`, not yours) still
   lands its own, report the exact diff instead.
9. `deck2d-city-camera.test.ts`: k 1 at 1280x720 and 1440x900, 2 at 1280x720 @2, 1 on a phone, 2 on a phone island;
   every label and plate on screen above the band; replace literal centres with fit checks; add 390x664 and 375x667.

### copy (sonnet)

Files: `contract.ts`, `story/reveal.ts`, `city/labels.ts`, `deck.css`, `main.ts`, `web/deck.html`, `scripts/shots/deck.mjs`,
`web/test/deck2d-city-zoom.test.ts`, `web/test/deck2d-story-city.test.ts`.

1. `CITY_COPY.island`: the ten lines of section C, joined by `\n`. Nothing else in `contract.ts` changes.
2. `reveal.ts`: an island's caption shows from `into >= T.move` (0.6 s into its turn); update the story-city tests.
3. `deck.css`: the two-line toast rule of section C; label and plate sizes as pinned; labels on a chip
   `background: rgba(10, 6, 4, 0.72)`, lit `#eed3c5`, dark `#c0988e`, line `#fdec9a` (each at least 4.5:1 on the chip).
4. `deck.css`: "Sign in with GitHub" on one line at beat "card": `.ic-actions` columns `minmax(0, .75fr) minmax(0, 1.5fr)`,
   `white-space: nowrap`; under 520 px wide stack the two buttons (Replay above, Sign in below, DOM order unchanged).
5. `labels.ts`: hide a tag (visibility, as a step) when its box is not fully inside the screen less `EDGE` and the caption
   `BAND`, or when it overlaps the visible `.ic-card`.
6. `main.ts`: hide the Zoom button while the story's phase is "reveal" or "end".
7. `deck.html`: an inline `<style>` with `html, body { margin: 0; background: #2a1410 }` and controls hidden until
   `deck.css` applies.
8. `deck.mjs`: the new captions (with `\n`) in `COPY`; start the clip one frame after `data-deck-ready`; add views
   390x664 and 375x667 for CITY=1; problems for a visible label under the card and a label off screen.

### Decisions made here

- E1. **At 1280x720 the beat 6 card may cover Inbox's lower shaft.** The ring is 587 of 608 usable px tall; no whole-number
  frame keeps all six islands above a 220 px card. The card is the call to action and covers only dark scenery; the line,
  its label and every island's top stay clear, and labels under the card hide. On a phone nothing is covered.
- E2. **Lit island lights are steady.** "Animate like our main island does" is met by the runway, the moving belts, the
  capsule landing and the beacon. Nothing blinks (nothing flashes).
- E3. **Brass lanterns on the connectors**, like the line's. Yellow still means "waiting on you" on the line's status; a
  lantern is not a status light.
- E4. **The phone merges Traffic into the Errors trunk.** A 748 px wide screen has no room for two separate feeds into the
  line's west end without a tower down the screen edge. Errors lights first, so the trunk is already lit when Traffic's
  runway reaches it.
