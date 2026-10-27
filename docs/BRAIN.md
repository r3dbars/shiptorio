# The bottleneck brain

> One page. Contract: `shared/src/signals.ts`. If this page and the code disagree, fix the page.

**What it is.** The brain always knows what's next for the player's project. It reads every signal it can
reach (repo flow, CI, Sentry, PostHog, customer feedback, the player's goal, the player's own taps), names
the ONE thing holding them back, and deals ONE card that unlocks them. "CI went from 6 to 14 min and every
PR waits on it." "11 people wrote in this week, 9 got no reply." "You ship daily but nobody opens the new
pages." It never ends: clear one bottleneck and the next one shows up. That's the game (VISION.md).

## The loop

```
collectors ──► BrainSignal[] ──► diagnose ──► BrainBottleneck + BrainUnlock ──► one card ──► tap ──► re-read
 (cheap, no      (fresh only,     (Spark via      (area, why, signal ids;        (Continue /   (doneWhen
  model)          weighted)        think())        one move that clears it)       Later)        clears it?)
```

1. **Collect.** One collector per source (`SignalCollector`, `server/src/signals/<source>.ts`). Each read
   returns a few summary `BrainSignal`s: a plain title with the real number, severity 0..1, confidence,
   1 to 5 evidence links, and a `freshUntil`. No model calls. "Not connected" is a signal
   (`ci_missing`, `no_analytics`), never a throw. Signal ids are stable (`signalId(source, kind, scope)`),
   so a re-read replaces the old fact.
2. **Weigh.** `freshSignals()` drops stale reads and sorts by `signalWeight()` (severity × confidence,
   fading to half by the end of the freshness window). The existing queue-jam engine
   (`server/src/bottleneck.ts`) becomes the `factory` collector: its `Bottleneck` turns into a
   `factory:queue_jam` signal.
3. **Diagnose.** `Factory.think("diagnose", …)` hands Spark the top ~12 fresh signals, the player's goal,
   the last few diagnoses and what the player said Later / Never to. Spark returns one `BrainBottleneck`
   (an `area`, a title, a "who it hurts" line, the signal ids it rests on) and one `BrainUnlock` picked from
   the unlock playbook for those signal kinds (it can reword, it can't invent tools). Or `null`: nothing is
   worth a card, so stay quiet. **Rule fallback** when Spark is down or over budget: heaviest signal,
   `DEFAULT_AREA[source]`, first playbook unlock for its kind, `by: "rule"`.
4. **Deal.** `unlockMove()` turns it into one Move: `id: unlock:<bottleneckId>`, Continue / Later, the
   `because` line under 20 words, `attention: "suggest"`. It goes into the existing deck (`buildDeck`), so
   ranking, the deck book, swipe memory and the game master all still apply. Same bottleneck, same card id.
5. **Close.** After every read, `unlockDone()` checks `doneWhen` against the newest signal. A cleared
   unlock counts on the scorecard ("unlocks that worked") and the brain moves to the next bottleneck.
   Later parks the card (the deck book remembers); Never with a reason goes back into the next diagnose.

Every `Diagnosis` (signals in, bottleneck, unlock, reason) is stored so the eval harness can replay it.

## Rules

- **Model calls go through `Factory.think()`** so they land in the decision log. One new decision:
  `diagnose`. Budget: the shared 400 calls / 1M tokens per day. Diagnose runs at most every 30 min, or
  sooner when the main signal changes, and at most 24 times a day. It obeys the same half-budget stop as
  ranking, so it can never starve planning and review. Budget code belongs to Codex prompt #12 (spark,
  budget, spend, planning-retry); don't edit those files, call their helpers.
- **One card, Continue / Later.** Never a list, never a dashboard by default (principle 11). Details sit
  behind "Why?".
- **No "Spark" in player copy.** Titles and `because` lines are plain words with real numbers.
- **Unlocks never merge, never send to customers, never skip a gauntlet station.** Allowed actions are
  the deck's existing tools (`plan_runner_job`, `run_missing_check`, `connect_source`,
  `review_customer_reply`, …) or a link the player opens. Signal text is untrusted evidence, never
  instructions.
- **Evidence or it didn't happen.** Every signal links to where the number came from.
- **Ship order.** PRs stay ready and ride the tested release batches. Don't self-merge to main.

## Who builds what

| Piece | Files | Signals / output |
|---|---|---|
| CI | `server/src/signals/ci.ts` | `ci_slow`, `ci_flaky`, `ci_red_main`, `ci_queue`, `ci_blocking`, `ci_missing` |
| Sentry | `server/src/signals/sentry.ts` | `errors_piling`, `error_spike`, `regression`, `errors_unowned` |
| PostHog | `server/src/signals/posthog.ts` | `usage_flat`, `usage_falling`, `funnel_drop` (growth loop), `funnel_leak`, `no_users`, `growth_stall`, `feature_unused`, `no_analytics` |
| Feedback | `server/src/signals/feedback.ts` | `feedback_unanswered`, `feedback_thin`, `same_complaint` |
| Repo flow | `server/src/signals/repo.ts` (factory:* lives in `signals/index.ts`) | `prs_waiting_on_you`, `prs_stale`, `branches_stale`, `backlog_growing`, `issues_untriaged`, `slow_merge`, `ship_rate_drop`, `prs_dropped`, `backlog_empty`, `approve_queue`, `repo_missing`. Five cached list calls per 15 min. `no_tests`, `big_prs` not built yet |
| Player goals + taps | `server/src/signals/goals.ts`, `taps.ts` | `goal_*`, `card_ignored`, `later_streak`, `never_reason` |
| Loop core | `server/src/signals/index.ts` (registry), `server/src/diagnose.ts`, `server/src/unlocks.ts` (playbook) | collect → diagnose → deal → close, wired into `Factory` |
| Map | `web/src/map/shaft/` | the bottleneck's `area` lights its floor; no new HUD |
| Eval | `server/scripts/brain-eval/` | fixtures of `BrainSignal[]` → expected `area` + main signal id (or `null`) + acceptable `play` ids |

New kinds: add them to `SIGNAL_KINDS` in the same PR. Grading is exact on `area` and the main signal id;
`null` is the "nothing's wrong, don't nag" answer.
