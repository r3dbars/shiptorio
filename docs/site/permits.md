---
title: Launch permits
description: Ship clean enough times in one lane and it earns the right to launch on its own.
section: The loop
order: 3
---
# Launch permits

Day one, every PR waits for you. That's on purpose. Autonomy is **earned by playing**: ship clean enough times in one part of your repo and Shiptorio offers to let that part ship on its own.

## Lanes

Every PR has a **lane**, based on the files it touches:

- **docs**: every file is markdown or text (`.md`, `.mdx`, `.txt`) or lives under a `docs/` folder.
- **/folder**: every file is inside the same top-level folder, like `/web` or `/server`.
- **No lane**: root files, or files across more than one folder. These always wait for you.

## Earning a permit

A **clean ship** is a PR that passed every gauntlet station the first time, with zero rework, and was merged through the game. Overrules and merges done straight on GitHub don't count.

| Lane | Risk | Clean ships in a row |
| --- | --- | --- |
| docs | low | 5 |
| any folder | medium | 10 |

Hit the streak and you get a card:

> **5 docs PRs shipped clean, zero rework. Let docs ship on their own?**
> Every one passed CI, the verify bay and AI review the first time. With a permit, docs PRs that pass every station launch without waiting on you.

Pick **Allow** (Suggested) or **Not yet**. Not yet asks again three clean ships later. The card only shows up when nothing else needs you.

![A permit card](/docs/img/permit.png)

## What a permit does

With a permit, a PR in that lane that is on the pad and passed every station with no scars **merges on its own**. The log says "Rocket launched on its own: PR #N merged on the docs launch permit."

Anything that needs rework still comes to you.

## Losing a permit

One slip and the lane starts over. A permit is revoked, and the streak resets, the moment any PR in that lane:

- fails CI, a researched check, the verify bay or AI review
- trips [orbit watch](/docs/orbit-watch) after launch (a Sentry comeback, a revert, or red checks on main)

The log says "docs lost its launch permit: ... Its PRs wait for you again until the lane earns trust back."

> **Coming soon** A button to turn a permit off by hand. Until then, a permit only goes away on its own when a PR in that lane slips.

## Automated %

Once you've launched a rocket, the top bar shows **automated**: the share of all rockets that launched on a permit. Hover it to see which lanes ship on their own. That number going up is the whole point of the game.

## What's next for autonomy

Permits are the first rung. The plan is a ladder of trust, from Advisor (Spark only suggests) up through routing and building on its own, to Lights out (the factory runs while you sleep and you get a morning summary). Only permits are live today.
