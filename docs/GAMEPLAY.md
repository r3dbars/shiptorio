# Gameplay: how Shiptorio plays

> Status: **design** (2026-10-27, thread "Design the core gameplay mechanics"). Nothing here is built yet unless
> marked. Playbook (full write-up on real shaft renders): https://claude.ai/artifact/QDvFEZePgx5bzBv7TBHZz8 ·
> A/B picks: https://claude.ai/artifact/HTDQR39URzPniTeugbZGkR. Justin's picks go in the table at the bottom.
> Builds on VISION.md (principles 6, 10, 11), ATTENTION.md (one card, Continue / Later) and the new-player
> walkthrough's unlock ladder.

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

`S` = suggested. Justin's pick column is filled from the A/B page.

| # | Question | A | B | S | Justin |
| --- | --- | --- | --- | --- | --- |
| 1 | Move up/down the shaft | Free scroll | Snap to floors | B | |
| 2 | First frame on open | Whole shaft | Parked on what needs you | B | |
| 3 | Tap a machine | Bottom sheet | Callout on the thing | B | |
| 4 | Name tags | Always on | Tap / hover only | B | |
| 5 | Work on belts | Ore by source color | Stamped #crates | A | |
| 6 | Touch the work | Watch only | Tap cart: Rush / Park | B | |
| 7 | Card position | Always bottom | At the machine | A | |
| 8 | Approve a launch | Tap Continue | Press and hold | B | |
| 9 | Swipe or buttons | Swipe first | Buttons first | B | |
| 10 | 3+ cards waiting | One at a time | Fanned deck | A | |
| 11 | Autonomy level-up | A card | Pull the lever | A | |
| 12 | PR merges | Cut to rocket every time | Big once, small after | B | |
| 13 | Checks catch a bug | Scar on the work | Jam on the machine | A | |
| 14 | Sound | Silent | Soft foundry hum | B | |
| 15 | First open | Shiny factory | Abandoned foundry | B | |
| 16 | Not-yet-unlocked things | Hidden | Visible but broken (next 1–2) | B | |
| 17 | Start a repair | Tap the broken thing | Suggested card only | A | |
| 18 | Repair cost | One real action | Gears from ships | A | |
| 19 | Trust shows as | HUD bar | Lamps up the lift tower | B | |
| 20 | Unlock reveal | Lights + one line | Fly there, explain once | B | |
| 21 | Above the pad on day 1 | Nothing | Dark scaffolding | B | |
| 22 | First issue enters by | Re-railing the cart | A plain card | A | |
| 23 | Phone layout | Card over map | Split screen | A | |
| 24 | Desktop layout | Same as phone | Side rail | A | |
