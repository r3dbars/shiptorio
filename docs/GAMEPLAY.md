# Gameplay: how Shiptorio plays

> Status: **design** (2026-10-27, thread "Design the core gameplay mechanics"). Nothing here is built yet unless
> marked. Playbook (full write-up on real shaft renders): https://claude.ai/artifact/QDvFEZePgx5bzBv7TBHZz8 ·
> A/B picks: https://claude.ai/artifact/HTDQR39URzPniTeugbZGkR. Justin's picks go in the table at the bottom.
> Builds on VISION.md (principles 6, 10, 11), ATTENTION.md (one card, Continue / Later) and the new-player
> walkthrough's unlock ladder. The complete approved rounds 1–4 and current rollout policy are in
> [GAMEPLAY-PICKS.md](GAMEPLAY-PICKS.md), which supersedes earlier picks or rollout notes below where they differ.

## Core loop

Work is ore. It's dug out of your sources, rides up the shaft (mine → plan → build → checks → launch) and leaves
as a rocket = a merged PR. The player stands at two spots on the line: **say yes** when work is ready, and **fix
the factory** when a part is missing or broken. Three time scales:

- **10 seconds:** one card, Continue or Later. Something on the map moves within a second.
- **2 minutes:** one visit. See what shipped, clear what waits, fix one thing on the map, close.
- **Weeks:** repairs and unlocks pile up, floors light up, whole kinds of cards stop coming.

## Six verbs (same on phone and desk)

| Verb | Phone | Desktop |
| --- | --- | --- |
| Look | Drag up/down, settles on a floor; pinch out = whole shaft | Wheel or ↑ ↓ per floor; drag to pan |
| Tap | Tap machine / cart / tunnel → small callout with one button | Hover = name; click = same callout |
| Decide | Continue / Later, or swipe right / left | Buttons, or → / ← |
| Launch | Press and hold Launch (short fuse) | Hold the button or hold Space |
| Repair | Tap the broken thing; callout names the one real step | Click it |
| Follow | Long-press an item; camera rides with it | Double-click or F |

Rule: if it's about one thing, it lives on that thing in the world. If it needs your yes, it's the card.
Everything else is behind Menu. No dead taps: every tappable thing says what it's doing in one line or offers one
button.

## Repair and unlock

You inherit an **abandoned foundry**. Setup is three repairs you watch happen: pry open the GitHub tunnel (pick
repo), light the boiler (connect your AI, one-paste power), re-rail the derailed cart (pick the first issue). Then
the first rocket.

After that, parts of the factory appear **broken, boarded or dark** only when your real work needs them, and are
fixed only by doing the real thing:

| In the world | Shows up when | Fixed by | You get |
| --- | --- | --- | --- |
| Empty check socket (glows) | First fail caught, or a bug slips through | Adding the named check | That bug class caught every time |
| Sentry tunnel (boarded; exists today as NOT CONNECTED) | After 3 ships | Connect Sentry | Errors become work |
| Telescope under a tarp | First ship | One tap | Orbit watch; trust grows faster |
| Rusty lever on the planner | 3 clean ships in one area | Yes on "Let /web start work on its own?" | Autonomy: Starts work |
| Card rack | 3+ cards waiting | Open it once | The check-in deck |
| Dark second assembler bay | Builds queue 2h+ | Connect a second AI | Two builds at once |
| Deep seam | Sentry ran a week | Connect PostHog | Drop-offs become work |
| Launch clamps | 10 clean ships in an area, held | Grant a permit | That area ships without a tap |
| Control room (top) | All areas on permits 2 weeks | Yes | Lights out |
| Geothermal vent | You hit your AI plan's limits | Pair a local model | More power |
| Blueprint table, floors above the pad | Parked | Build mode, new districts | Later |

Rules: no currency (trust is the only bar); the bottleneck picks the next repair; only the next one or two are
visible; never fake decay (runner offline = boiler cold, for real); a repair works instantly; big the first time
(camera flight + one coach line), small after (light cascade + ticker line).

## Build order

- **Next:** tap → callout; hold to launch; phone camera snaps to floors; first rocket = camera cut, later = corner
  flash; cold look for unpowered boiler / assembler.
- **Then:** abandoned-foundry first run; derailed-cart beat; glowing check socket; rusty lever = Starts work;
  trust lamps on the lift tower.
- **After:** dark assembler bay, deep seams, launch clamps; rush / park a cart; control room; desktop side rail;
  build mode and new districts (parked).

## Decisions (A/B)

`S` = suggested. Round 1 picked by Justin on 2026-10-27 (22 of 24). He matched the suggestion on all 22.

**Justin's notes on round 1 (these are rules now):**
- **#5 ore:** no flat colored squares. Sources should read by the ore's own color and highlight (round 2 picks the look).
- **#7 card buttons, everywhere:** Later on the **left**, Continue on the **right**, and every card also swipes
  (right = continue, left = later). Right is always the go action.
- **#8 launch:** the hold-to-launch control is a **big red button on the right** (Later on the left), with sound and a
  real pressed-down feel.
- **#10** and **#24**: neither option was good enough; redone in round 2.

**How we refine gameplay from here (Justin, 2026-10-27):** short rounds of A/B picks on the same page
(https://claude.ai/artifact/HTDQR39URzPniTeugbZGkR), each narrowing in on the last round's picks and notes, always on
real game art. Picks are stored in that artifact's db (collection `picks`, ids = decision ids, round 2 ids start
with `r2-`); record each round here.

| # | Question | A | B | S | Justin |
| --- | --- | --- | --- | --- | --- |
| 1 | Move up/down the shaft | Free scroll | Snap to floors | B | **B** |
| 2 | First frame on open | Whole shaft | Parked on what needs you | B | **B** |
| 3 | Tap a machine | Bottom sheet | Callout on the thing | B | **B** |
| 4 | Name tags | Always on | Tap / hover only | B | **B** |
| 5 | Work on belts | Ore by source color | Stamped #crates | A | **A** |
| 6 | Touch the work | Watch only | Tap cart: Rush / Park | B | **B** |
| 7 | Card position | Always bottom | At the machine | A | **A** |
| 8 | Approve a launch | Tap Continue | Press and hold | B | **B** |
| 9 | Swipe or buttons | Swipe first | Buttons first | B | **B** |
| 10 | 3+ cards waiting | One at a time | Fanned deck | A | neither, redo in round 2 |
| 11 | Autonomy level-up | A card | Pull the lever | A | **A** |
| 12 | PR merges | Cut to rocket every time | Big once, small after | B | **B** |
| 13 | Checks catch a bug | Scar on the work | Jam on the machine | A | **A** |
| 14 | Sound | Silent | Soft foundry hum | B | **B** |
| 15 | First open | Shiny factory | Abandoned foundry | B | **B** |
| 16 | Not-yet-unlocked things | Hidden | Visible but broken (next 1–2) | B | **B** |
| 17 | Start a repair | Tap the broken thing | Suggested card only | A | **A** |
| 18 | Repair cost | One real action | Gears from ships | A | **A** |
| 19 | Trust shows as | HUD bar | Lamps up the lift tower | B | **B** |
| 20 | Unlock reveal | Lights + one line | Fly there, explain once | B | **B** |
| 21 | Above the pad on day 1 | Nothing | Dark scaffolding | B | **B** |
| 22 | First issue enters by | Re-railing the cart | A plain card | A | **A** |
| 23 | Phone layout | Card over map | Split screen | A | **A** |
| 24 | Desktop layout | Same as phone | Side rail | A | neither, redo in round 2 |

### Round 2 (early option table, 2026-10-27)

Final answers are recorded in [GAMEPLAY-PICKS.md](GAMEPLAY-PICKS.md); the S column below is the earlier suggestion.

| # | Question | A | B | C | S | Justin |
| --- | --- | --- | --- | --- | --- | --- |
| r2-many | More than one card waiting (redo #10) | Peeking plate edges | Pips under the card | Amber lamps on the machines in the world | A | |
| r2-desk | Desktop layout (redo #24) | Card beside the shaft, line to the machine | Floor fills the screen + shaft strip | Shaft + bottom HUD dock | A | |
| r2-launchbtn | Big red launch button | Mushroom button | Guarded switch | Detonator plunger | A | |
| r2-ore | Ore look | Glowing chunks | Dark ore, colored veins | Crystal shards | A | |
| r2-buttons | Later left / Continue right sizes | Big Continue, small Later | Equal halves | Continue as a tab | A | |
| r2-callout | Callout shape | Plate to the side + line | Bubble with tail | The name tag grows | C | |

## Build plan (approved default rollout)

Justin's later 12:37/14:28 direction in [GAMEPLAY-PICKS.md](GAMEPLAY-PICKS.md) supersedes the earlier
`play`-flag plan: implement approved picks for everyone without a new play flag. Existing kill switches and
the temporary `?attention=0` fallback remain applicable where implemented. This is design intent, not proof
that the slices below are released. Keep side-by-side phone (390) and desktop (1440) shots before each merge.
Round 2 picks fill in the details for slices 1, 2, 6 and 10.

Seams: `hud.ts`, `frame.ts` and `shaft.css` in `web/src/map/shaft/` belong to the Black Iron thread; the rest of the
shaft (modules, core items, driver, layout) to the map thread. Coordinate before touching them.

| Slice | What | Where | Size |
| --- | --- | --- | --- |
| 1 | Later left / Continue right on every card, swipe on every card | `ui/Attention.tsx`, `ui/NextMove.tsx`, `ui/CheckIn.tsx` | S. A rule from Justin, can ship without the flag |
| 2 | Big red hold-to-launch button with sound and press-down | launch cards + `web/src/sound/` | S |
| 3 | Phone camera snaps to floors; pinch out = whole shaft | `map/shaft/stage.ts`, `frame.ts` (Black Iron) | S |
| 4 | Open parked on the machine the top card is about | `stage.ts` focus + App | S |
| 5 | Tap a machine → callout with one button; tags only on tap / hover (mostly #290) | `hud.ts` (Black Iron), `ui/StationPanel.tsx` | M |
| 6 | Ore look per source (round 2) | `map/shaft/core.js` items (map thread) | S |
| 7 | First rocket = camera cut, later = corner flash + counter tick | `ui/ShipCelebration.tsx`, `stage.ts` | S |
| 8 | Rework scar stays on the work | core items + driver | S |
| 9 | Soft foundry hum, stamp on Continue, roar on launch | `web/src/sound/` | S |
| 10 | Multi-card cue (round 2) | card component | S |
| 11 | Abandoned foundry first run: cold boiler / dark assembler until power, boarded GitHub tunnel until repo, derailed cart for the first issue; three repairs = the three setup steps | shaft modules (cold states), driver, `ui/Onboarding.tsx` | L |
| 12 | Visible-but-broken unlocks: glowing check socket, dark assembler bay, tarped telescope, dark scaffolding above the pad | shaft modules + plan (`layout.js` `makeLayout`) | M |
| 13 | Tap the broken thing → callout names the one real step (same action also waits as Suggested) | callout + existing connect / research flows | M |
| 14 | Trust lamps up the lift tower (replaces any trust bar) | shaft module + `shared/src/progression.ts` | M |
| 15 | Unlock reveal: first of a kind = camera flight + one coach line; after = light cascade | `stage.ts`, coach card | M |
| 16 | Tap a cart: Rush / Park | callout + server priority on the move queue | M, needs server |
| 17 | Desktop layout (round 2) | App layout + `frame.ts` | M |

Order: 1, 2, 3, 4, 7, 9 first (small, every visit feels them), then 5, 6, 8, 10, then 11 (the big first-run moment),
then 12 to 17.
