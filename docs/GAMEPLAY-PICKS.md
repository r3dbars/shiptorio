# Gameplay picks (Justin, 2026-10-27)

> **Historical, 3D map era (marked 2026-10-29).** This page describes the old map, shaft or React UI, not the 2D deck
> that is the product now. It stays here because code comments point at it. Where it disagrees with
> [VISION.md](VISION.md), VISION wins.

> Status: **approved design decisions and future build plan**. This record does not establish implementation or release.

Justin's answers from the A/B picks page (https://claude.ai/artifact/HTDQR39URzPniTeugbZGkR, answers in its `picks` db).
Round 1 is written up with the reasoning in `docs/GAMEPLAY.md` (PR #322). This file is the full list, rounds 1 to 4,
so the build has one place to check. The approved rollout is for everyone, without a new `play` flag (Justin,
12:37 and 14:28: "push and commit and merge all of these choices"). This supersedes the earlier play-flag plan
in [GAMEPLAY.md](GAMEPLAY.md) and [VISION.md](VISION.md). Existing kill switches and the temporary
`?attention=0` fallback remain applicable where implemented; this document changes no runtime flags.

Player-journey picks for the simple screen (2026-10-28) are in [SIMPLE-UI.md](SIMPLE-UI.md#journey-picks-justin-2026-10-28-1506).

## Rules that come out of the picks

- **Simple on day one, more over months.** One card at a time, Later on the left, Continue on the right, swipe works too.
  Bigger controls (autonomy, more mines, settings) appear only when the factory earns them, one card at a time.
- **Real outcomes only.** No currency, no fake decay, no fake waits. A ship grows the factory, a repair is one real action.
- **The bottleneck drives what opens next.** The next broken thing lights up when your factory needs it, with real numbers.
- **Launching is a big red button you hold** on the right of the card, with sound and a press-down.
- **Sound choices:** steam and iron (round 3), and soft foundry hum (round 1); their proposed layering is an
  implementation interpretation below.

## Implementation interpretations

These combine recorded answers for the build plan; they are not additional explicit A/B answers:

- **r4-tease:** Justin picked A and noted that he likes B too. The author's proposed blend lights the next
  broken thing and shows the rest as faint silhouettes, without a to-do list.
- **Sound:** the author's proposed combination places steam-and-iron accents over the earlier hum base.
  The recorded answers remain Steam and iron (round 3) and Soft foundry hum (round 1).

## Build as you go (Justin, 2026-10-27 20:06)

Justin liked the dimmed tour (#357) on the local preview and asked for it to be the start: a fixed-ish camera,
buildings that don't exist until you build them, each build a 5 to 8 second animated construction that bursts with
electricity and stamps itself done, and a guided first issue followed issue → plan → build → checks → launch.

- **Unbuilt means gone.** This supersedes the "faint silhouettes" half of r4-tease above: no silhouettes, only the
  next site gets a chalk outline and stakes.
- **The three repairs are builds 1, 2 and 4** (pry the tunnel, light the boiler, re-rail the cart), inside eight
  builds that follow the first issue. r4-open, r3-firstrun (floors light as builds land) and r4-firstpick stand.
- Free look and the two counters come after the first rocket, from one "Look around" card.
- Behind `?buildout=1` until Justin plays it. Steps, triggers and hooks: `web/src/buildout/CONTRACT.md`.

## Round 4: the start of the game (14:28)

| # | Question | Pick |
|---|---|---|
| r4-open | You just signed in. First ten seconds? | **A** Dark foundry, one lit thing (the GitHub tunnel: "Pry this open to pick your repo") |
| r3-firstrun | The abandoned foundry on first open. How dark? | **C** Floors light as you fix them, bottom to top; the first rocket lights the top |
| r4-firstpick | Your first issue. Who picks it? | **B** It picks the smallest safe one ("Start with #12. Smallest and safest.") |
| r4-wait | Your first PR is building. What do you do? | **A** Watch the cart ride floor by floor, with a small bar and "about 6 min"; ping when ready |
| r4-reward | A PR ships. What do you get? | **B** The factory grows: each ship leaves a permanent lamp or banner on the floor that built it |
| r4-next | When does the next part open up? | **B** When your bottleneck needs it |
| r4-tease | How much of what's coming can you see? | **A**, with the note that he likes B too. The proposed blend is an implementation interpretation above |
| r4-onemore | You clear the last card. Now what? | **C** Show the next repair, with real numbers |
| r4-pull | What brings you back later? | **B** A launch is waiting ("#143 passed every check. Hold to launch.") |
| r3-return | Back after a day away. What happens first? | **B** Time-lapse of the day, Shipped counter ticks up, tap to skip |
| r4-grow | When do bigger controls show up? | **A** Earned, one card at a time |

## Round 3 (14:28)

| # | Question | Pick |
|---|---|---|
| r3-repair | You connected Sentry. What does the repair look like? | **C** You hammer it: hold on the planks to pry them off (same hold as launch) |
| r3-fly | Something unlocked. How does the camera show you? | **A** Quick one-second swoop, then the coach line |
| r3-trust | Trust lamps up the lift tower. How do they count? | **B** Lamps in levels; filling a level lights the big brass lamp |
| r3-rush | Tap a cart to Rush or Park it. How? | **A** Tap, then a button in its callout |
| r3-sound | What should it sound like? | **A** Steam and iron |
| r3-steer | The line is stuck (a Steer). What's on the map? | **C** The belt stops and work piles up in front of the machine |

## Round 2 (12:31)

| # | Question | Pick |
|---|---|---|
| r2-many | More than one card is waiting. How do you know? | **A** Peeking edges behind the card |
| r2-desk | Desktop layout, take two | **A** Card beside the shaft |
| r2-launchbtn | The big red launch button | **A** Mushroom button |
| r2-ore | How should ore look on the belts? | **A** Glowing chunks, colored by source |
| r2-buttons | Later left, Continue right. How big? | **C** Continue as a tab |
| r2-callout | The callout when you tap a machine | **C** The name tag grows |

## Round 1 (11:16)

| # | Question | Pick |
|---|---|---|
| phone-nav | How do you move up and down the shaft? | **B** Snap to floors |
| home | What do you see the moment you open the app? | **B** Parked on what needs you |
| tap | You tap a machine. What opens? | **B** Callout on the thing |
| labels | Name tags on machines? | **B** Only on tap or hover |
| items | What does a piece of work look like? | **A** Ore, colored by source. Note: no flat red squares; a distinct highlight or ore color instead |
| touchwork | Can you touch the work itself? | **B** Tap a cart: Rush or Park |
| cardpos | Where does the card live? | **A** Always bottom. Note: Continue right, Later left, swipeable |
| launch | How do you say yes to a launch? | **B** Press and hold. Note: on the right, big red, with sound and a press-down |
| swipe | Swipe or buttons? | **B** Buttons first |
| many | Three or more cards waiting | Neither (redone as r2-many) |
| autonomy | How do you level up autonomy? | **A** A card |
| ship | Your PR merges. What happens? | **B** Big once, small after |
| fail | The checks catch a bug. Where does it show? | **A** On the work |
| sound | Sound? | **B** Soft foundry hum |
| start | The very first time you open it | **B** An abandoned foundry |
| locked | Things you haven't unlocked yet | **B** Visible but broken |
| repairhow | How do you start a repair? | **A** Tap the broken thing |
| cost | What does a repair cost? | **A** One real action |
| trust | Where does trust show? | **B** Lamps up the lift tower |
| reveal | Something just unlocked. How do you find out? | **B** Fly there, explain once |
| above | What's above the launch pad on day one? | **B** Dark scaffolding |
| firstissue | Your first issue goes into the line by... | **A** Re-railing the cart |
| phone | Phone layout | **A** Card over the map |
| desk | Desktop layout | Neither (redone as r2-desk) |

## Build order

At this documentation checkpoint, #331 is **in review**: the Needs you card on by default, Later left / Continue
tab right, peeking edges and the big red hold-to-launch mushroom button. No release is claimed; verify its merge,
Deploy and live-version receipt before calling these changes shipped.

Next, in small PRs straight to main through the merge queue:

1. Ore as glowing chunks colored by source; Steer = belt stops and work piles up (r2-ore, items, r3-steer).
2. Tap a machine: the name tag grows into the callout; tags only on tap or hover (r2-callout, tap, labels).
3. Phone: snap to floors and open parked on what needs you; desktop: card beside the shaft (phone-nav, home, r2-desk).
4. The factory grows: a permanent lamp per ship on the floor that built it; big celebration once, small after (r4-reward, ship).
5. Trust lamps in levels up the lift tower (r3-trust, trust). Built: `web/src/map/shaft/trust.ts`, four levels of five beside the launch lift.
6. The first run: dark foundry, one lit tunnel, floors light as repairs land, smallest safe first issue, watch the cart (r4-open, r3-firstrun, r4-firstpick, r4-wait, firstissue).
7. Repairs: tap the broken thing, hold to pry, quick swoop to what opened; next broken thing glows, the rest faint (implementation interpretation above; repairhow, r3-repair, r3-fly, r4-tease, r4-next).
8. After the last card: show the next repair with real numbers (r4-onemore).
9. Coming back: time-lapse of the day; pings only for a launch waiting (r3-return, r4-pull).
10. Cart Rush/Park from its callout (r3-rush, touchwork; needs a server action).
11. Steam-and-iron sound accents over the hum (implementation interpretation above; r3-sound, sound).
12. Earned controls: autonomy and new mines arrive as cards (r4-grow, autonomy).

## Round 5 (2026-10-27, Suggested options: the picks didn't save, so these ship until Justin says otherwise)

| Question | Pick | Where |
|---|---|---|
| A quiet station's tag (r5-quiet) | B: what it's waiting on (NEXT UP / WAITING ON YOU / READY) | #346 |
| Lamp rows full (r5-lamps) | A: every 10 lamps fold into a brass banner with the count | `web/src/map/shaft/trophies.ts` |
| Getting a second builder (r5-second) | A: a Suggested card, "Add a second builder?", once 3 PRs waited on the one builder; Go bolts one in | sim (`?scenario=pileup`); live needs a second runner job slot first |
| Failed twice (r5-rework) | A: a red Steer card, "#88 failed twice", with the reason and Try again | `server/src/gauntlet.ts` `reworkMove` |
| Time to launch (r5-eta) | B: only in the cart's callout, "About 6 min to launch", learned from real stage times | `web/src/ui/eta.ts` |
| A third counter (r5-counter) | A: keep two | no change |
