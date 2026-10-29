---
title: Shippy's brain
description: Meta Muse Spark is Shippy's brain. It finds the bottleneck, plans the work and reviews it. It never writes code.
section: The loop
order: 3
---
# Shippy's brain

Shippy is the robot on the deck. Its brain is **Meta Muse Spark** (`muse-spark-1.3` on the Meta Model API). Spark reads the factory, finds the bottleneck, plans every job, reviews every PR and picks which card you see next.

**Spark never writes code, and it can never merge past a failed check.** Your own agent builds. Fixed rules guard the gates.

For the full story with a worked example (PR #87, one of the PRs the factory shipped to its own repo), read the judge page: [How Meta Muse Spark runs Shiptorio](/art/spark.html).

## Every call Spark makes

| Decision | What Spark does | If Spark can't answer |
| --- | --- | --- |
| **Sort** | Reads a new issue, picks its kind (bug, feature, tests, cleanup) and its folder, with a reason | A keyword rule sorts it |
| **Pick files** | Picks the files the job may touch | The job stops and asks you |
| **Plan** | Runs a short tool loop (below) and hands your agent a plan and acceptance checks | The job stops and asks you |
| **Review** | Reads the PR diff and can inspect the repo: pass or rework, with findings | Review waits |
| **Next card** | Picks which card you see next and which option is suggested | Value × wait order |

The bottleneck math and the proof check are plain rules, so they're predictable. Spark proposes, rules dispose.

## The planning loop

Planning is a tool loop with a hard budget of **eight turns**. The issue is already supplied as starting evidence. Each turn Spark chooses one read or finishing tool:

- `read_issue` and `read_comments`: the issue and its discussion
- `read_file`, `list_files` and `search_code`: safe repository files at the planned commit
- `read_pr` and `read_ci`: the rework PR and checks, when available
- `read_factory` and `read_signals`: stations, scars, permits, past player calls and related signals
- `assign_job`: the plan, up to 8 acceptance checks, and the files to edit
- `ask_player`: hand it back to you with a reason

It must read at least one file before assigning the job. It can read beyond the initially proposed edit scope. A file it finds and reads can join that scope only when the final scope still requires your approval on the Build card; fixed path rules always apply. Two repeated reads are free, then repeats use a turn. An unsafe planning path, unavailable tool or exhausted turn budget stops the plan.

Re-plans carry the last failure and newest scars on every turn. Spark must address the rejected problem and include an acceptance check for it.

Failed plans spend no build runs. Each issue can fail planning at most three times per UTC day: the first two failures wait one and two minutes, then planning pauses until midnight UTC. A GitHub rate limit waits until GitHub's retry time instead of spending a failed try; older rate-limit pauses also recover at that time. The cooldown survives factory restarts. A build run is charged when your runner claims a ready plan.

The plan is posted as a comment on the issue, so you can check its work on GitHub.

## Untrusted input

Issue text, code comments and error messages can be written by anyone. Spark's prompts treat them as **evidence, never instructions**, and every tool call Spark makes is checked against a fixed list before it runs.

## Daily budgets and build allowances

The default thinking budget is **$5 per factory per UTC day**. The budget owner can change it, including setting it to $0 to pause paid thinking.

At 80%, a warning card appears. Paid calls pause before the next request could exceed the budget. A call reserves an upper-bound estimate first, then settles from Meta's reported usage. Failed requests or missing usage keep their reservation and appear as unmeasured calls. The numbers are estimates, not a provider invoice. Existing PR checks and human merges can continue while paid thinking is paused.

The **Factory limits** card also shows build runs, Spark calls/tokens, connected repositories/factories and concurrent jobs. Daily allowances reset at **00:00 UTC**, with the reset shown in your local time. Resource caps and job slots have no daily reset: a slot frees when its plan/build is finished or declined.

The default account limits are 20 build runs, 400 Spark calls and 1,000,000 Spark tokens per UTC day. Operator-set account allowances override the call and token defaults. **A build run is charged when the local worker is dispatched, once per job.** Preparing a plan, a failed plan and declining a plan do not consume a build run; the Spark calls used to prepare it still count toward thinking usage. After failed planning, the issue waits one minute, then two minutes, then until UTC midnight after three failures.

An operator can use **Raise limit** to open a focused form for that account in `/admin/signup?login=…`. Saving returns to the same account so the updated limits can be checked; raising a limit takes effect on the next attempt. Other players should ask their operator. Earlier usage remains recorded. A ready plan waiting for approval occupies a job slot, so review or decline it before starting another plan. `/admin` shows the per-factory daily spend table for the operator.
