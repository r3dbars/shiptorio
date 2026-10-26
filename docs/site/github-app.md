---
title: Install the GitHub App
description: What the Shiptorio GitHub App can do, how to install it on a repo, and what happens right after.
section: Start here
order: 3
---
# Install the GitHub App

Shiptorio talks to GitHub through its own GitHub App. The App is how you sign in, how issues become ore, how Shiptorio sees CI results, and how a PR gets merged when you launch a rocket.

## Install it on a repo

1. Sign in to Shiptorio with GitHub.
2. On the **Pick a repo** screen, follow **Install the Shiptorio app on the repo**. It opens GitHub's install page for the App.
3. Choose **Only select repositories** and pick the repo you want as your factory. Don't grant all repositories. You can add more later.
4. Back on Shiptorio, refresh. The repo shows up in your list.

If you installed it on more repos later, they show up for you right away. Anyone else who can reach those repos gets them the next time they sign in.

## What the App can do

The App asks for exactly these permissions:

| Permission | Why |
| --- | --- |
| Contents: write | Your runner pushes `shiptorio/runner-*` branches, and Shiptorio squash-merges a PR when you launch it |
| Pull requests: write | Open the PR your agent built, post the AI review verdict |
| Issues: write | Post Spark's plan and status notes on the source issue |
| Checks: read, Statuses: read | Read CI results for the CI inspector and orbit watch |
| Metadata: read | Required by GitHub for every App |

It listens to these webhooks: `issues`, `issue_comment`, `pull_request`, `pull_request_review`, `check_suite`, `check_run` and `push`. GitHub also sends install and uninstall events on its own.

Every webhook is checked against its `X-Hub-Signature-256` signature, and repeat deliveries are dropped.

> **Heads up** Agents never push to `main`. Runner branches are always `shiptorio/runner-<id>`, and a merge only happens when you hit Launch, or when a lane holds a [launch permit](/docs/permits) you granted. Protect `main` with GitHub branch rules too. A repo-scoped token can't be limited to one branch, so branch protection is your backstop.

## What happens right after install

- Shiptorio loads up to **50 open issues** (pull requests are skipped). Everyone who reacted to an issue counts as a reporter, which makes that ore heavier.
- The floor log says "GitHub mine connected: N open issues loaded. Spark will triage the ore."
- From then on, new and edited issues arrive by webhook. Closing an issue removes its ore.
- Pushes and PRs keep the map current, and CI results drive the [gauntlet](/docs/gauntlet).

## Who can see a factory

A factory is only served to people whose own GitHub account can reach that repo through the App. Shiptorio checks this on every request, and repos you can't reach answer "not found", the same as repos that don't exist.

## Removing a repo

- **Uninstall** the App from GitHub's settings (Settings → Applications → Installed GitHub Apps). Shiptorio drops that repo, its access rows, and disconnects the factory.
