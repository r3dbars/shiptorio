---
title: Connect your machine
description: Install the local runner, pair in your browser and power Spark's plans with your own agent.
section: Start here
order: 4
---
# Connect your machine

Spark makes the plan. Your local Claude Code or Codex builds it, using your own
subscription. Agent sign-ins stay on your computer; pairing never approves a build.

## Install

macOS and Linux are supported. On Windows, use a glibc Linux distribution in WSL2
and install your agent inside WSL.

1. Install git and either [Codex CLI](https://developers.openai.com/codex/cli) or
   [Claude Code](https://code.claude.com/docs/en/setup).
2. Run this in your terminal:

   ```sh
   curl -fsSL https://shiptorio.com/install.sh | sh
   ```

3. Setup checks the agent and guides you through a dedicated local agent sign-in
   if needed. This keeps your usual agent settings outside job sandboxes.
4. Browser pairing opens. Sign in to Shiptorio, compare the code with your terminal,
   enter a repository where the Shiptorio GitHub App is installed and you have write
   access, then approve. Only approve a code you requested on this computer.
5. The terminal confirms the repository. Keep it open. Open that factory, select an
   open GitHub issue and request Spark's plan. Review the files and steps in the plan
   card before approving a build.

During browser approval, the runner retries dropped polling requests and temporary 429/5xx responses while the code remains valid. Authorization and expiry failures still stop pairing. Starting pairing and failures while reading a reply are outside this retry.

macOS needs Apple Command Line Tools (`xcode-select --install`). Linux needs
bubblewrap (`sudo apt install bubblewrap`) and working unprivileged user namespaces.
The runner refuses jobs if the OS sandbox is unavailable.

For a self-hosted factory, copy the command from that factory's **Power** panel.
It downloads from your own origin and passes `SHIPTORIO_URL` to the installer, for example:

```sh
curl -fsSL 'https://factory.example/install.sh' | SHIPTORIO_URL='https://factory.example' sh
```

The installer saves the server URL for later `pair`, `watch` and `doctor` commands.
The installer and CLI refuse to reuse an installation configured for a different
server, including a different `SHIPTORIO_URL`, so existing pairing tokens cannot be sent to the new endpoint. Use a separate installation or
uninstall the previous one before switching servers.

The installer places a private pinned Bun and standalone bundle in
`~/.local/share/shiptorio/runner`, checks the bundle against its HTTPS checksum
manifest, and creates `~/.local/bin/shiptorio-runner`. No repository checkout or
manual token copying is required. Add `~/.local/bin` to PATH if desired.

## More repos and updates

Renewed connections are saved in the private pairing store so they survive the next poll and a restart. Legacy environment grants are imported only when no pairing exists, or when a newer grant belongs to that same pairing and sign-in session. They cannot replace a different pairing. Disconnect the machine in the game to revoke access; deleting a local file does not revoke an environment grant.

Pairing changes are serialized across helper processes. A busy-store error means another pairing writer has the lock. Close the other pairing command and retry; an interrupted writer's lock requires recovery with the helper stopped, rather than automatically overriding a possibly active writer.

Run `~/.local/bin/shiptorio-runner pair` to add another repository while the runner
is open. One process serves all paired repos, with one build at a time. Pairing
another repo preserves earlier connections. Pairing a new machine to the same repo
replaces that repo's previous machine credential.

**Runner code changes require a local reinstall.** Stop watch and rerun the installer to update. Existing pairings survive the update. A website update does not replace a running local helper. After closing
the terminal, restart with `~/.local/bin/shiptorio-runner watch`.

On the deck, tap the boilers at the back to open the engine card. It shows online/offline, last seen,
detected agents and latest job. A newly selected live repo opens this card.
Claude Code and Codex appear separately. Each shows ready, running or
offline. Subscription usage remaining is not measured here; your plan's limits still apply.

Before each job the runner checks which subscriptions are signed in and idle. If
Spark's preferred subscription is unavailable, the other can execute the same approved
plan and files. One supervised build runs at a time across paired repos; a running or
recovering job keeps its original provider. Local models keep their guarded routing.

## Troubleshooting

- **Browser didn't open:** copy the pairing URL from the terminal. This also works
  in WSL. A code expires in ten minutes; run `pair` again for a fresh one.
- **Offline:** keep the terminal open, check its error and your internet connection,
  then run `~/.local/bin/shiptorio-runner watch`.
- **Agent sign-in:** run `~/.local/bin/shiptorio-runner doctor`. Use
  `~/.local/bin/shiptorio-runner login codex` or `login claude` for the dedicated
  Shiptorio agent sign-in. Setup never copies your normal credential directory.
- **Expired pairing:** grants last up to seven days, capped by the approving sign-in.
  The heartbeat renews with a day remaining; sleep and network failures retain a
  valid pairing. Re-pair only when the runner reports a real expiry or revocation.
  Logout or lost repository access also revokes the grant.
- **No plan:** the first runner plan needs an open GitHub issue. Pairing alone does
  not create an issue or start a build. Spark still asks for plan approval.
- **Claude sign-in:** run `~/.local/bin/shiptorio-runner login claude`. This opens
  Claude's subscription login and checks it finished. Login, status and builds share
  Shiptorio's private Claude configuration, outside job checkouts. Keep the runner's
  data location stable: the macOS Keychain login is scoped to that path. If you move
  from a checkout to the legacy service, sign in again using the service's data root.
  Your usual Claude home stays separate.

## Check a real file edit

Basic `shiptorio-runner doctor` checks sign-in, OS sandbox startup and pairing. It does
not spend subscription inference or prove the assembler can change a file. Run the
explicit edit probe when startup passes but a build produces no changes:

```sh
shiptorio-runner doctor --edit codex
```

The probe uses your dedicated Shiptorio sign-in and one small subscription inference
request. It creates a disposable repository and asks the production assembler to change
one constant in `example.ts`. Doctor checks the exact resulting bytes, the untouched
unapproved file and outside canary, and the final git scope. A successful process with
no actual edit fails. The fixture is removed afterward; the probe never claims a factory
job, touches its pairing, commits a product change or publishes a branch.

Failed edit probes report a safe category such as authentication, usage limit,
connection, configuration or file-edit verification. Provider messages, prompts and
raw transcripts are withheld. A sign-in check can pass while the real edit fails;
keep that failed result and investigate its category instead of assuming a build
worked or repeatedly rerunning the probe.

macOS rejects Codex applying a second Seatbelt profile inside the runner's existing OS
sandbox. The runner preserves that outer boundary and Codex's read-only mode: Codex
returns structured edit proposals, and the trusted supervisor applies only exact matches
within the approved files. The same verification and publication gates still run. Do not
bypass either sandbox or expose your normal home or credentials to work around an edit
failure.

## What your agent can and can't touch

Jobs fetch only the approved revision and, for rework, its regression-proof base rather
than downloading the repository’s full history. Jobs run in an isolated checkout.
The runner publishes only the approved file scope,
then opens a pull request. It never pushes to the default branch. The OS sandbox
keeps your normal home, unrelated repositories and supervisor GitHub credentials
outside the agent and test processes. The agent can read its dedicated subscription
sign-in and contact its inference provider; tests run without those credentials.

Codex returns a structured edit proposal in read-only mode. After Codex exits, the
supervisor applies only exact, unique replacements in approved regular files; new
files require an explicit create proposal. Dirty checkouts, ambiguous matches and
links are rejected. Claude Code and local-model adapters retain their existing edit
flow.

The supervisor runs the repository's checks and verifies the frozen patch before
publication. You still approve the plan and decide when to merge.

Shiptorio's own application, unit and regression tests still run inside verification. Host integration probes that need local listener sockets, a dedicated Keychain or another OS sandbox are unsupported inside that already restricted boundary (`SHIPTORIO_CHECK_SANDBOX=1`). Their assertions and existing platform requirements remain intact in normal host runs: platform-eligible cases run in CI, while macOS-specific integrations retain local macOS validation. The runner does not grant network access or access to host credentials or unrelated files to make these probes pass. Verification can read the public OS timezone database needed by normal Date/Intl operations; private homes and sibling process data remain inaccessible.

## Stop, revoke and uninstall

Ctrl-C stops the foreground runner. **Disconnect this machine** in the factory
revokes that repository's credential immediately. Stop other runner terminals,
then remove the standalone files and local pairings with:

```sh
~/.local/bin/shiptorio-runner uninstall
```

Pairings are owner-only files in `~/.local/share/shiptorio/runner/pairings/`.
Uninstall does not delete your usual Claude/Codex settings or your repositories.

Legacy macOS service users should first run `bun run runner:service stop` from
their checkout. That service has a separate install under
`~/Library/Application Support/Shiptorio` and a launch agent at
`~/Library/LaunchAgents/com.shiptorio.runner.plist`; after stopping it, remove those
files to uninstall the legacy service. To keep existing standalone pairings running
in the background, run `bun run runner:service install` from a checkout. It imports
unexpired same-server pairings without deleting their standalone copies or replacing
a different service pairing. The service reuses its own dedicated agent sign-ins;
run doctor using the service data root to check them.

Approving a plan stays bound to that exact issue and plan even if another card moves to
the top of the deck. If the issue changes before approval, request a fresh plan.

If old alerts or governance choices fill the check-in, one existing build or plan-approval
card stays reachable in a non-merge slot. Other decisions remain pending and return when
space opens; their choices and defer counts are unchanged. Merge-gate cards keep priority.
This only makes the decision visible; it does not approve a plan or start work.

### macOS says signed in, then asks again

The runner keeps a separate encrypted Keychain inside its private agent home. Older
bundles could finish the browser step without a default Keychain to persist the
credential. Reinstall the runner and repeat `login claude` once. Wait for the Terminal
message `claude_code: installed and signed in for Shiptorio`. Your personal Claude
credentials and macOS Keychain stay separate.

### Sleeping, reconnecting and expired pairing

The helper retries temporary network failures with backoff, including after the computer
sleeps. It renews its connection while watching and during a build. A connection grant lasts
up to seven days and never extends past the browser session that approved it.

If Shiptorio explicitly reports a revoked or expired grant, the helper stops using that
connection and tells you to run `shiptorio-runner pair`. Saved builds and receipts stay on
your computer. A fresh pairing replaces the stopped connection. The factory's runner status
also reports when re-pairing is needed; a generic network error or unclassified 401 alone
does not erase or stop the saved pairing.

## Update a PR after main advances

If a factory PR falls behind main, choose **Plan update and verify again** in the
game. Review the fresh plan: it names the new base, existing PR and branch, and the
exact old head that may be replaced. Approving rebuilds the fix on that base and
replaces only that factory branch. A concurrent branch edit stops the update.

Your local agent runs fresh regression proof and supervisor checks. The same PR goes
through CI, verification and review again; you still choose **Launch** separately.
If main moves during the build, the factory asks for another plan instead of treating
old evidence as current. Updating the installed runner may be needed for this new job
format; an old runner cannot publish the refreshed branch with its normal push.
