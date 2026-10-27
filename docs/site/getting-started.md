---
title: Getting started
description: Play the sandbox, then set up a real factory on your own repo in four steps.
section: Start here
order: 2
---
# Getting started

There are two ways in. The **sandbox** is a full factory running on sample data in your browser. A **live factory** runs on one of your real GitHub repos and ships real pull requests.

## Play the sandbox first

Open [shiptorio.com/?source=sim](/?source=sim). Nothing touches GitHub. Everything you see (ore, machines, the gauntlet, rockets) is simulated, but it's the same UI the live game uses.

![The sandbox factory](/docs/img/map.png)

A few sandbox scenarios are worth a look. Add them to the URL:

| Scenario | URL | What it shows |
| --- | --- | --- |
| Quiet morning | `?source=sim&scenario=quiet-morning` | A normal day. The default |
| First run | `?source=sim&scenario=first-run` | The guided first factory, one lesson at a time |
| Rework loop | `?source=sim&scenario=rework-loop` | PRs failing checks and riding the rework belt |
| Heal | `?source=sim&scenario=heal` | A checkout crash going from Sentry error to fix to rocket |
| Research | `?source=sim&scenario=research` | Science packs to spend, with a suggested check |
| Orbit | `?source=sim&scenario=orbit` | A launch tripping orbit watch |
| Check-in | `?source=sim&scenario=checkin` | A full deck of cards to swipe |
| Mines | `?source=sim&scenario=mines` | Sentry and PostHog mines feeding ore |

Add `&autolaunch` to let PRs on the pad merge themselves, which is handy if you just want to watch.

## The welcome tour

The first time you open Shiptorio, an eight-beat tour plays on a sample island. It shows you the idea by doing: you ship a checked PR, hand a whole kind of work off to the factory, watch the bottleneck move, and connect a new mine. You can skip it any time. To watch it again, open [shiptorio.com/?intro=1](/?intro=1).

## Set up a live factory

1. **Sign in with GitHub.** On the first screen, hit **Sign in with GitHub**. Shiptorio only uses your GitHub identity. No passwords.
2. **Pick a repo.** You'll see every repo the Shiptorio GitHub App is installed on and that you can reach. Not there? [Install the GitHub App](/docs/github-app) on it, then refresh.
3. **Watch the island rise.** Shiptorio reads the repo tree into districts and loads up to 50 open issues as ore. Spark sorts them.
4. **Plug in power.** Nothing gets built until one of your AI subscriptions is connected through the local runner. See [Connect your machine](/docs/runner).

Your live map lives at `https://shiptorio.com/?source=live&repo=owner/name`.

## What you'll see on the map

- **The island** is your repo. Each top-level folder is a district.
- **Mines** on the left produce ore: issues, Sentry errors, PostHog drops.
- **The line** runs ore through Spark's planner, your assemblers, then the gauntlet stations.
- **The launch pad** holds PRs that passed. A merge launches the rocket.
- **The Next Move card** at the bottom always says what's holding the factory back and the one thing to do about it.

Tap any station on the map to see what it does, what's waiting there and what it caught this week.

## Next steps

- Learn the [gauntlet](/docs/gauntlet), since that's where most of the game happens.
- Learn the [check-in deck](/docs/check-in), the fast way to clear everything waiting on you.
- Read the [FAQ](/docs/faq) if something looks off.

## Sound and music

The foundry soundtrack plays by default after your first click or keypress. It builds
with the factory, adds pressure when work is blocked, and resolves when a rocket launches.
Open **Activity → Settings** to turn music off or adjust its own volume separately from
other sounds. Your choices are saved in this browser. Press **M** to mute all sound.

For comparison, add `music=1` to the URL to hear the older score. The `music=2` option
still selects the new soundtrack, but is no longer needed.
