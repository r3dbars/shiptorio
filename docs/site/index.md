---
title: Shiptorio docs
description: What Shiptorio is, how the line works, and how to point it at your own repo.
section: Start here
order: 1
---
# Shiptorio docs

Shiptorio is a game over your GitHub repo, played on one 2D pixel deck with Shippy. GitHub issues ride a conveyor through seven stations, AI agents do the work, and in a live factory each rocket is a confirmed merged pull request. The tutorial uses sample work.

There's always a bottleneck, and it's usually waiting on one of your calls. Shippy the robot parks on it and a card shows up at the bottom of the screen. Swipe it and the line moves. Approve the same kind of thing three times and the factory does that kind on its own, so you're free for the next jam.

## The line

**Repo → Planner → Builder → Checks → Review → Gate → Launch**

1. **Repo.** Your open GitHub issues wait here. You pick one to start.
2. **Planner.** Shippy, powered by Meta Muse Spark, reads the issue and the code and writes a small plan: which files, what changes.
3. **Builder.** Your own coding agent (Codex or Muse Code, on your own machine) builds it and opens a PR.
4. **Checks.** CI runs, plus a proof check that the fix really fixes the issue.
5. **Review.** Shippy reviews the diff.
6. **Gate.** You hold **Ship it** to merge.
7. **Launch.** GitHub merges it and the rocket goes up.

More on each station: [The line](/docs/the-line).

## Where to start

- New here? [Getting started](/docs/getting-started) walks through the tutorial and then your own factory.
- Ready for a real repo? [Install the GitHub App](/docs/github-app), then [connect your machine](/docs/runner).
- How the factory learns to run itself: [Trust](/docs/trust).
- How the brain works: [Shippy's brain](/docs/spark).
- Run your own copy: [Self-host with your own keys](/docs/self-host).
- What happens to your code: [Security and privacy](/docs/security).

> **Heads up** Shiptorio is in private preview while we build it during the Meta AI Developer Hackathon (Oct 26 to Nov 4, 2026). These docs are public. On [shiptorio.dev](https://shiptorio.dev) the tutorial is open to everyone. The preview password only comes up when you create your own factory, and only allow-listed GitHub accounts can connect a real repo. shiptorio.com still shows its landing page and waitlist.
