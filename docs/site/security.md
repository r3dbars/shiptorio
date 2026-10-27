---
title: Security and privacy
description: What Shiptorio stores, what it sends to Meta's API, and the limits on what agents can do.
section: Reference
order: 1
---
# Security and privacy

Shiptorio sits between your repo, your AI agents and an AI planner. Here's exactly what it can do, what it keeps, and where your data goes.

## The short version

- **Your code is written on your machine**, by your own agent, on your own subscription. Shiptorio's servers never run a coding agent.
- **Agents only open PRs.** Never a push to `main`, only `shiptorio/runner-*` branches.
- **A merge needs you**, unless you granted that lane a [launch permit](/docs/permits).
- **Your subscription sign-ins never leave your machine.**
- **Spark reads issue text, files and diffs** to plan and review. That goes to Meta's API.

## Signing in

GitHub is the only login. No passwords.

- Your GitHub token is used once, at sign-in, to see which repos you can reach. It isn't stored.
- Your session is a random id in a cookie that's `HttpOnly`, `Secure` and `SameSite=Lax`, and lasts 14 days. Shiptorio only keeps a SHA-256 hash of it. Signing out deletes it.
- Every factory request checks that your GitHub account can reach that repo. Repos you can't reach look the same as repos that don't exist.
- Read and triage collaborators can view the factory. Changing it, managing connectors, pairing a runner, or launching requires GitHub write, maintain, or admin permission. Existing runner grants and socket actions recheck that permission; cached grants expire within 60 seconds.

## What Shiptorio stores

| Where | What |
| --- | --- |
| Database (Cloudflare D1) | Your GitHub user (id, login, name, avatar), session hashes, which repos you can reach, App installs, your "not this kind" card rules and settings, webhook delivery ids (kept 7 days) |
| Factory state (one per repo) | The game: ore (issue titles and bodies, Sentry and PostHog summaries), machines, PRs, scars, the log, runner jobs |
| Database, encrypted | Sentry and PostHog keys, one set per factory, encrypted (below) |

Sentry and PostHog keys are encrypted with AES-256-GCM using a fresh key for every write, and that key is wrapped by a server master key. Each key is bound to its one factory, is never shown again, and can be revoked. Use the narrowest key you can anyway (PostHog: Query Read and Project Read only).

Sentry user emails and IPs are only used to count affected users. They aren't stored.

## What goes to Meta's API

Spark runs on the Meta Model API. To do its job it sends:

- issue titles, bodies, labels and the latest comment (up to 8,000 characters)
- your repo's file list (up to 600 paths)
- the contents of files picked for a job (up to 12,000 characters each)
- PR diffs for AI review (up to 24,000 characters)
- Sentry and PostHog summaries, and your recent card decisions

Prompts treat all of that as untrusted evidence, never as instructions.

## What your runner and agent can do

- The agent gets a minimal environment, not your shell's secrets, and signs in from its own dedicated folder, not your normal config.
- Codex runs in `workspace-write` sandbox mode. Claude Code gets only Read, Edit, Write, Glob and Grep.
- It may only change the files you approved in the plan: at most 10 files and 500 changed lines.
- `.env*`, `.git*`, CI config, key files (`.pem`, `.key`, `.p12`, `.pfx`), `node_modules` and anything outside the repo are never in scope.
- Shell tools are off. The agent edits files, and the runner runs the checks.
- The finished patch is scanned for secret-looking strings before anything is pushed.
- Checks run inside the macOS sandbox, with no network except a locked-down dependency install.
- The runner's GitHub token only covers one repo and lasts eight hours.

More in [Connect your machine](/docs/runner#what-your-agent-can-and-cant-touch).

## Webhooks

GitHub and Sentry webhooks are checked against their HMAC signatures with a constant-time compare, size-limited, and de-duplicated.

## Merging

Shiptorio's App does the actual squash-merge when you hit **Launch**, or on its own for a lane with a permit. Right before merging, it checks the PR hasn't changed since the checks ran and that CI is still green.

Protect `main` with GitHub's branch rules anyway. A repo-scoped token can't be limited to one branch, so branch protection is the backstop.

## Removing your data

The repo owner can download a factory's whole state as JSON from `/api/repos/owner/name/export`. Uninstall the GitHub App from a repo and Shiptorio drops that repo and its access rows. Self-serve account deletion is being built.

Found a security problem? Open an issue on the repo, or tell the maintainer directly if it's sensitive.

Owner-only archived factory exports and deletion use verified numeric GitHub installation ownership. Renaming a login keeps verified ownership; reusing a former login does not transfer it. Legacy rows with no verified owner ID cannot grant those rights until authenticated installation metadata is refreshed.
