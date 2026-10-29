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
- Idle and held cargo do not animate the conveyor. Moving cargo advances its bay's belts; stopping preserves their phase.
- Red stops cargo and the affected belt. Yellow asks a human; it does not imply an outage.
- Reconnect restores authoritative state. Visual arrival never authorizes real execution or merge; only the local prototype uses arrival events to pace its demonstration.
- Validate single issue, several queued issues, outage/recovery, rejected checks/rework, permission loss, reconnect and duplicate webhook cases before declaring the real loop complete.

The current `/deck.html?source=conveyor-demo` is an isolated visual prototype with a sample issue and PR. It performs no GitHub or Meta requests and never merges real code.
