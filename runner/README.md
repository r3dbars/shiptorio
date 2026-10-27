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
~/.local/bin/shiptorio-runner doctor   # check auth, real OS/agent sandboxes (#235), and server pairing
~/.local/bin/shiptorio-runner doctor --edit codex # one real subscription edit in a disposable fixture
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

## Recovery and diagnostics

`watch` retries each repository independently with exponential backoff and jitter, capped
at one minute. Heartbeats run separately during a build. Sleep or a network outage does
not remove pairings. A 401 prints the pairing command; it never starts a browser login
or discards your local evidence on its own.

A private `.recovery/` journal and `.work/` checkout keep the current build across runner
restarts and provider/network interruptions. Restart `watch`: the server hands back the
same still-valid lease (after its 45-second lost-claim grace period), with a fresh GitHub
installation token. If the agent was interrupted, it continues against the existing edits;
if it finished, the supervisor skips inference and reruns every check. Frozen approved
files must still match the saved snapshot. Completion receipts replay automatically even
when the server accepted the result but its response was lost. Publication retries create
the identical commit SHA. The journal never stores GitHub installation tokens.

Recovery stays inside the original 30-minute build lease. A changed, revoked or expired
assignment requires fresh player approval; it cannot extend its own authority. Unfinished
checkouts/journals remain local for inspection after expiry. Successful acknowledgments
remove the checkout and journal; local agent logs, verification logs and receipts remain
under `.work/`. Run only one watcher per runner data root.

An unavailable/expired Codex or Claude login produces an in-game **Sign in again** card
with `shiptorio-runner login codex` or `shiptorio-runner login claude`. The watcher stays
alive and stops offering that harness until login is restored. A provider reporting a
revoked token stays blocked even if its cached login status says signed in; a changed
local credential file clears the block. A successful dedicated Claude login also clears
a Keychain-only auth block. Sandbox failures and ordinary test failures do not become sign-in
errors. Raw provider output stays in redacted local logs.

`doctor` prints PASS/FAIL for each installed harness, the verification sandbox, each agent
sandbox (CLI startup/auth status, macOS preferences and HTTPS access), and every pairing.
It checks all categories even when one fails and exits nonzero if any check fails. Basic
doctor never claims a job or runs inference; it explicitly reports the file edit as untested.
Pairing failures distinguish a missing/expired local token from an unreachable server or rejected credential in the printed recovery steps.

`shiptorio-runner doctor --edit codex` additionally uses one small subscription request
to run the same Codex assembler as production jobs in a disposable repository. It verifies
an exact `example.ts` edit, unchanged unapproved/outside canaries and the complete git
scope. A successful agent process without the edit fails. The fixture is removed afterward.
This does not approve, claim or publish a factory job. Other auth/pairing failures still
make the overall command fail even when `edit:codex` passes.

Codex stays read-only inside the unchanged outer OS sandbox and proposes structured
replacements. The credential-free supervisor applies only exact approved regular-file
matches after the agent exits. This avoids nested macOS Seatbelt application failures;
the supervisor's existing scope, verification, frozen-patch and publication gates remain.

## Claude Code and Codex power

`shiptorio-runner login claude` runs Claude's subscription login with an explicit
`CLAUDE_CONFIG_DIR` in the private `.agent-home/.claude` under the runner data root.
Codex keeps using `.agent-home/.codex`. Login, status, doctor and the assembler use
that same canonical home, outside `.work/`. No normal Claude config, API key or
provider token is copied into a job. Claude's temporary files stay in a private
sandbox directory. macOS retains #235's preferences/network service permissions and grants agent-only read access to the system timezone database needed by Claude's Intl initialization.

The runner checks sign-ins again before every job. It runs one supervised build at
a time across all paired repos. Spark's preferred subscription gets the job when
ready; if it is signed out, the other signed-in, idle subscription may execute the
same approved plan and file scope. A running/recovering lease never switches agents.
Local models keep their existing guarded routing; they are never an automatic
substitute for a subscription. “Free” means idle in this runner, not unlimited usage
or idle in unrelated Claude/Codex terminals. The Power sheet shows a separate plant
for each provider, ready/running/offline; it does not invent remaining plan quota.

**Runner changes require reinstalling the local bundle. A merge or website deploy
does not update a running terminal or launch agent.** Standalone users stop watch,
rerun the installer above, and run `shiptorio-runner login claude` in the next
terminal. Legacy service users rerun `bun run runner:service install` from their
updated paired checkout. Sign in against the service's actual data root:

```sh
SHIPTORIO_RUNNER_ROOT="$HOME/Library/Application Support/Shiptorio" bun run runner login claude
```

Keep that root stable: Claude's macOS Keychain login is scoped to its config path.
A checkout login copied into a service directory may require signing in again.

### macOS credential persistence

The isolated agent home needs its own `Library/Preferences` and default Keychain,
not just a Claude config folder. The runner creates an encrypted Shiptorio-only
Keychain there and unlocks it before checking Claude sign-in. Its random password
is an owner-only file beside `.agent-home`, outside the agent sandbox. The personal
login Keychain and its search list are unchanged. Reinstalls reuse the existing
store; sleep locks it and the trusted runner unlocks it on its next auth check.

If an older bundle reported browser login success but the next process said signed
out, reinstall the runner and repeat `login claude` once. Confirm the runner's final
`claude_code: installed and signed in for Shiptorio` message, not only the browser page.
