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
