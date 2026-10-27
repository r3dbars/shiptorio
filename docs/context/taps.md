# Taps: what players say yes and no to

Justin (2026-10-27 19:57): "I want to understand exactly what people are approving and not approving, and
how to make this feel really, really good." This is the log and the eval for that.

## What gets logged

One row in D1 `card_taps` per card the factory deals (migration `0016_card_taps.sql`, `server/src/taps.ts`):

| Field | What |
|---|---|
| `kind`, `scope`, `attention`, `play` | MoveKind, `moveScope()` area (district:web, source:sentry, ...), Approve/Steer/Suggested, and the bottleneck-brain unlock play once the brain deals cards |
| `title`, `suggested`, `because`, `by` | The card, the option it suggested, the planner's one-line reason, and whether the model (`spark`) or a fixed rule picked/explained it |
| `context` | What the factory saw: the queue jam (stage, wip, age) and the game master's ranking reason. Brain signal ids go here next |
| `shown_at`, `decided_at` | When it was dealt and tapped. The gap is "time to decide" |
| `action`, `option_id`, `reason` | `continue` (the suggested option), `other` (another option), `later`, `never` + chip (`once` Not now, `kind` Stop showing these, `spark` You decide these, `wrong` Wrong call), or `gone` (left the deck untapped) |
| `outcome` | For approved work: `shipped_clean`, `shipped_after_rework`, `rework`, `came_back` (orbit regression after launch) |

A card still on the deck after its tap isn't logged twice. A card dealt again after Later is a new showing.
Undo isn't reflected yet (the row keeps the original tap).

Hooks in `Factory`: `logDeck()` in `refreshDecisions`, `logTap()` in the choose/defer/dismiss handler,
`logOutcome()` at launch and in `noteRework()`. All of it is a side channel: a failed write is reported once
and never blocks a tap.

## The eval

`tapsReport(rows, since)` (pure) gives yes rate, median wait and outcome quality ("approvals that shipped
clean") overall and by kind, area, model-vs-rule, brain play and Approve/Steer/Suggested, plus the most skipped
cards and the Never chip counts. Read it at **/admin/taps** (admin only, same `ADMIN_LOGINS` gate as /admin).
`/admin/taps/data?rows=1&repo=...&days=...` exports the raw rows for the brain eval harness.

## Back to the brain

- `server/src/signals/taps.ts` → `tapSignals(rows, now)`: the taps collector from docs/BRAIN.md
  (`card_ignored`, `later_streak`, `never_reason`). It mirrors `BrainSignal` structurally until
  shared/src/signals.ts lands, then swap the type. The loop core registers it.
- `tapBrief(report)` rides in the game master's brief as `taps` (30 days, kinds with 3+ taps): rank kinds the
  player approves higher, skipped kinds lower, be careful when approvals keep coming back.

## Privacy

It's open source, so self-hosters own this data: it lives in their own D1, stores no player login (the repo is
the only identity), redacts titles and reasons, keeps 90 days, and `TAPS_LOG=off` turns it off.

Lifecycle follows `move_kind_rules`. The account export lists a factory's rows under `logs.taps`, using the
same access rules as the rest of the factory export. Account deletion and factory erasure delete them. A repo
rename, retention by repo id, and restore move them with the factory. The 90-day sweep is in addition to
deletion and never replaces it.
