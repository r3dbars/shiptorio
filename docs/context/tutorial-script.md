# Shippy's tutorial script

The guided opening Justin asked for on 2026-10-29: Shippy first, smallest platform, zoomed in on him. He tells the
story one card at a time, at the player's pace, builds each station and names it, then asks you to approve the PR at
the Gate and launches the rocket.

Source of truth: `web/src/deck2d/story/script.ts` (`TUTORIAL`). Change words there, then update this table.
Wiring (camera, build, poses on the deck, the card's animated Shippy) belongs to thread
"Polish the first 20%: meet Shippy and build the factory".

Rules: one or two short lines per card (each line 56 characters max), station names are the locked seven words,
the model is named once through `CREDIT` ("powered by Meta Muse Spark"). Guard: `web/test/tutorial-script.test.ts`.

| # | Focus (zoom) | Shippy | Builds | Shippy says | Button |
|---|---|---|---|---|---|
| 1 | Shippy (close), small deck | peek | | Hi, I'm Shippy! / Really nice to meet you. | Hi Shippy |
| 2 | Shippy (close) | happy | | This is a game that mirrors your GitHub repo. / What you decide here really happens there. | Got it |
| 3 | Shippy (close) | inspect | | I'm an AI agent, powered by Meta Muse Spark. / I'll suggest what to do next, one card at a time. | Nice |
| 4 | Shippy (close) | poke | | I learn from what you connect. GitHub first. / Later, your issues and feedback too. | Okay |
| 5 | Deck (wide) | walking | | Software is a factory. / Ideas go in one end. Shipped code comes out the other. | Show me |
| 6 | Repo (mid) | weld | Repo | This is Repo. / Your GitHub issues land here. | Next |
| 7 | Planner (mid) | weld | Planner | Planner. / I read an issue and write a short plan. | Next |
| 8 | Engine (mid) | carry | steam engine | This steam engine powers the whole line. / You'll power it with your own Codex or Muse Code. | Next |
| 9 | Builder (mid) | weld | Builder, deck grows to medium | Builder. / Codex writes the code, on your computer. | Next |
| 10 | Checks (mid) | weld | Checks | Checks. / Your tests run here. Broken code stops. | Next |
| 11 | Review (mid) | weld | Review, deck grows to large | Review. / A second look before anything ships. | Next |
| 12 | Gate (mid) | weld | Gate | Gate. / Nothing merges until you say yes. | Next |
| 13 | Launch (mid) | inspect | launch island + rocket | Launch. / Merged, and it's live. That's the goal. | Next |
| 14 | Deck (wide) | happy | | That's your factory. / When something glows yellow, it's waiting on you. | Got it |
| 15 | Gate (mid) | lever | | A PR is waiting at the Gate. / Approve it and I'll show you how shipping works. | Approve (hold) |
| 16 | Rocket (wide) | happy | | Shipped! That's how it works. / Now let's build yours. | Pick my repo |

Notes for wiring:
- "engine" focus = the boiler bay at the left end of the deck (it isn't a stop, so `CardView.stop` can't name it yet).
- A build plays to the end before its card can be swiped (one thing moves at a time).
- Card 15 is the only one that ships code, so it needs a held press or a full swipe. For a guest it ships the sample
  PR; with a real repo it's the real one.
- Card 8 names Codex and Muse Code (Justin, 2026-10-29). Never name Claude in player text. The Muse Code engine in
  the runner is being built in thread "Let the steam engine run on Meta's coding agent".
