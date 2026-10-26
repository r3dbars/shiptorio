---
title: How Spark decides
description: Meta Muse Spark is the brain. It sorts, plans, reviews and picks your next card. It never writes code.
section: Grow the factory
order: 3
---
# How Spark decides

One model is the brain of every factory: **Meta Muse Spark** (`muse-spark-1.3` on the Meta Model API). It sorts your work, plans every job, reviews every PR, judges what happens after launch, and picks which card you see next.

**Spark never writes code, and it can never merge past a failed check.** Your own agents build. Fixed rules guard the gates.

For the full story with a worked example (PR #87, the first PR the factory built itself), read the judge page: [How Meta Muse Spark runs Shiptorio](/art/spark.html).

## Every call Spark makes

| Decision | What Spark does | If Spark can't answer |
| --- | --- | --- |
| **Sort** | Reads new ore, picks its kind (bug, feature, tests, cleanup) and its district, with a reason | A keyword rule sorts it |
| **Pick files** | Picks up to 4 files from the repo for the job | The job stops and asks you |
| **Plan** | Runs a short tool loop (below) and hands your agent a plan and acceptance checks | The job stops and asks you |
| **Review** | Hostile review of the PR diff: pass or rework, with findings | The AI review station waits |
| **Next card** | Reorders the check-in deck and picks the Suggested option | Value × wait order |
| **Judge a comeback** | Decides whether a Sentry spike was caused by a launch | Any spike in the folder counts |
| **Pick a check** | Picks which research would have caught recent misses | Scar text matched to checks |
| **Weigh a permit** | Words the permit card and picks Allow or Not yet | The streak rule suggests Allow |

The bottleneck math, the verify bay, permit streaks and orbit watch's facts are plain rules, so they're predictable. Spark proposes, rules dispose.

## The planning loop

Planning is a tool loop with a hard budget of **five turns**. Each turn Spark calls one tool:

- `read_issue`: the issue, title, body and labels
- `read_file`: one of the approved files
- `assign_job`: the plan, up to 8 acceptance checks, and the files
- `ask_player`: hand it back to you with a reason

It has to read the issue and at least one file before it can assign the job. Re-reading something doesn't cost a turn. Ask for a tool it doesn't have, or run out of turns, and the job stops. No silent retries.

Every step shows up in the floor log, and the plan is posted as a comment on the issue, so you can check its work on GitHub.

## Untrusted input

Issue text, code comments and error messages can be written by anyone. Spark's prompts treat them as **evidence, never instructions**, and every tool call Spark makes is checked against a fixed list before it runs.

## See it think

Open **How it thinks** from the settings menu (**powered by Meta Muse Spark · how it thinks**), from **See how the planner thinks** in the Power sheet, or with `?thinks` on any factory URL.

![How it thinks, in the sandbox's heal scenario](/docs/img/thinks.png)

It shows how many decisions Spark made, the share made by the model versus fixed rules, and the latest calls: Sorted, Picked files, Planned, Reviewed, Chose your next card, Judged a comeback, Picked a check, Weighed a permit. Each one with how long Spark took.

If Spark is offline, it says so: "The planner has no power right now, so fixed rules are standing in."
