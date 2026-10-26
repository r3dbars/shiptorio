---
title: Research
description: Spend science packs on new checks that run on every PR.
section: Grow the factory
order: 1
---
# Research

Every PR you ship is a **science pack**. Spend them on new checks, and those checks run on every PR from then on. This is how the gauntlet gets stronger over time.

![The research tree](/docs/img/research.png)

## Science packs

Each merged PR adds one pack, colored by kind: **red** for bugs, **green** for features, **grey** for cleanup, **blue** for tests. The flask in the top bar opens the tree once you've shipped your first PR, and it glows when something is ready.

## The tree

| Tech | Tier | Cost | Unlocks after | Needs | What it catches |
| --- | --- | --- | --- | --- | --- |
| Leftover sweeper | 1 | 2 | 1 ship | | `debugger;`, `console.log` / `console.debug` in app code, `.only` in tests, merge conflict markers |
| Secret scanner | 1 | 2 | 1 ship | | AWS, GitHub, Stripe, OpenAI/Anthropic-style and Slack keys, private keys, `api_key = "..."` style assignments |
| Type guard | 2 | 4 | 3 ships | Leftover sweeper | `@ts-ignore`, `@ts-nocheck`, `as any` / `: any`, `eslint-disable`, `# type: ignore`, `# noqa` |
| Scope gauge | 2 | 4 | 3 ships | Leftover sweeper | PRs over 20 files or 400 changed lines |
| Dependency guard | 2 | 4 | 3 ships | Secret scanner | A manifest changed without its lockfile, or the other way round |
| Perf gauge | 3 | 8 | 8 ships | Scope gauge | Coming soon: needs the runner to time your app |
| Visual diff camera | 3 | 8 | 8 ships | Type guard | Coming soon: needs the runner to take screenshots |
| Canary tower | 3 | 10 | 10 ships | Dependency guard | Coming soon: needs deploy hooks |

The tier 1 and 2 checks read the lines a PR adds, so they're instant and free. Test files are skipped where it makes sense (a `console.log` in a test is fine).

## What researching does

Pick a tech and hit **Research**. A new station drops onto the line right after the CI inspector, and the rest of the line slides along. The log says "Researched: Secret scanner. It now checks every PR right after CI."

From then on, a failure on that station is a normal gauntlet failure: the PR rides the [rework belt](/docs/gauntlet#the-rework-belt-and-scar-tags) with a scar naming the check, and the lane loses its clean streak.

## Suggested research

When two or more PRs got sent back for the same kind of mistake, and a tech would have caught it, that tech gets a **Suggested** tag:

> CI inspector sent back 2 PRs for this. Leftover sweeper would have caught them in a second, before anything expensive ran.

Spark can override that pick when it sees a better fit. Once you can afford it, it's offered once as a card: **Research Leftover sweeper?** After that, the tag stays in the tree.

Try it in the sandbox: [?source=sim&scenario=research](/?source=sim&scenario=research).
