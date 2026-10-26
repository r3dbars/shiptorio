---
title: Welcome to Shiptorio
description: Shiptorio turns your repo into a factory game. Every rocket is a real merged pull request.
section: Start here
order: 1
---
# Welcome to Shiptorio

<p class="lede">Your codebase is a factory. Issues and errors are the ore. Your own AI agents are the machines. Every rocket that launches is a real merged pull request.</p>

![A Shiptorio factory: the island, the line of machines, and the launch pad](/docs/img/hero.png)

## The idea in one breath

AI writes code fast now. The slow part is you: deciding what it should build, what it has to check, and what it has to prove. Shiptorio makes those calls visible and quick.

But faster approvals are only step one. The game keeps pushing you to **add more checks and verify everything**. Every check you add and every clean ship earns trust, and the factory runs more of itself over time. **Verify, then automate.** That's the whole point.

## How the loop works

1. **Ore comes in.** GitHub issues, Sentry errors and PostHog drops land on the map as ore. See [Mines](/docs/sources).
2. **Spark plans it.** Meta Muse Spark reads the ore, sorts it, picks the files and writes a plan. It never writes code. See [How Spark decides](/docs/spark).
3. **Your agents build it.** Claude Code or Codex, running on your own machine and your own subscription, makes the change and opens a PR. See [Connect your machine](/docs/runner).
4. **The gauntlet checks it.** CI, the verify bay and AI review all have to pass. Fails ride the rework belt back. See [The gauntlet](/docs/gauntlet).
5. **You launch it.** Your merge launches the rocket. Orbit watch keeps an eye on it for 24 hours. See [Orbit watch](/docs/orbit-watch).
6. **Trust grows.** Ship clean enough times in one lane and it earns a launch permit, so those PRs ship without you. See [Launch permits](/docs/permits).

There's always a bottleneck, always a next move. That's the game.

## Where to start

- New here? Start with [Getting started](/docs/getting-started). You can play the sandbox in your browser with no sign-in.
- Ready to hook up a real repo? [Install the GitHub App](/docs/github-app), then [connect your machine](/docs/runner).
- Curious how the brain works? Read [How Spark decides](/docs/spark), or the judge page [How Meta Muse Spark runs Shiptorio](/art/spark.html).
- Wondering what happens to your code? [Security and privacy](/docs/security).

> **Heads up** Shiptorio is in private preview while we build it during the Meta AI Developer Hackathon (Oct 26 to Nov 4, 2026). The app at shiptorio.com is password-gated and only allow-listed GitHub accounts can sign in. These docs are public. The sandbox works for everyone who can reach the app.
