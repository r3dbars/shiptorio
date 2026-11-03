---
title: The line
description: The seven stations every issue rides through, and what each one really does on GitHub.
section: The loop
order: 1
---
# The line

**Repo → Planner → Builder → Checks → Review → Gate → Launch**

Each station has one name, and Shiptorio uses it everywhere: on the deck, on cards, in captions, in PR comments and in these docs. One crate is one piece of work. It keeps its identity the whole way: the issue number on the crate flips to the PR number once the PR exists.

## Colors

- **Yellow**: waiting on you. A card is at the bottom of the screen.
- **Red**: actually stuck. Something failed and needs fixing, not just a decision.
- **Green**: automatic. You taught the factory this step.
- **Cyan**: running right now.

Only one thing moves at a time, and only the jam pulses.

## Repo

Your open GitHub issues (not PRs) wait in a pile in front of Repo. Picking one with **Start issue** sends it down the line. Picking an issue never starts an agent by itself.

## Planner

Shippy's brain, Meta Muse Spark, reads the issue and the code and proposes a small plan: the exact files to change and how to check the fix. You see it on a **Start build** card. Nothing is built until you approve it, or until you've taught the factory that kind of plan (see [Trust](/docs/trust)). More: [Shippy's brain](/docs/spark).

## Builder

Your own coding agent builds the plan on your own machine: Codex or Muse Code, on your subscription, through the [local runner](/docs/runner). It pushes one commit to a `shiptorio/runner-*` branch and opens a PR. The server then re-reads the diff from GitHub and rejects it if it touched files you didn't approve or got too big.

## Checks

Your repo's CI runs on the PR, plus a proof check: a code change needs a test that fails on the old code and passes on the new. A failure turns the station red and sends the work back with the reason.

## Review

Shippy reads the diff and the repo and decides pass or rework, with findings. On a seeded test set it caught 10 of 10 bad fixes and passed 5 of 5 good ones ([results and limits](https://github.com/r3dbars/shiptorio/blob/dev/docs/EVAL.md)).

## Gate

You hold **Ship it**. Right before merging, Shiptorio checks the PR hasn't changed since the checks ran and that CI is still green. The Gate doesn't learn to merge from your approvals.

## Launch

GitHub confirms the merge and the rocket goes up. In a live factory, only a real, confirmed merge launches a rocket. The tutorial and simulator animate sample merges. Then a short "Shipped" line, and the next card.
