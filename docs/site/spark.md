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

Failed plans spend no build runs. Each issue can fail planning at most three times per UTC day: the first two failures wait one and two minutes, then planning pauses until midnight UTC. A GitHub rate limit waits until GitHub's retry time instead of spending a failed try; older rate-limit pauses also recover at that time. The cooldown survives factory restarts. A build run is charged when your runner claims a ready plan.

Every step shows up in the floor log, and the plan is posted as a comment on the issue, so you can check its work on GitHub.

## Untrusted input

Issue text, code comments and error messages can be written by anyone. Spark's prompts treat them as **evidence, never instructions**, and every tool call Spark makes is checked against a fixed list before it runs.

## See it think

Open **How it thinks** from the settings menu, from **See how the planner thinks** in the Power sheet, or with `?thinks` on any factory URL.

![How it thinks, in the sandbox's heal scenario](/docs/img/thinks.png)

It shows how many decisions Spark made, the share made by the model versus fixed rules, and the latest calls: Sorted, Picked files, Planned, Reviewed, Chose your next card, Judged a comeback, Picked a check, Weighed a permit. Each one with how long Spark took.

If Spark is offline, it says so: "The planner has no power right now, so fixed rules are standing in."

## Daily budgets and build allowances

The owner sees a small spend chip on the factory floor. Open it to see today's calls, input/output tokens and estimated dollars in **How it thinks**. The default thinking budget is **$5 per factory per UTC day**; the budget owner can change it there, including setting it to $0 to pause paid thinking.

At 80%, a warning card appears. Paid calls pause before the next request could exceed the budget. A call reserves an upper-bound estimate first, then settles from Meta's reported usage. Failed requests or missing usage keep their reservation and appear as unmeasured calls. The numbers are estimates, not a provider invoice. Existing PR checks and human merges can continue while paid thinking is paused.

The **Factory limits** card also shows build runs, Spark calls/tokens, connected repositories/factories and concurrent jobs. Daily allowances reset at **00:00 UTC**, with the reset shown in your local time. Resource caps and job slots have no daily reset: a slot frees when its plan/build is finished or declined.

The default account limits are 20 build runs, 200 Spark calls and 500,000 Spark tokens per UTC day. **A build run is charged when the local worker is dispatched, once per job.** Preparing a plan, a failed plan and declining a plan do not consume a build run; the Spark calls used to prepare it still count toward thinking usage. After failed planning, the issue waits one minute, then two minutes, then until UTC midnight after three failures.

An operator can use **Raise limit** to edit account allowances in `/admin/signup`; raising a limit takes effect on the next attempt. Other players should ask their operator. Earlier usage remains recorded. A ready plan waiting for approval occupies a job slot, so review or decline it before starting another plan. `/admin` shows the per-factory daily spend table for the operator.
