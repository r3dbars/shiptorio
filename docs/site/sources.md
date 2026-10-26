---
title: Mines
description: Where ore comes from. GitHub issues, Sentry errors and PostHog drops, and how each one plugs in.
section: Grow the factory
order: 2
---
# Mines

Every source of work is a **mine** on the map. More mines, more ore, a bigger factory. Mines only turn raw signals into ore. Spark decides what's real and what matters.

| Mine | On the map | How it gets in | Status |
| --- | --- | --- | --- |
| GitHub issues | Crystals at the mine | GitHub App webhooks | Live |
| Sentry errors | Biters on the folder the stack trace points at | Sentry webhook | Live |
| PostHog | Drops and error spikes per route | Shiptorio polls PostHog | Live |
| Support inbox | Envelopes at the well | Email forwarding | Coming soon |

## How heavy is a chunk of ore?

Each piece of ore carries a weight, the evidence of how much it hurts:

`severity × users affected + 2 × reporters (+10 if a paying customer)`

It decays with a seven-day half-life, down to a floor of 10%. Weight is evidence only. Spark decides priority. When the same signal shows up twice, it folds into the existing chunk instead of making a new one.

## GitHub issues

Live as soon as you [install the GitHub App](/docs/github-app). Every open issue (not PRs) becomes ore. Labels and the latest comment ride along, and everyone who reacted counts as a reporter. Closing the issue removes the ore.

You can give Spark hints in the issue text: `sentry:12345` links a Sentry issue, and `route:/checkout` (or `path:/checkout`) points at a route.

## Sentry

Errors show up as **biters** on the district the top in-app stack frame points at (or the route, if there's no frame). Each Sentry issue is one chunk. Repeats grow it.

To connect, tap the Sentry mine on your map, or open `https://shiptorio.com/connect/sentry?repo=owner/name`. The page walks you through it:

1. In Sentry: **Settings → Developer Settings → Custom Integrations → Create New Integration → Internal Integration**.
2. Webhook URL: the one the page shows you, `https://shiptorio.com/webhooks/sentry/owner/name`. Each factory has its own.
3. Turn on **Alert Rule Action**. Under webhooks tick **issue** and **error**. Permissions: Issue & Event **Read**.
4. Save, then paste the **Client Secret** and hit **Plug in Sentry**.

Every webhook is checked against its `Sentry-Hook-Signature` with your Client Secret, and repeats are dropped.

| Sentry level | Severity |
| --- | --- |
| debug, info | 0.5 |
| warning | 1 |
| error | 2 |
| fatal | 3 |

Resolved in Sentry before a fix ships? The ore goes away. Resolved after your fix launched? That's a biter killed. A Sentry mine also powers [orbit watch](/docs/orbit-watch).

## PostHog

PostHog tells Shiptorio when something got worse for real users. To connect, tap the PostHog mine or open `https://shiptorio.com/connect/posthog?repo=owner/name`:

1. In PostHog: **Settings → Personal API keys → Create personal API key**.
2. Scopes: **Query: Read** and **Project: Read**. Nothing else.
3. Paste the key and your project id (the number in your PostHog URL), pick US or EU cloud, and optionally a key event (defaults to `$pageview`).

Every 5 minutes, Shiptorio runs one query over the last 9 days, per route, and makes ore when:

- **A drop**: yesterday's key event count on a route fell below half its 7-day average (and that average is at least 30 a day).
- **An error spike**: `$exception` on a route hit at least 10, and at least 3× its usual.

Route ids like `/order/8812` are folded to `/order/:id`. If PostHog errors or rate-limits, polling backs off, up to an hour.

## Support inbox

> **Coming soon** Customer email as ore (forward your support inbox, Spark links a complaint to the matching Sentry error and drafts a reply you send). You'll see the well on the map already. It isn't connected to anything yet.

## Where keys go

Sentry and PostHog keys are stored server-side for that one factory and never shown again. See [Security and privacy](/docs/security).
