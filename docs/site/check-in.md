---
title: Needs you and check-in
description: The Needs you card always shows the one thing waiting on you. The check-in deck lets you clear everything in two minutes.
section: The loop
order: 2
---
# Needs you and check-in

In an AI loop, the human is the bottleneck. So Shiptorio always points at you, and makes it quick to get out of the way.

## The bottleneck

Every tick, the factory looks at each stage of the line (intake, build, CI, verify, review, the pad, and so on) and asks: how much value is waiting here, and for how long? The stage with the highest **value × wait** is the bottleneck. It's plain math on real state, not a model's guess, so it's stable.

If work is ready to build but no agent is plugged in, the bottleneck is power. Fix one bottleneck and the next one shows up. That's the game.

## The Needs you card

Always on screen at the bottom, one card at a time: anything stuck first, then work parked on your yes, then ideas. **Later** is on the left and parks it for a day. **Continue** is the tab down the card's right edge (or swipe right) and runs the Suggested option. **Details** shows the plan and the other options. When more cards are waiting, their edges peek out behind this one; tap the card to open the check-in deck.

A **Launch** card is different: its right edge is a big red button you press and hold until the ring fills. A tap or a swipe never merges. Keyboard: hold Space or Enter. Screen reader: activate twice within five seconds. The hold plays four countdown clanks; sound captions announce when a hold starts, is cancelled, or sends a launch request. A request is not a completed launch.

Add `?attention=0` to the URL to get the older Next Move card below for one more release.

## Catching up when you return

The comeback replay shows launches that really happened while you were away. If new factory state changes the shaft layout during replay, the replay ends and the live line returns immediately, including any PR waiting at the gate. You can also skip the replay.

## The Next Move card

The older card, behind `?attention=0`. It says:

- **what's stuck**, in one line with real numbers
- **why it matters**
- **one to three buttons**, one tagged **Suggested**

A build card has **See the plan and files**, so you can see exactly what will change before you say yes. A ship card links the PR.

If nothing needs a card, it shows the bottleneck and a button to open that station.

![A Next Move card in the sandbox: a checkout crash hitting 112 users, ready to send to Claude Code](/docs/img/next-move.png)

## The check-in deck

When more than one card is waiting, a **Check in** chip appears. Open it and you get a deck of up to 12 cards, ranked. Swipe through them and walk away.

While your local runner is planning or handling an approved build, the general build-bottleneck reminder stays quiet. Plan approvals, connection problems, failed checks and Launch still get their own cards.

![The check-in deck](/docs/img/checkin.png)

| Gesture | Button | Key | What happens |
| --- | --- | --- | --- |
| Swipe right | Do it → | → | Runs the Suggested option |
| Swipe left | Later ← | ← | Comes back next check-in |
| Swipe down | Never ↓ | ↓ | Gone, plus one tap on why |
| Swipe up | Details ↑ | ↑ | The plan, the evidence, and every option |
| Tap | | | Flies the map to that spot |

**Never** asks why, with one tap:

- **Just this one.** Only this card goes away.
- **Not this kind.** Saved as a rule. That kind of card stops coming for that scope.
- **Handle these for me.** Counts as a vote of trust.
- **Wrong call.** A note the planner reads next time.

Every swipe can be undone for five minutes. Push a card to **Later** three times and it comes back asking "Never, or let the factory decide?"

## Teach the factory

After your first yes, plan cards and plan approvals carry a row of dots: **●●○ Approve 1 more like this and then it's automatic.** Each Continue on that kind of card, in that folder, fills a dot. Fill all three and the factory starts and approves those plans on its own from then on. **Later**, picking another option, or **Never** empties the dots again, and **Just this one** also tells the planner to try a different version or something else next time.

Launching is never learned: the red button always waits for you. If work the factory started on its own comes back from the gauntlet, that kind of card goes back to asking you. See everything it learned in **Make it yours**, where **Ask me again** turns one off.

## Swipe right only on proof

A ship card shows its gauntlet stamps: ✓ or ✕ for CI, the verify bay and AI review. If any stamp hasn't passed, the card is **locked**: "No merge on swipe · not proven yet." Swiping right runs the missing check instead of merging. That rule is what makes fast swiping safe.

## How the deck is ranked

Each card scores **value × minutes waited**. Cards that **grow the loop** get a bonus: adding a check (+1 CHECK), connecting a source (+1 SOURCE), or handing off work (+1 AUTOMATION). Spark can then reorder the deck and pick the Suggested option on each card, except on locked ones.

When the deck is empty you see "All clear" and a tally. The score isn't how many you cleared. It's how few need you tomorrow.

Open the deck straight away with [?checkin](/?source=sim&scenario=checkin&checkin) on any factory URL.

### Decisions while reconnecting

Plan/build approvals, Launch choices, Later and dismiss taps on an already-seen card stay in memory for that factory tab during brief interruptions. Unacknowledged consent replays only after a fresh snapshot confirms the same complete offered plan/options. Changed plans require a fresh player choice; removed cards acknowledge the intent. Later uses one UUID per intent across retries, so the server can repark it without another lesson/count. Closing or changing the factory clears that memory.

A ten-second acknowledgement watchdog is independent of heartbeat. Retries stop after three send attempts or one minute, then ask the player to check the factory and retry. Only single-action plan_runner_job, approve_runner_job and request_merge choices replay automatically, plus Later/dismiss. Persistent inspect/check-queue choices send once online and ask for explicit retry if offline; other machine writes never replay. This grants no approval or Launch permission.

### Reliable decisions and step status

A repeated Later delivery parks the same card once; it does not count as several decisions or teach automation. The next check-in can offer it again. Repeated approvals keep the same approved runner job and count one approval lesson. Reconnecting restores the saved cards and current job state; a tap alone never marks a build or launch complete.

The optional `pipeline` snapshot/patch field summarizes planner, builder, checks, review, gate and launch. Each step has `state` (`idle`, `working`, `stuck`, `waiting_player`, `done`), a safe `cause` code, up to 40 example `itemIds`, and the current actionable `moveIds`. `PIPELINE_REASONS` in the shared package explains causes without copying provider errors. Patches replace all six entries. Snapshots recompute from durable jobs and current runner presence; this projection is presentation, not another stored state machine. Existing move/option IDs and server validation still control actions. Clients must retain pending taps until authoritative state changes; the projection grants no approval or Launch permission.


Later may carry an optional `intentId` UUID. It is correlation, never permission. The server saves a bounded player/card/scope receipt together with the parked decision; losing the acknowledgement and reconnecting cannot count that same intent as another Later. A genuinely new player tap uses a new UUID. Clients without this field remain compatible.
