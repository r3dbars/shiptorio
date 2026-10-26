---
title: Connect your machine
description: The local runner is how your own Claude Code or Codex subscription builds what Spark plans.
section: Start here
order: 4
---
# Connect your machine

Shiptorio never writes code on its servers. Your own agents do, on your own computer, using the subscriptions you already pay for. The **local runner** is the small helper that connects them to your factory.

On the map, each signed-in agent shows up as a **power plant**. Claude Code and Codex each become one. No power, no building: Spark can still read, sort and plan, but the Next Move card will say "Plug in Claude or ChatGPT to start building."

> **Coming soon** A one-line installer with browser pairing (so anyone can connect a machine in a minute) is being built right now. Until it lands, pairing a runner needs the factory owner's server credentials, so the steps below are for the operator. This page will switch to the installer as soon as it ships.

## What you need

- **macOS** with Apple Command Line Tools (`xcode-select --install`). Checks run inside the macOS sandbox, and other platforms refuse to run jobs until they have a sandbox of their own.
- **Bun** installed.
- **Claude Code** (`claude`) or **Codex** (`codex`) installed and signed in. Both is better: more power plants.
- A checkout of the Shiptorio repo (for now, until the installer ships).

## Sign your agents in for the runner

The runner never borrows your normal sign-in. Your agent signs in once more, into the runner's own private folder, so a job can't see the rest of your home directory. For Codex, from the Shiptorio repo:

```sh
mkdir -p runner/.agent-home
chmod 700 runner/.agent-home
env -i PATH="$PATH" HOME="$PWD/runner/.agent-home" CODEX_HOME="$PWD/runner/.agent-home/.codex" codex login
```

For Claude Code, sign in the same way with `HOME` pointed at `runner/.agent-home`. If your Claude login only lives in the macOS Keychain, the runner stops rather than reach into it. If you use the background service, sign in under `~/Library/Application Support/Shiptorio/.agent-home` instead.

## Check your agents


```sh
bun run runner doctor
```

It prints one line per agent it finds, like `claude_code: installed and signed in`. If it says `Install and sign in to Codex or Claude Code first`, do that and run it again.

## Pair the runner

Pairing links the runner to one repo with an **eight-hour, repo-only** token, saved in a gitignored `runner/.dev.vars` that only you can read. Re-pairing revokes the old token, and a running runner renews its token before it expires.

For now pairing is an operator step, done by the factory owner. The browser pairing flow in the installer replaces it.

## Run it

```sh
bun run runner watch
```

The runner says `Local runner ready for owner/repo: claude_code. Only approved jobs run.` and then checks for approved work every few seconds. `bun run runner once` checks a single time and exits. `bun run runner paths` shows where it keeps its files and which agents it found.

To keep it running in the background on a Mac:

```sh
bun run runner:service install
bun run runner:service status
bun run runner:service stop
```

The service runs only for your Mac user, from its own bundled copy in `~/Library/Application Support/Shiptorio`. Your Mac has to be awake and your agent CLI signed in for jobs to run.

## How a job runs

1. A new issue gets a **Plan with Codex** or **Plan with Claude** card.
2. Spark reads the issue and the files, then proposes a plan and an exact file list. Open **See the plan and files** to see it.
3. Nothing builds until you tap **Approve and build**. **Not now** defers it.
4. The runner makes a fresh clone pinned to the planned commit, and your agent edits only the approved files.
5. The runner checks the change: approved paths only, at most 10 files and 500 changed lines, no secret-looking strings. Then it runs typecheck, tests and build inside the sandbox.
6. It pushes a `shiptorio/runner-*` branch. The server double-checks the branch and file scope, then opens the PR. The PR enters the [gauntlet](/docs/gauntlet).

## What your agent can and can't touch

- Each job gets a fresh private folder with its own clone, deleted when the job ends.
- The agent gets a minimal environment and its own sign-in folder. Not your shell's secrets, SSH agent or git credentials.
- Shell tools are off. Codex runs with `--sandbox workspace-write`, Claude Code with only Read, Edit, Write, Glob and Grep.
- Files like `.env*`, `.git*`, CI config, `node_modules`, key files and anything outside the repo are never in scope.
- Your subscription sign-in stays on your machine. Shiptorio never sees it.
- Each job has a 15-minute limit.

## Troubleshooting

- **"No approved Spark job is ready."** Normal. Approve a plan on the map first.
- **"Run runner:control pair first"** The runner isn't paired with a repo yet.
- **"Run runner watch on this platform; service installation currently supports macOS."** The background service is Mac only.
- **"Claude is not signed in"** Run `claude` once and sign in, then `bun run runner doctor`.
- **"Local verification requires macOS sandbox-exec"** You're not on a Mac. Jobs are disabled on purpose until there's a sandbox for your platform.
- **Network dropped right after a push?** `bun run runner retry JOB_ID` re-sends the saved receipt.
- **Where are the logs?** Next to each job's clone, under `runner/.work/` (or the Application Support folder for the service).
