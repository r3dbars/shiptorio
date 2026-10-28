# The simple screen

> Status: behind `?simple=1` (2026-10-28). Thread "Simplify the whole game UI". Audit and picks:
> https://claude.ai/artifact/F2Rd8CtzAxJhH1sfDCriLT. Builds on docs/ATTENTION.md (one card shape, Continue/Later)
> and the calm pass (one map marker).

Justin, 2026-10-28, on the live r3dbars/testing factory: "very overwhelming and confusing ... the planner's pinging,
the codex assembler's pinging ... Sentry needs to be connected, PostHog's not connected ... we need to simplify this
drastically." He wants one place for every task, the camera taking you to each one with a plain explanation, and to
always know what the bottleneck is and how to stop being it.

## The audit (13 things talking on one screen)

| # | What | Verdict |
| --- | --- | --- |
| 1 | Big SHIPTORIO plate | Shrink to a small wordmark |
| 2 | "Waiting on you 12" | Becomes the tray count (only what's parked on you) |
| 3 | "Shipped 1" | Keep |
| 4 | Planner spend chip | Menu |
| 5 | Menu button | Keep |
| 6 | Big red Steer card ("stuck at queued") | A card in the tray; stale ones dropped (#474) |
| 7-9 | PLANNER / ASSEMBLER chips saying NEEDS YOU / WAITING ON YOU | Cut: the card already says it |
| 10 | STEAM / DYNAMO "working 100%" | Cut: nothing to do there |
| 11 | "GitHub issues 12 waiting" | Cut: the slow-spot line says it when it matters |
| 12 | Sentry / PostHog / Support inbox "not connected" | Cut: one Idea card in the tray, tunnels stay dark |
| 13 | Painted floor signs (PLAN + BUILD, MINE) | Keep: they're the art |

## The rule

1. **One slow-spot line**, top center. "You · 3 waiting" when work is parked on you; otherwise the jammed stage with
   the bottleneck engine's numbers; otherwise all clear. Ideas never make you the slow spot. Tap it to open the tray.
2. **One task tray**, bottom center. Every ask is a card: Approve (amber), Stuck (red), Idea (teal). One at a time,
   "2 of 9". Swiping only browses (answering always takes a button) and the camera flies to the machine the card is
   about. The card says what's going on and what Go does. Go runs the suggested option (a launch is still the held red
   button), Later parks it a day, Edit/More opens the plan, the proof and the other options.
3. **A quiet map.** No chips, item tags or pings, except the machine the current card is about (and anything you tap
   or hover, or every label when the keyboard is on the map).
4. **Getting yourself out of the way**: approve cards say how far the next autonomy level is ("2 more suggestions
   approved as-is, then the factory stops asking").
5. **Everything else is behind the menu.**

Code: `web/src/ui/TaskTray.tsx`, `web/src/ui/slowSpot.ts`, `ShaftHud.quiet` in `web/src/map/shaft/hud.ts`.

## Journey picks (Justin, 2026-10-28 15:06)

From https://claude.ai/artifact/8ceP1bPLxWcxKrFf5ab1Km (answers in its `picks/journey` db doc).

| # | Question | Pick | Where it lives |
| --- | --- | --- | --- |
| 1 | First open | C: no tour, learn by doing | `?simple=1` turns off the first-run tutorial, build-as-you-go and the morning brief |
| 2 | Connect your repo | C: play first, setup cards later | the demo shop; signing in is a card after a rocket (#359) |
| 3 | Plug in your Mac | B: a setup card with one command | the agent card's Go opens the Power sheet's one-line install |
| 4 | Is my Mac working? | B: a small lamp by the counters | `MachineLight` (#474) inside the compact floor card |
| 5 | Dim the rest | C: hard spotlight | default `data-look="glass hard"` |
| 6 | Solid or see-through | B: glass | same |
| 7 | Shipping a PR | A: hold the red button | `HoldLaunch` on launch cards |
| 8 | Phone, 30 seconds | A: map + one card | the tray opens on its own when there's a card |
| 9 | Desktop | A: same as the phone | one layout |
| 10 | New tools over time | none: "for v0 this needs to be drastically simplified" | nothing new shows up on the simple screen; extras stay in the menu |
| 11 | How much the agent does alone | none: "the magic sauce" | thread "Teach the factory to automate what you approve" |

Pick 11, in Justin's words: the agent runs the game and keeps its own evals of what you approve as-is, change, push
Later or dismiss. A dismiss is a chance to tweak the task or suggest something else. Over time it suggests what you
actually take. Start very simple: a dots meter on the card (●●○) with one plain sentence, like "2 more yeses and the
factory does this for you". The meter sits on the approve card where the `.tearn` line is now.

## Round 3 picks (Justin, 2026-10-28 15:25)

Same picks page, db doc `picks/journey3`.

- **Glass:** smoky (the default). **Spotlight:** medium, and what the card is about sits in the middle of the screen,
  phone and desktop (`ShaftScene.applyBias`: no bias on the simple screen while focused).
- **Cards show the title only.** Gestures: right = Continue (a launch needs the swipe to cross over half the card, or
  the held red button), left = Later, up = the details, down = never show this again, with an optional one-tap why
  (Wrong idea → `wrong`, Do it differently next time → `once`; no tap → `once` after 6 s). Every gesture has a button.
- **First card:** Go glows until your first Continue. **Count:** "1 of 9" with arrows.
- **Top line:** hidden. It only shows when the factory itself is jammed (not when it's waiting on you: the card says that).
- **After your last card:** zoom out over the whole factory, "All caught up. N things moving." Following your own
  PRs through the factory is its own thread ("Follow your work through the factory").
- **Mac setup card:** "Your Mac writes the code" (why first). **Lamp:** just the lamp, no words (#474).
- **Dots meter:** "Approve 2 more like this and then it's automatic" (`LearnDots`, #480).

## Follow your work (round 3 pick 8, thread "Follow your work through the factory")

Justin: "allow them to follow the PRs or the issues they're creating through the whole journey ... click here to see
what things are moving through the factory and then they kinda cycle through if there's more than one thing."

- After your last card, with work in flight, the tray shows one **All caught up** card: "3 things moving through the
  factory", **Follow them** (the next idea, if any, is a small second button). Nothing in flight: the old centered
  "All caught up." line and the idea card.
- **Follow them** rides one piece of work at a time: the `item:<id>` focus key pins the shaft's follow cam to that real
  item (`ShaftStage.followRef`; the whole shaft if it isn't drawn yet). The spotlight sits on it, centered, and it keeps
  its one tag. The card shows what it is, where it is now ("In checks"), the PR link, "2 of 3" arrows and **Done**. It
  moves on to the next one every 8 s.
- Order (`ui/moving.ts`): furthest along first, newest first within a stage; the work your last yes was about first.
