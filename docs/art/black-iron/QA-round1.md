# Black Iron line: cold QA review

Build reviewed: `shiptorio-line.html`. A fresh inline of `core.js` and `modules/*` into `template.html` produces the same file. **No console errors in any run.** Screenshots are in `/home/claude/iron/shots/` (`qa-*` from shot.js, `qa-x-*` from my own condition-driven captures). Numeric teleport log: `shots/qa-x-teleport.json`.

**How I tested.** I ran every view in the brief: line, deck, under, each station, blocked, follow and mobile. I also wrote a QA-only patched copy (scratchpad, not in the project) that follows one chosen item (#142) from the SENTRY mine to the assembler, through a rejection and rework, and back. I captured the liftoff by advancing until "charging the coils". A per-step detector watched every item's position and rotation at 1/60 s for 200 s of sim. I ran `simcheck` for 300 s and a 1200 s soak.

## Verdict

* **Can a first-time viewer follow one item from mine to rocket?**
  * **With FOLLOW WORK: mostly yes.** The chain is physically continuous. No item moves more than 0.25 u in one step anywhere in 200 s, and every stage is a real mechanism. The follow bar names each stage.
  * **From LINE/DECK, the story breaks in four places:**
    1. The item gets lost inside the assembler.
    2. The reject exit happens behind the splitter.
    3. The rework high line hides its cargo.
    4. The rocket flight, which is the payoff, is off-screen or behind a HUD chip.
  * **It also starts cold.** Nothing ships for about 75 s after load.
* **IDLE / WORKING / BLOCKED.**
  * **HUD: unmistakable on desktop.** Chip colour and state word, the alert banner, the NEEDS YOU counter and the ticker all make it clear.
  * **In the 3D art: only the splitter is unmistakable.** The assembler is OK up close, the launch pad is weak, and at LINE zoom none of the machines can be read from the art alone.
* **Brightness.** Desktop frames average 60–75/255, with 35–48 % of pixels below 40. It's dark but readable. The launch view is the darkest.
* **Mobile.** The follow view works, but LINE, DECK and UNDERSIDE are unreadable, and the HUD collides with itself (see P0-1 and P1-11/12).

---

## P0: broken

**1. On mobile, RESOLVE can't be reached while a machine is blocked.**
* **What:** On a phone, a blocked machine's chip (the one with the RESOLVE button) is pushed under the control panel. The FOLLOWING bar and the alert share the same slot, so the alert covers the bar.
* **Cause:** `placeChips` pushes any chip that horizontally overlaps `#alert` down to `alert.bottom + h + 6`. On mobile the alert sits at `bottom:150px`, so that lands under `#ctrl`, which has z 5 against the chips' z 3. `#followBar` uses the same `bottom:150px`.
* **Where:**
  * `shots/qa-x-mob-resolve-hidden.png`: splitter station and follow view, splitter blocked, no chip; RESOLVE is visible behind the controls.
  * `shots/qa-x-mob-deck-under-blocked.png`: all three chips are under the ticker and controls.
* **Why it matters:** The human decision is the one interaction Justin asked for, and on a phone it's unreachable (auto-resolve hides this by default).
* **Owner:** core/template/HUD.
* **Fix:** When the alert is at the bottom, push chips up, not down, or dock blocked chips into a fixed "needs you" tray. Give `#followBar` its own slot.

## P1: hurts the goal

**2. Cold start: about 75 s before anything ships.**
* **What:** All items are seeded on the underground rail. For the first ~20 s every machine is IDLE and the deck belts are empty. The first launch comes at about 70–80 s.
* **Where:**
  * `simcheck`: at 30 s, SHIPPED 0 and splitter/launch IDLE; at 60 s, SHIPPED 0.
  * `qa-line-0.png` at 60 s shows SHIPPED 0.
  * The mobile default view (FOLLOW) opens on the dark mine rail.
* **Why it matters:** The first impression is "nothing's happening".
* **Owner:** core.
* **Fix:** Advance the sim about 60–90 s silently on load, or seed one item per stage (tray, punch, tube, splitter, pass belt, rocket in "ready").

**3. The liftoff payoff is off-screen or behind HUD.**
* **What:**
  * **Station view:** The rocket leaves the frame within about 1 s, leaving only smoke and the open silo hole (`qa-x-liftoff-4.png`, `qa-x-liftoff-sheet.png`).
  * **LINE/DECK:** `CHIP_AT.launch = [10, 8.4, -0.6]` puts the launch chip directly above the pad, so the climb happens behind the chip (`qa-line-0.png`, `qa-deck-0.png`).
* **Why it matters:** "Merged PRs launch rockets" is the moment of satisfaction, and it isn't seen.
* **Owner:** core/template/HUD (camera headroom or follow-the-rocket, chip placement), plus launch (an optional arc or tilt so the flight crosses open sky).

**4. Chips cover the machines they describe in LINE/DECK.**
* **What:** The chips anchor 6–8 u above each machine:
  * The splitter chip covers the top of the teal dome.
  * The assembler chip covers the rework high line and both REWORK towers.
  * Blocked chips are taller and hide more.
  * The top-left HUD card covers the rework drop tower.
* **Where:** `qa-line-0.png`, `qa-blk-line-0.png`, `qa-deck-0.png`.
* **Owner:** template/HUD.
* **Fix:** Use compact state pills anchored at the deck's front edge under each bay; expand to the full chip on hover or tap, or when blocked.

**5. Off-screen chips pile up on the screen edges and overlap each other.**
* **What:** In station and follow views, two or three chips clamp to the same corner and stack. The lower chip's RESOLVE/STALL buttons are covered. In UNDERSIDE, the chips float over unrelated underside art.
* **Where:** `qa-asm-assembler-0.png` (top right), `qa-blk-assembler-0.png`, `qa-x-liftoff-4.png` (top left), `qa-x-follow142-tube.png`, `qa-mob-follow-0.png`, `qa-under-0.png`.
* **Owner:** template/HUD.
* **Fix:** Collision-avoid the chips, or dock off-screen machines into a status strip with an arrow pointing at the machine.

**6. BLOCKED isn't unmistakable in the art at normal zoom.**
* **What:** The caution post and status lamp are about 4–8 px at LINE zoom. The amber and red cues sit inside an amber/orange palette.
  * **Launch pad, blocked at T-0:** it reads calm. There's a little steam, the nixies show 00, and a small "!" (`qa-x-launch-blocked-deck.png`, `qa-blk2-launch-0.png`).
  * **Assembler:** relies on the "?" card and the "!" sign. These are good up close but invisible at LINE (`qa-blk-line-0.png`).
  * **Splitter:** the amber orb and red floor ring work (`qa-blk2-splitter-0.png`). Copy that approach.
* **Owner:** assembler, launch; core for `K.caution`/`statusLamp` scale.
* **Fix:** Add a machine-scale tell readable at LINE zoom: a pulsing red hazard footprint around the plinth, the machine's own work lights flipping to red strobe, a red light column or beacon, and the rest of the machine's emissives dimmed or desaturated while frozen.

**7. IDLE and WORKING look nearly identical in stills (assembler, launch).**
* **What:** The idle assembler keeps the dome, fire, lamps and steam warm and lit. The only clear differences are the riser glow and gear speed. Its WORKING, IDLE and BLOCKED frames are about 85 % the same picture. The launch pad at IDLE is fully lit too.
* **Where:** `qa-x-asm-work-idle-blocked.png` (left to right: WORKING, IDLE, BLOCKED); `qa-lch-launch-0..4`.
* **Owner:** assembler, launch.
* **Fix:** Use a "lights-down" IDLE: emissives at about 40 %, fire banked, no steam, the arm parked low. Make WORKING clearly lit, with a work light on the station currently holding the item.

**8. The item gets lost inside the assembler.**
* **What:**
  * The cream card stack sits next to the bigger, brighter cream blank-card hopper.
  * At "cards bound", the punch side plates hide it.
  * On the claw it's tiny.
  * Everything is brass or amber, so the arm, claw and item don't separate from the static brass.
* **Where:** `qa-x-asm-cards.png`, `qa-asm-assembler-1.png`.
* **Why it matters:** This is exactly the "arm grabs it, puts it on the paper thing…" sequence Justin described.
* **Owner:** assembler (core for the halo strength of `cards`).
* **Fix:**
  * Give the active item a strong halo or spotlight while held.
  * Make moving parts steel or hazard-striped, not brass.
  * Move the punch output slot to the camera-facing side.
  * Make the hopper darker or less emissive.

**9. The rejection path is hidden.**
* **What:**
  * The splitter's REJECT chute is on the back-left face.
  * The `rw1` belt runs behind the splitter's own intake-lift frame, so the capsule swings left, vanishes behind the dome, and reappears on the REWORK tower. Its tag stacks on the next PR's tag.
  * On the high line, the cargo is hidden behind the bridge truss and the REWORK signs, and the red reject band sits on a red bridge.
* **Where:** `qa-x-reject-hidden.png`, `qa-x-reject-sheet.png`, `qa-x-follow142-rwhigh.png`.
* **Owner:** splitter (chute visibility, glow), belts (open or low front railing, signs moved off the item lane, a lit strip under items on the bridge, a darker belt deck so red pops).

**10. Carrier swaps teleport.**
* **What:**
  * The mine cart vanishes at the lift foot and a cage appears around the ore. There's a 6-particle puff and no tipping motion.
  * The cage vanishes at the top.
  * Rework buckets do the same at both ends.
* **Cause:** `enterPath` hides every carrier and shows the new one, so carriers die with the path.
* **Where:** `qa-x-cart-to-cage.png`.
* **Owner:** underside (cart/cage), belts (bucket), core (carrier lifecycle).
* **Fix:** Use persistent carriers. The cart tips on the tipper ramp and rolls back; the cage carries on over the sheave and down the return column. Or animate the carrier out (fade or slide) over 0.3 s.

**11. Mobile LINE, DECK and UNDERSIDE are unreadable.**
* **What:** The 37 u island is fit to a 390 px width (about 10 px/u, items about 5 px), and more than half the portrait screen is empty sky.
* **Where:** `qa-mob-line-0.png`, `qa-x-mob-deck-under-blocked.png`.
* **Owner:** template/HUD.
* **Fix:** On portrait, show a tall crop of one bay (left, middle, right) with swipe or pan along the line, or have DECK auto-pan to the busiest station.

**12. The mobile HUD collides with itself.**
* **What:**
  * The ticker's second row sits under the control card (`bottom:96px`, but the controls wrap to 3 rows, about 150 px).
  * The launch chip reads just **"IRON"** because `NAMES.launch = ['IRON','LAUNCH PAD']` and `.full` is hidden.
  * The assembler name is clipped to "CLOCKWO" by the splitter chip.
  * Two adjacent unlabeled **"1X"** buttons appear: pixel size and sim speed.
* **Where:** `qa-x-mob-ticker-overlap.png`, `qa-x-mob-chips.png`, `qa-mob-assembler-0.png`.
* **Owner:** template/HUD.

**13. The FOLLOWING bar collides with chips.**
* **What:** On desktop, the bar (top: 56px) covers the assembler chip's title while it's blocked. On mobile it sits under the alert (see #1).
* **Where:** `qa-fol-follow-0.png`.
* **Owner:** template/HUD.

**14. There's no visual key for the transformation.**
* **What:** A first-timer can't tell that ore lump → punch cards → brass capsule → green/red band means issue → work → PR → review verdict without reading chip text. Tags show only "#142".
* **Owner:** template/HUD.
* **Fix:** Add a small 5-step journey strip (ISSUE · CARDS · PR · REVIEW · SHIPPED) with the item icons. Highlight the followed item's step and colour the tag by kind.

**15. The mine mouths, where the journey starts, are flat.**
* **What:**
  * The SENTRY, GITHUB and INBOX mouths are flat black rectangles with a coloured dot.
  * The spawn is a small puff.
  * The rock wall reads as low-contrast brown block noise, with loose cubes that look like they're floating.
* **Where:** `qa-und2-under-0.png`, `qa-under-0.png`.
* **Why it matters:** Justin asked for an underside that's "far more visible and crazy detailed", and the mines are where work is born.
* **Owner:** underside.
* **Fix:**
  * Add source-coloured ore veins glowing around each mouth.
  * Have an ore chute drop the lump into the cart on spawn, with the mouth lamps flaring.
  * Add more value structure to the rock (ledges, dark seams), and seat the loose cubes against the rock.

**16. The pneumatic tube washes out its cargo.**
* **What:** The inner streak brightens toward white while a capsule rides, and the amber band disappears into it.
* **Where:** `qa-x-follow142-tube.png`, `qa-asm-assembler-0.png`.
* **Owner:** belts.
* **Fix:** Keep the streak dim teal and pulse it ahead of or behind the capsule; make the capsule the brightest thing in the tube.

## P2: polish

**17. Rotation snaps at handoffs.**
The detector found these one-frame orientation snaps (the largest position jump is 0.23 u):

| Handoff | Snap | Position jump |
|---|---|---|
| tube → feed belt | 117°, capsule goes from vertical to horizontal | 0.16 u drop |
| engine top → tube | 180° flip | 0.23 u |
| lift → ore belt | 133° | – |
| pass tray → crane | 180° | – |
| tray → arm | 90° | – |
| every belt corner | 45° yaw | – |

* **Where:** `shots/qa-x-teleport.json`.
* **Owner:** core (slerp the orientation over about 0.15 s in `stepPaths` and when following).

**18. The capsule sits off-centre in vertical tube runs.**
* **What:** The tube code does `y -= 0.2`, but the capsule's centre is at local +0.2 y. On pitch ±90° that becomes a 0.2 u sideways offset, so the capsule (r 0.15) pokes about 0.1 u through the glass (r 0.25) on the rise and the drop.
* **Owner:** core.
* **Fix:** Use `position = point - R·(0, 0.2, 0)`.

**19. Backed-up machines show green WORKING.**
* **What:** The splitter's "held: ship belt is full" and the assembler's "tube backed up" both keep a green WORKING chip. The soak test shows the pass belt queueing up to 7 items, so the launch pad is the real bottleneck.
* **Owner:** core (state) and the machines.
* **Fix:** Add a "BACKED UP" sub-state (dim amber, not red) so the bottleneck can be read.

**20. A stall during liftoff gives a contradictory message.**
* **What:** The chip reads "#142 · liftoff! · Stalled by you: launch held" while the rocket is already gone and the pad sits frozen with an open silo hole.
* **Where:** `qa-blk2-launch-0.png`.
* **Owner:** launch.
* **Fix:** Defer the stall until the pad is ready, or word it "pad reset held".

**21. Smoke looks like honeycomb tiles.**
* **What:** Big flat-shaded cube particles read as hexagons drifting across the CI arch and the pad.
* **Where:** `qa-x-liftoff-4.png`, `qa-blk2-splitter-0.png`.
* **Owner:** core (`K.spawn`), launch.
* **Fix:** Use smaller clustered puffs or pixel billboards with dither fade.

**22. Too many signs, and some are clipped.**
* **What:** Up to 5 REWORK signs are visible at once. Two are clipped by tower posts and read "REWOR". The back-wall SHIPTORIO sign is often half-hidden.
* **Where:** `qa-asm-assembler-0.png`, `qa-x-follow142-rwhigh.png`.
* **Owner:** belts (signs), world.

**23. World signs use a different font.**
* **What:** World signs (SHIPTORIO back wall, BAY 01–03) use the system `bold monospace` canvas font. Belts and underside use a 3×5 pixel font, so the world signs look inconsistent and soft at 1x.
* **Owner:** world.

**24. Some copy isn't SHIPTORIO-branded.**
* **What:** The HUD eyebrow "COGWORKS · BLACK IRON" is internal style naming; use "SHIPTORIO" plus the factory or repo name. "STALL" is jargon; "HOLD" or "PAUSE" would be clearer. The chip detail joins two items with a double space ("#145 · compiling the PR  #146 · feeding the punch"), so it reads as a run-on.
* **Owner:** template/HUD; assembler `detail()`.

**25. The ore belt's first leg is hidden.**
* **What:** It runs behind the ORE LIFT headframe's front diagonals and sign, so the item is hidden as it steps off the lift.
* **Where:** `qa-x-follow142-a.png` (the ORE BELT frame, second row on the right).
* **Owner:** underside.

**26. Belts scroll under a stopped queue.**
* **What:** For 1.2 s the belt keeps scrolling under a queue that has already stopped, before `jammed` trips, so items look like they slide. `flow` should drop as soon as the front item is `atEnd` and the next item has closed to the gap.
* **Owner:** core.

**27. Performance risk on phones.**
* **What:**
  * About 2,700 visible meshes (each drawn twice with shadows), 237k triangles, and 10 Phong point lights.
  * The assembler alone has **573 meshes**, mostly per-tooth gear boxes in the 4×6 gear stacks. Baking each gear into one mesh saves about 400.
  * Every particle allocates its own material.
* **Owner:** assembler (bake the gears), core (particle material pool).

**28. Value hierarchy.**
* **What:** Brass and amber decor near the line (gear racks behind the splitter, crates, barrels, nose cones) has the same value and hue as active machine parts and items. The 35–48 % of pixels below 40/255 sit mostly in the back wall and the machines' undersides, and the vignette crushes the corners.
* **Owner:** world (dim and desaturate non-line decor about 15 %), core look (lighter shadow tint, less vignette on mobile).

**29. At 2X pixels the underside labels become illegible.**
* **What:** The SENTRY, GITHUB and INBOX mine labels can't be read at 2X.
* **Where:** `qa-px2-line-0.png`.
* **Owner:** underside (bigger sign glyphs), or accept it for 2X.

---

## Keep these: the 5 strongest things

1. **The Aether Splitter is the model station.** The capsule rides the intake lift, gets pulled into the orrery and orbits while rings spin up and scan sweeps. Then a green or red verdict burst fires and the capsule drops down the chute. Its three states each have a distinct look: teal and dim for IDLE, a white orb and fast rings for WORKING, an amber orb with a red floor ring and grinding rings for BLOCKED (`qa-spl-splitter-*`, `qa-blk2-splitter-0.png`).
2. **The launch choreography.** The crane plucks the capsule and the hatch opens and loads. Tesla coils arc into the hull. Then come the clock and nixie countdown, ignition smoke from both trench ends, and the silo reset with a fresh rocket rising (`qa-lch-launch-5..8`, `qa-x-liftoff-sheet.png`). Keep all of it; it just needs to be framed (P1-3).
3. **The simulation core is solid.**
   * No positional teleports anywhere: the largest one-step move is 0.23 u.
   * Items are conserved and backlogs form naturally.
   * The 20-minute soak runs with no deadlock at about 5 ships/min.
   * Item kinds change at meaningful, visible moments: cards at the punch strike, the capsule in the riser, the verdict in the orb.
4. **The assembler's mechanical chain.** Tray → IK brass arm → punch carriage with a flywheel-driven ram and a streaming punched-card ribbon → gantry claw → lidded intake cup → glass vacuum riser with a suction collar → tube. Its blocked look up close (the "?" card popping from the hopper, the "!" sign flipping up, the boiler venting) is great. The glass pneumatic tube arcing under the red rework bridge also makes a strong multi-level read.
5. **The story-telling HUD and labels.** Per-machine chips use plain-language detail ("#142 · punching cards", "REWORK: failing test: cart.spec", "T-0 · awaiting your merge"). The alert banner, NEEDS YOU counter and colour-coded ticker back them up. FOLLOW WORK carries the item's title and stage. The SENTRY, GITHUB and INBOX mines are clearly labelled and coloured. Together, these make the journey legible once the HUD layout bugs are fixed.
