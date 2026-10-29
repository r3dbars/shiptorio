# GitHub-first deck loop

Justin, 2026-10-29: establish the physical conveyor behavior first, then connect GitHub issues and the Meta planner.

## Delivery sequence

1. **Conveyor prototype (current):** one labeled issue crate; empty belts green and static; only the bay transporting cargo moves. Machines process only after the crate arrives. Red faults stop the affected bay, yellow human decisions wait without pretending the system failed. The same crate becomes a PR and reaches the launch pad.
2. **GitHub intake:** use the existing GitHub App installation and repo selection to read open issues and receive issue updates. Deduplicate by repo + issue ID. Show the real title/number and permission state; selecting an issue does not itself start a worker.
3. **Meta proposals:** Muse Spark reads the selected issue and relevant repo context, proposes a scoped task and routes it through the existing move protocol. The yellow swipe card presents the recommendation and evidence. Spark decides; renderer animations never invent tasks or approvals.
4. **Execution:** approval assigns the existing local runner an isolated job. Runner status drives the Builder, commit/PR creation attaches the real PR identity to the same work item. Failures carry evidence back for rework; retries keep identity/history.
5. **Verification and review:** real CI events drive Checks; review evidence drives Review. Human decisions are yellow. Infrastructure or execution failures are red. Show why a job stopped and the actual available action in the existing swipe card.
6. **Shipping:** Gate preserves merge permissions and hold/swipe safeguards. Only a confirmed real merge launches a real-work rocket. Observe post-merge status and reconcile on reconnect without duplicate launches.

## Station responsibilities

| Station | Input → output | Advance condition |
| --- | --- | --- |
| Repo | GitHub issue → identified work item | Player chooses the issue |
| Planner | Issue/context → Spark proposal | Human approval, or earned autonomy |
| Builder | Approved task → commits + PR | Worker reports completion |
| Checks | PR revision → verification evidence | Required checks pass on that revision |
| Review | Evidence → review decision | Review approval |
| Gate | Approved PR → merged PR | Authorized merge confirmed by GitHub |

## Visual invariants

- One identity travels through every stage. Issue number becomes a PR label without spawning a duplicate crate.
- A transfer starts at the prior machine and finishes at the next; the next machine does not process early.
- Idle and held cargo do not animate the conveyor. Each connection spans one machine to the next; the entire connection moves while carrying a crate, with no midpoint switch. Stopping preserves its phase.
- Red stops cargo and the affected belt. Yellow asks a human; it does not imply an outage.
- Reconnect restores authoritative state. Visual arrival never authorizes real execution or merge; only the local prototype uses arrival events to pace its demonstration.
- Validate single issue, several queued issues, outage/recovery, rejected checks/rework, permission loss, reconnect and duplicate webhook cases before declaring the real loop complete.

The current `/deck.html?source=conveyor-demo` is an isolated visual prototype with a sample issue and PR. It performs no GitHub or Meta requests and never merges real code.

## Milestone 1: real inbox and Codex connection

The deck has Repo inbox and Codex engine entry buttons. Clicking Repo in live mode browses the same inbox; clicking the back-left boilers opens the engine card. A player without a selected repo chooses from their authenticated GitHub repositories first. The inbox reads open GitHub issues (not PRs), one bounded page at a time. It does not import tasks, invoke Meta, enqueue a worker or approve work.

The engine uses the existing repo-scoped runner pairing/status endpoints. It distinguishes unpaired, offline, Codex sign-in needed, ready and busy. Generating a setup command requires a click; disconnect requires confirmation. Subscription sign-in stays local. A reachable runner with only Claude is not described as Codex-ready. Availability describes a worker slot, not an invented subscription quota.

Player acceptance checklist:
- Sign in, choose a GitHub repository, and compare two inbox titles/numbers with GitHub.
- Refresh the inbox; no duplicates or jobs should appear. Empty repos should say they are empty.
- Click the boilers or Codex engine. Copy and run setup locally, then sign in with `shiptorio-runner login codex`.
- Return and check again: only an online runner advertising Codex should say ready.
- Stop the runner: the card should report offline. Restart it and verify recovery.
- Open Options, cancel disconnect, then confirm disconnect: cancellation changes nothing; confirmation revokes the pairing.

Validation distinguishes API/controller fixtures from real account acceptance. Authenticated GitHub and local Codex checks require the player's sign-in and selected repository; the guest demo alone cannot prove them.

The default staging entry now opens `/deck?source=live` and performs setup within the pixel deck instead of entering the simulator. Its disconnected backdrop is idle and contains no fake work. The guest account response reports whether GitHub sign-in is configured, so a missing staging App stays an explanatory card rather than sending the player to a broken login page. Explicit demo URLs remain available for visual iteration.

## Live Codex checkpoint — 2026-10-29

The first execution target is GitHub + Codex. Meta remains Shippy's factory-wide brain; Claude is not required for this checkpoint. A local watcher can use `watch --codex-only` to advertise only Codex and avoid unrelated Claude sign-in cards.

Verified on shiptorio.dev with the real `r3dbars/Testing` repository:
- Muse Spark `muse-spark-1.3` read issue #16, README.md and package.json, then proposed a README-only plan.
- The build approval in the live deck dispatched the local Codex subscription. The runner passed typecheck, tests and build, and opened [Testing PR #27](https://github.com/r3dbars/Testing/pull/27).
- Commit `0338c1ed80a4af8c245913fdd6b2f50c6a8ca40c` changes only three explanation lines in the README Checks section. GitHub CI passed on that commit.
- The factory received the same issue/PR identity and entered inspection. The PR remains open: this proves planning through PR creation and CI, not merge/rocket or the entire independent verification gauntlet.

The live test exposed a case mismatch: GitHub's `r3dbars/Testing` assignment was rejected against the lowercase pairing. Assignments now normalize GitHub repository names while preserving exact branch, SHA, lease and cross-repository validation. Recovery and receipt replay use the same normalized identity.

Staging still had 44 active factory records from the initial all-repositories installation after access was narrowed to Testing. Those records were paused using audited staging controls to stop background GitHub contention; Testing remained active. Durable installation reconciliation and smoother live card updates still need follow-up. No production runner or production factory was changed.

Test issue #25 was closed after the inbox-only check passed. The unused single-file smoke test #26 was closed as superseded by the real README test. Neither was built or shipped.
