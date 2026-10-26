# Shiptorio local runner

Your Claude Code / Codex subscriptions stay on your computer. Spark proposes a plan;
only a player-approved job can reach a runner. It publishes a PR branch, never main.

## Install (macOS and Linux; Windows through WSL2)

Install git and either `claude` or `codex` first. Then:

```sh
curl -fsSL https://shiptorio.com/install.sh | sh
```

Setup opens the provider login for a dedicated Shiptorio agent home if needed. Your normal
agent settings and credentials stay outside job sandboxes. Then compare the code in your terminal and browser, sign in to Shiptorio, and enter a repo
where you have write access and the GitHub App is installed. Approve the code. The
terminal confirms and starts polling for approved jobs. Keep it open; Ctrl-C stops it.
If the browser doesn't open (including WSL), copy its printed URL into your browser.
No token, secret file, or source checkout is needed.

The installer downloads a private pinned Bun and bundled runner into
`~/.local/share/shiptorio/runner`, verifies the bundle against its HTTPS manifest,
and creates `~/.local/bin/shiptorio-runner`. Add `~/.local/bin` to PATH if desired.
This checksum detects partial/mismatched downloads; it is not an independent signature.
Rerun the installer to update without deleting existing pairings.

macOS needs Apple Command Line Tools (`xcode-select --install`). Linux needs
bubblewrap (`sudo apt install bubblewrap`) and unprivileged user namespaces; jobs
fail closed without the OS sandbox. Windows uses a glibc Linux distribution in WSL2.
Subscription sign-ins must be made inside WSL, not on the Windows host.

## Commands

```sh
~/.local/bin/shiptorio-runner login codex # or login claude: dedicated provider sign-in
~/.local/bin/shiptorio-runner doctor   # check installed agent sign-ins
~/.local/bin/shiptorio-runner watch    # resume after closing the terminal
~/.local/bin/shiptorio-runner pair     # add another repo, without stopping watch
~/.local/bin/shiptorio-runner uninstall
```

One process serves all paired repositories, with one build at a time and independent
heartbeats so the other factories remain online. Repo-scoped tokens live in separate
owner-only files under `~/.local/share/shiptorio/runner/pairings/`. Pairing another
repo does not remove the first. Pairing a second machine to the same repo replaces
its earlier credential. Disconnect in the factory revokes the repo pairing immediately.
Tokens renew while online; after more than eight hours offline, pair that repo again.

In the game, **Power → Connect your machine** shows online/offline, last seen,
detected agents and last job. A newly selected repo opens that card. Spark needs an
open GitHub issue to offer the first plan; approve its file scope in the plan card.
Pairing never approves a plan or starts a build by itself.

## Development and legacy service

`bun run runner` still reads the gitignored `runner/.dev.vars` for an existing
`SHIPTORIO_URL`, `SHIPTORIO_REPO`, `SHIPTORIO_RUNNER_TOKEN` setup. New installs use
browser pairing. `SHIPTORIO_RUNNER_ROOT` isolates test data; only supported origins
are accepted. Do not commit configuration or credentials.

The existing macOS launch agent remains supported (`bun run runner:service install`,
`stop`, `status`). Stop it before running the standalone foreground runner. Its
installed bundle and `.dev.vars` live in `~/Library/Application Support/Shiptorio`.
The new installer intentionally uses a visible terminal rather than registering a
background service. To remove the legacy service after stopping it, remove
`~/Library/LaunchAgents/com.shiptorio.runner.plist` and its Application Support folder.

The human code expires after ten minutes, is one-use and rate-limited. Only a runner
holding its random device secret can retrieve a credential. Approval requires a
Shiptorio login, same-origin POST, and verified repository write permission. Local
verification runs inside sandbox-exec on macOS or bubblewrap on Linux. Publication
uses a trusted fresh clone; no GitHub credential is passed to the assembler.

Public help: [shiptorio.com/docs/runner](https://shiptorio.com/docs/runner).
