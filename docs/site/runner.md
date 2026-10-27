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

macOS needs Apple Command Line Tools (`xcode-select --install`). Linux needs
bubblewrap (`sudo apt install bubblewrap`) and working unprivileged user namespaces.
The runner refuses jobs if the OS sandbox is unavailable.

The installer places a private pinned Bun and standalone bundle in
`~/.local/share/shiptorio/runner`, checks the bundle against its HTTPS checksum
manifest, and creates `~/.local/bin/shiptorio-runner`. No repository checkout or
manual token copying is required. Add `~/.local/bin` to PATH if desired.

## More repos and updates

Run `~/.local/bin/shiptorio-runner pair` to add another repository while the runner
is open. One process serves all paired repos, with one build at a time. Pairing
another repo preserves earlier connections. Pairing a new machine to the same repo
replaces that repo's previous machine credential.

**Runner code changes require a local reinstall.** Stop watch and rerun the installer to update. Existing pairings survive the update. A website update does not replace a running local helper. After closing
the terminal, restart with `~/.local/bin/shiptorio-runner watch`.

In the game, **Power → Connect your machine** shows online/offline, last seen,
detected agents and latest job. A newly selected live repo opens this card.
Claude Code and Codex appear as separate power plants. Each shows ready, running or
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
- **Expired pairing:** tokens renew while online. After more than eight hours offline,
  pair that repo again. Logout or lost repository access also revokes the grant.
- **No plan:** the first runner plan needs an open GitHub issue. Pairing alone does
  not create an issue or start a build. Spark still asks for plan approval.
- **Claude sign-in:** run `~/.local/bin/shiptorio-runner login claude`. This opens
  Claude's subscription login and checks it finished. Login, status and builds share
  Shiptorio's private Claude configuration, outside job checkouts. Keep the runner's
  data location stable: the macOS Keychain login is scoped to that path. If you move
  from a checkout to the legacy service, sign in again using the service's data root.
  Your usual Claude home stays separate.

## What your agent can and can't touch

Jobs run in an isolated checkout. The runner publishes only the approved file scope,
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
files to uninstall the legacy service.

Approving a plan stays bound to that exact issue and plan even if another card moves to
the top of the deck. If the issue changes before approval, request a fresh plan.

If old source alerts fill the check-in, one existing build or plan-approval card stays
reachable. This only makes the decision visible; it does not approve a plan or start work.
