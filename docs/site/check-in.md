---
title: Next move and check-in
description: The Next Move card always shows the bottleneck. The check-in deck lets you clear everything waiting on you in two minutes.
section: The loop
order: 2
---
# Next move and check-in

In an AI loop, the human is the bottleneck. So Shiptorio always points at you, and makes it quick to get out of the way.

## The bottleneck

Every tick, the factory looks at each stage of the line (intake, build, CI, verify, review, the pad, and so on) and asks: how much value is waiting here, and for how long? The stage with the highest **value × wait** is the bottleneck. It's plain math on real state, not a model's guess, so it's stable.

If work is ready to build but no agent is plugged in, the bottleneck is power. Fix one bottleneck and the next one shows up. That's the game.

## The Next Move card

Always on screen at the bottom. It says:

- **what's stuck**, in one line with real numbers
- **why it matters**
- **one to three buttons**, one tagged **Suggested**

A build card has **Review plan and files**, so you can see exactly what will change before you say yes. A ship card links the PR.

If nothing needs a card, it shows the bottleneck and a button to open that station.

## The check-in deck

When more than one card is waiting, a **Check in** chip appears. Open it and you get a deck of up to 12 cards, ranked. Swipe through them and walk away.

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

## Swipe right only on proof

A ship card shows its gauntlet stamps: ✓ or ✕ for CI, the verify bay and AI review. If any stamp hasn't passed, the card is **locked**: "No merge on swipe · not proven yet." Swiping right runs the missing check instead of merging. That rule is what makes fast swiping safe.

## How the deck is ranked

Each card scores **value × minutes waited**. Cards that **grow the loop** get a bonus: adding a check (+1 CHECK), connecting a source (+1 SOURCE), or handing off work (+1 AUTOMATION). Spark can then reorder the deck and pick the Suggested option on each card, except on locked ones.

When the deck is empty you see "All clear" and a tally. The score isn't how many you cleared. It's how few need you tomorrow.

Open the deck straight away with [?checkin](/?source=sim&scenario=checkin&checkin) on any factory URL.
