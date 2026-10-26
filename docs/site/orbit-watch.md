---
title: Orbit watch
description: After launch, orbit watch keeps checking for 24 hours. A comeback sends the fix back and costs trust.
section: The loop
order: 4
---
# Orbit watch

A merge isn't the finish line. "Done" means the problem is gone in the real world. So after every rocket launches, **orbit watch** keeps an eye on it for **24 hours**.

## What trips it

| Signal | What counts |
| --- | --- |
| **Sentry comeback** | The exact Sentry error this PR fixed fires again |
| **Sentry spike** | A new Sentry error in the same folder reaches 3 events. Spark judges whether this launch caused it. If it says no, the launch stays up |
| **Revert** | Someone opens or merges a PR titled "Revert ..." whose body says it reverts this PR |
| **Red on main** | A check fails, times out or can't start on the merge commit |

Sentry events in the first **15 minutes** after the merge are ignored, so a deploy has time to roll out.

## What a trip does

- The item gets an **orbit scar**, like "Sentry fired "TypeError: total is undefined" again 3h after #41 launched."
- It goes back to the rework belt. The old PR is done, so the fix needs a fresh PR.
- **Escaped defects** goes up by one, and your Ship Score drops by 25.
- The lane's [launch permit](/docs/permits) is revoked and its clean streak resets.

## Holding

If 24 hours pass with no trip, the log says "Orbit watch: #N held 24h with no comeback."

## In the station panel

Tap the orbit watch station to see what's **Watching**, the share that **Held 24h**, and what it **Caught this week**. Each launch shows the time left, or what tripped it: came back, reverted, or red on main.

Orbit watch gets much better with a [Sentry mine](/docs/sources#sentry) connected. Without one, it can still catch reverts and red checks on main.

See it happen in the sandbox: [?source=sim&scenario=orbit](/?source=sim&scenario=orbit).
