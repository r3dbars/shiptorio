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

## What a permit does

With a permit, a PR in that lane that is on the pad and passed every station with no scars **merges on its own**. The log says "Rocket launched on its own: PR #N merged on the docs launch permit."

Before an automatic launch, Shiptorio rechecks the current PR files and commit against the permit. A changed lane or a commit that changes during that check stops the launch for player review.

Anything that needs rework still comes to you.

## Losing a permit

One slip and the lane starts over. A permit is revoked, and the streak resets, the moment any PR in that lane:

- fails CI, a researched check, the verify bay or AI review
- trips [orbit watch](/docs/orbit-watch) after launch (a Sentry comeback, a revert, or red checks on main)

The log says "docs lost its launch permit: ... Its PRs wait for you again until the lane earns trust back."

You can also turn a permit off by hand. Open **Make it yours**: every folder with a permit is listed under **Launch permits** with a **Turn off** button. Its PRs wait for you at the merge gate again, and the permit card won't ask about that folder until it ships clean three more times.

## Automated %

Once you've launched a rocket, the top bar shows **automated**: the share of all rockets that launched on a permit. Hover it to see which lanes ship on their own. That number going up is the whole point of the game.

## Autonomy levels

> **Coming soon** Levels are built and switched off behind a flag while they're tested on real factories. Until they're on, every factory stays at Advisor and only permits are live.

Permits are per lane. Levels are for the whole factory, and they're earned the same way: from what actually shipped clean, never from clicks.

| Level | Earned when | Spark may then, without asking |
| --- | --- | --- |
| **Advisor** | You connect a repo | Read, sort and suggest. Every card waits for you |
| **Floor** | 3 PRs shipped clean | Start plans: read the issue and the code and propose files and steps. No code changes until you approve the plan |
| **Build** | 8 PRs shipped clean, plus one launch permit | Approve its own plans so your agents start building, and send a failed PR back to the builder with its scar (3 scars and it's yours) |
| **Lights out** | A week at Build with no escaped defect, plus permits on most lanes | Take the launch permits your lanes earn, and keep running while you're away, inside your budget |

What never changes, at any level:

- Nothing merges except through the Launch card or a lane's permit, after every station passes on that exact commit.
- Each level comes up as a card first. **Not yet** asks again after 3 more clean ships.
- You can turn the level down anytime in **Make it yours**. Going back up takes the card.
- An escaped defect (orbit watch catching a comeback) drops the factory straight back to Advisor, and the clean count starts over.
