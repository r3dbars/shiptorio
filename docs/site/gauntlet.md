---
title: The gauntlet
description: Every PR runs a line of checks before it can launch. CI, the verify bay, AI review, then your merge.
section: The loop
order: 1
---
# The gauntlet

Agent output is untrusted until it shows evidence. So between your assemblers and the launch pad, every PR runs **the gauntlet**: a line of stations, cheapest first. Anything that fails rides the **rework belt** back with a scar tag.

![The verify bay's station panel in the sandbox](/docs/img/gauntlet.png)

```
assembler
  → CI inspector
  → your researched checks
  → verify bay
  → AI review
  → merge gate (you)
  → rocket → orbit watch (24h)

fail anywhere → rework belt, with a scar tag
```

The full gauntlet runs on PRs your runner built (`shiptorio/runner-*` branches). Other PRs in the repo just get CI inspection before they sit on the pad.

## CI inspector

**Tag: cheap + fast.** Reads your repo's own CI (GitHub check runs and commit statuses) on the PR's current commit.

- **Pass** when every reported check passed, or was neutral or skipped.
- **Fail** when any check failed. The PR goes back with the failing check named.
- **Waits** while checks are still running, or if none have reported yet.

Researched checks (like the Secret scanner) slot in right after CI. See [Research](/docs/research).

## Verify bay

**Tag: done means evidence.** The verify bay wants proof that the fix works, not just that it compiles.

- A **docs-only** change (only `.md`, `.mdx`, `.txt` or files under `docs/`) passes. Nothing to reproduce.
- A **code** change has to bring a test. No test in the diff means "No proof: the PR changes code but adds no test that shows the fix works."
- When your runner built the PR, it also runs the regression test on the **base commit** (it must fail) and on the **PR head** (it must pass). That's the receipt: "Regression reproduced on base and passed on head."

> **Coming soon** Reproducing a bug against the running app, with a screenshot or log, is the next step for the verify bay. Today the proof is a test that fails before and passes after.

## AI review

**Tag: second opinion.** A hostile reviewer reads the PR diff and looks for what tests miss: the wrong approach, swallowed errors, security holes, scope creep.

- The reviewer is **Meta Muse Spark**, not the agent that built the PR, so the builder never grades its own work.
- It answers pass or rework, with up to five findings.
- The verdict is posted as a comment on the PR: "AI review passed" or "AI review sent this back".

## Merge gate

**Tag: you.** Once CI, every researched check, the verify bay and AI review pass, the PR moves to the launch pad and you get a **Launch card**:

> **Launch #N: the PR title**
> CI, the verify bay and AI review all passed. Your merge launches the rocket.

Tap **Launch #N** on the Next Move card, or swipe right in the [check-in deck](/docs/check-in). Right before merging, Shiptorio checks again that the PR hasn't changed since its checks ran and that CI is still green. If the PR moved, it goes back through the gauntlet. Then it squash-merges, and the rocket launches.

**Later** puts the card away for ten minutes.

A lane with a [launch permit](/docs/permits) skips the card: clean PRs there launch on their own.

## Orbit watch

**Tag: real world.** After the rocket launches, orbit watch keeps an eye on it for 24 hours. A comeback puts the fix back on the rework belt. See [Orbit watch](/docs/orbit-watch).

## The rework belt and scar tags

When a station fails a PR, it gets a **scar tag**: which station, why, a link to the evidence, and which strike this is for that station.

You get a card: **"CI inspector sent #N back"**, with the failure as the reason, and three options:

- **Send back to Codex/Claude with the scar** (Suggested). Your agent gets the failure as context and tries again. You approve its new plan first.
- **Look later.**
- **Overrule and launch.** You take responsibility and merge anyway.

After **three strikes from the same station**, the send-back option goes away. That item needs you.

Any rework also costs the lane its clean streak, and its launch permit if it had one.

## Tap a station

Every station on the map is a button. Its panel shows what it does, then:

- **In line**, **Oldest wait**, **Pass rate**, and **Caught this week** (bugs it stopped before shipping)
- what's in it right now, and the last log line
- a red **bottleneck** tag if this station is where work is piling up

> **Heads up** Station panels also show action buttons (like "Teach a verify recipe"). In the sandbox they work. On live factories they're not wired up yet, so use the cards instead.
