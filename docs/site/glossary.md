---
title: Glossary
description: Every game word and the real thing behind it.
section: Reference
order: 3
---
# Glossary

## The line

Every station has one name, and the game uses it everywhere: on the deck, on cards, in captions and on GitHub.

| Station | What happens there |
| --- | --- |
| **Repo** | Your GitHub issues wait here |
| **Planner** | Spark reads an issue and writes a plan |
| **Builder** | Your agent (Codex or Claude Code) builds the change and opens a PR |
| **Checks** | The CI check, the proof check and any researched checks run on the PR |
| **Review** | Spark reviews the diff, from a different model family than the builder |
| **Gate** | You decide: hold Ship it to merge |
| **Launch** | The merge lands and the rocket goes up |

## Other words

| Game word | Real thing |
| --- | --- |
| **Factory** | One GitHub repo |
| **Island**, **district** | The repo, and its top-level folders |
| **Ore** | A piece of work: a GitHub issue, a Sentry error, a PostHog drop |
| **Mine** | A source of ore. See [Mines](/docs/sources) |
| **Biter** | A Sentry error swarming a district |
| **Spark** | Meta Muse Spark, the model that sorts, plans, reviews and picks your next card. See [How Spark decides](/docs/spark) |
| **Power plant** | A signed-in agent subscription on your machine. See [Connect your machine](/docs/runner) |
| **Gauntlet** | The checks every PR runs. See [The gauntlet](/docs/gauntlet) |
| **Station** | One stop on the line: Repo, Planner, Builder, Checks, Review, Gate or Launch |
| **Rework belt** | Where failed PRs go back, with a scar tag |
| **Scar tag** | Which station failed a PR, why, the evidence, and the strike number |
| **Rocket** | A merged PR |
| **Orbit watch** | The 24 hours after a merge. See [Orbit watch](/docs/orbit-watch) |
| **Science pack** | One shipped PR, spent on research |
| **Research** | New checks that run on every PR. See [Research](/docs/research) |
| **Lane** | The part of the repo a PR touches: docs, or one top-level folder |
| **Clean ship** | A PR that passed every station the first time and merged through the game |
| **Launch permit** | A lane's right to merge clean PRs on its own. See [Launch permits](/docs/permits) |
| **Automated %** | Rockets launched on a permit, over all rockets |
| **Bottleneck** | The stage with the most value waiting the longest |
| **Needs you card** | The one card waiting on you at the bottom of the map: Later on the left, Continue on the right, hold the red button to launch |
| **Check-in** | A deck of up to 12 cards you swipe through. See [Needs you and check-in](/docs/check-in) |
| **Escaped defect** | A launched PR that came back: a Sentry comeback, a revert, or red on main |
| **Ship Score** | Users unblocked + 10 × customers answered + rockets, minus 25 × escaped defects |
