---
title: FAQ
description: Quick answers about cost, safety, agents, and why things look the way they do.
section: Reference
order: 2
---
# FAQ

## Is this a real game or a dashboard?

A real game. Factorio-style map, rockets, research, the works. The difference is that every move ends as a real PR, a real merge or a real fix. If a feature doesn't cascade into something real, it's decoration.

## Does Shiptorio write my code?

No. Spark plans. Your own agents (Claude Code or Codex) write the code, on your machine, on your subscription. See [Connect your machine](/docs/runner).

## Which agents work?

Claude Code and Codex today. Each one you sign in to becomes a power plant on the map. More to come, including local models.

## Who pays for what?

Spark's thinking runs on Shiptorio's Meta API key. The building runs on your own Claude or ChatGPT subscription through the runner. GitHub, Sentry and PostHog are your existing accounts.

## Why is my factory paused at a quota?

The **Factory limits** card appears when a daily allowance is near its limit or exhausted.
It shows usage, the reset time in your timezone, and midnight UTC. Account admins can follow
**Raise limit** to the selected account's quota form; saving applies immediately. Return to
the factory to refresh the card, or leave it visible for its automatic refresh.
Configured owner accounts retain a minimum of 200 build runs per day.

Build runs are charged when a job starts building, not when planning fails. Failed plans
wait one minute, then two; after three failed tries for an issue in a UTC day, planning
waits until the next day. A new plan still needs your approval.

## Can it merge without me?

Only in a lane you gave a [launch permit](/docs/permits), and only for PRs that passed every station with zero rework. One slip and the permit is gone.

## Can it push to main?

No. Agents only push `shiptorio/runner-*` branches and open PRs. Protect `main` with GitHub branch rules too.

## Why did a PR fail the verify bay when CI was green?

The verify bay wants proof the fix works, not just that it builds. A code change needs a test, and on runner PRs that test has to fail on the old code and pass on the new. See [Verify bay](/docs/gauntlet#verify-bay).

## Why is my card locked?

A ship card is locked when a gauntlet stamp hasn't passed yet. Swiping right runs the missing check instead of merging. That's what makes fast swiping safe. See [Swipe right only on proof](/docs/check-in#swipe-right-only-on-proof).

## Why does nothing build?

Probably no power. Spark can read and plan, but something has to build: connect a runner with Claude Code or Codex signed in. The Needs you card will say "Your computer writes the code. Plug it in to start building."

## Why can't I sign in?

Shiptorio is in private preview. The app is password-gated and only allow-listed GitHub accounts can sign in. These docs are open to everyone.

## My repo isn't in the list.

Install the Shiptorio GitHub App on it and refresh. If someone else installed it, sign out and back in to refresh your repo list. See [Install the GitHub App](/docs/github-app).

## Does it work on my phone?

Yes. The map, cards and check-in deck are built mobile first. The check-in deck is made for a two-minute swipe on your phone.

At floor zoom, a one-finger drag settles on the nearest floor. Pinching and the full-shaft overview keep your chosen framing; cancelled gestures do not select or snap. With reduced motion enabled, the floor change is immediate.

## Can I try it without connecting anything?

Yes. The sandbox runs a whole factory on sample data: [?source=sim](/?source=sim). See [Getting started](/docs/getting-started).

## Is any of this open to the public yet?

The docs are. The app opens up after the hackathon. Built for the Meta AI Developer Hackathon, Oct 26 to Nov 4, 2026.

## Where do I report a bug?

Open an issue on the repo. If you're playing a live factory on Shiptorio's own repo, your bug becomes ore, and the factory might fix it for you.

If the planner is busy or unavailable, planning rests behind one card showing the local resume time. Attempts have a two-minute deadline and retry automatically after the cooldown or daily reset. Raising a call, token or spend limit also wakes parked plans; ambiguous paid calls keep their reservations. Existing checks and merge decisions remain available.

## Why does my factory say Reconnecting?

A cold factory or a network interruption can take several seconds to reconnect. Keep the page open: it retries automatically and restores the current factory once the connection is verified. A slow connection does not approve work or launch a PR.

If the repository picker cannot check your current access, it shows a retryable error instead of pretending you have no repositories. Try again after the interruption; a repository whose access was actually removed stays hidden.
