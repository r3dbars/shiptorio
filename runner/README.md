# Shiptorio local runner

Shippy, powered by Meta Muse Spark, plans and reviews. Your own **Codex or Muse Code subscription**
builds on your computer. The runner validates the edits, runs the checks and publishes a PR branch.
It never pushes to the default branch or merges a PR. You hold **Ship it** at the deck's Gate.

## Install and connect

Install git and either `codex` or Meta's `muse` CLI first. Use macOS or Linux; on Windows, use a glibc
Linux distribution in WSL2 and install your agent inside WSL.

Open **Connect your coding engine** on the deck and copy its command into Terminal. Use the command
from that factory: staging and production use separate install locations and server URLs. Setup guides
you through a dedicated provider sign-in. If browser pairing opens, compare its code with your terminal,
sign in to Shiptorio and approve the selected repo. Keep the terminal open to accept approved jobs.
Pairing itself never approves a plan or starts a build.

macOS needs Apple Command Line Tools (`xcode-select --install`). Linux needs bubblewrap
(`sudo apt install bubblewrap`) and working unprivileged user namespaces. The runner refuses jobs
without the OS sandbox.

The default standalone install places a pinned Bun and runner in `~/.local/share/shiptorio/runner`
and the launcher in `~/.local/bin/shiptorio-runner`. The installer checks the bundle against its HTTPS
manifest; this detects incomplete or mismatched downloads, not an independent signature.
Add the launcher directory to PATH, or use its full path below.

## Commands

```sh
shiptorio-runner login codex        # dedicated Codex sign-in
shiptorio-runner login muse         # dedicated Muse Code sign-in
shiptorio-runner doctor             # sign-in, OS sandbox and pairing checks
shiptorio-runner doctor --edit codex # one subscription edit in a disposable fixture
shiptorio-runner doctor --edit muse  # the same explicit probe with Muse Code
shiptorio-runner watch              # resume watching after closing Terminal
shiptorio-runner pair               # pair another repo
shiptorio-runner uninstall
```

The edit probes consume subscription inference. Basic `doctor` does not infer or claim a job;
it cannot prove an agent can edit a file. Normal output gives one next action; add `--verbose` for
redacted technical detail. `paths` prints the installation paths as JSON.

## Builds and recovery

One runner serves its paired repos, one build at a time. The runner checks that a subscription is
signed in and idle before handing it work; a running or recovering job keeps the same provider.
Codex and Muse Code return structured edit proposals. The supervisor accepts only exact edits to
approved files, runs checks without provider credentials, and verifies the frozen patch before publishing.

Temporary network failures retry with backoff. A private `.recovery/` journal and `.work/` checkout
preserve in-flight work across restarts. Restart `watch` to resume a still-valid lease. A revoked,
changed or expired assignment needs fresh approval; recovery cannot extend it. Failed work and
redacted local evidence stay on the machine. GitHub installation tokens are not saved in the journal.

Pairings are owner-only files under the install's `pairings/` directory. A pairing grant lasts up to
seven days, capped by the approving session, and renews while online. A new pairing for the same repo
replaces its previous runner credential. **Disconnect this machine** on the deck revokes it. Deleting
local files alone does not revoke server access.

## Updates and development

**A website deployment does not update the local runner.** Stop watch, rerun the deck's installer,
then restart it. Existing pairings survive. Keep the data root stable so dedicated sign-ins remain available.
A different server requires separate `SHIPTORIO_RUNNER_ROOT` and `SHIPTORIO_RUNNER_BIN_DIR` directories.

Development uses `bun run runner` with ignored `runner/.dev.vars` for existing `SHIPTORIO_URL`,
`SHIPTORIO_REPO` and `SHIPTORIO_RUNNER_TOKEN` configurations. Do not commit credentials.

The legacy macOS service remains supported through `bun run runner:service install`, `stop` and
`status`. Its default install is `~/Library/Application Support/Shiptorio` with a launch agent at
`~/Library/LaunchAgents/com.shiptorio.runner.plist`. Stop it before starting a second watcher for the
same data root. Use that service's data root when checking its sign-in; standalone sign-ins are separate.

The retained Claude adapter is opt-in via `SHIPTORIO_ENABLE_CLAUDE=1`; it is not offered by the current
deck. Its old Keychain and authentication tests remain for compatibility.

Full help: [Connect your machine](../docs/site/runner.md), [security](../docs/site/security.md),
[self-hosting](../docs/site/self-host.md).
