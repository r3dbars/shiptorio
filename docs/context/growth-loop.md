# The growth loop (prototype)

**Review boundary:** live growth remains opt-in behind the existing default-off `newFeatures` kill switch and is paused until an authorized ordered, whole-window unique-person funnel query is implemented. The existing route traffic poll is context only. Simulator cohorts are synthetic; no real conversion or impact is validated by this prototype. Final comparisons require the full fixed window; missing/underpowered evidence stays inconclusive.

The first loop past code, toward the long-term vision in `docs/VISION.md` ("Where it goes": marketing,
acquisition, retention, same game, more districts). PR #177.

**Play it:** `?source=sim&scenario=growth`

## The loop

1. **Signal.** An ordered funnel query must count the same people progressing through the steps over
   exact, complete windows. The current route-traffic poll cannot provide that evidence. The simulator
   supplies explicitly synthetic cohort windows. A conversion drop is at least 20% below its 7-day baseline.
2. **Proposal.** Spark proposes one small, reversible experiment (copy, a CTA, an onboarding tweak, a small
   layout change) through `Factory.think("growth")`, so it lands in "How it thinks". No Meta key, or no
   answer: a fixed rule picks one (`fallbackExperiment`) and it's logged as a fallback. Spark never writes it.
3. **Ship.** The experiment becomes ore (`kindHint: "feature"`, fingerprint `growth:<id>`) and rides the
   normal line: triage, the player's go, the player's assembler, the whole gauntlet, the merge gate. No
   shortcuts. In the sim, the yes is a Next Move card: "/cart → /checkout fell 31%. Run an experiment?"
4. **Measure.** After the launch, the **measure station** (new machine `measure-1`, next to orbit watch)
   compares one complete 7-day baseline query (A) with one complete 7-day after-launch query (B).
   Intermediate reads are provisional; daily unique-user totals are not added together.
5. **Verdict.** After the complete fixed window, adequate baseline/after samples may show an observed
   `lift` or `hurt` (p < 0.05, at least 2% relative). Otherwise the comparison is `no clear lift` or
   `inconclusive` when data is missing, underpowered or invalid. Before/after differences do not establish
   that the PR caused the change. Only the simulator offers keep / rollback cards; no external revert is issued.

## Where things live

| Piece | File |
| --- | --- |
| Funnel drop, fallback proposal, z-test, verdict, plain-language line | `shared/src/growth.ts` (tests: `shared/test/growth.test.ts`) |
| `Experiment`, `FunnelStep`, `StationKind "measure"`, `ThoughtDecision "growth"`, `FactoryState.experiments` | `shared/src/model.ts` |
| Live: per-poll tick (launch → measuring → verdict, drop → proposal), measure station | `server/src/growth.ts` (tests: `server/test/growth.test.ts`) |
| Live: Spark prompt | `server/src/spark.ts` `proposeExperiment` |
| Live: glue on the PostHog poll | `server/src/factory.ts` `growthPoll` (tests: `server/test/mines.test.ts`) |
| Sim scenario | `web/src/sim/engine.ts` `growth` (tests: `playtest/test/growth.test.ts`) |
| Measure station art (Item Lab style, states MEASURING · LIFT · NO LIFT · HURT · IDLE) | `docs/item-lab.html` + `web/src/map/itemlab.js` `buildMeasure` |
| Map state, label, verdict pops | `web/src/map/scene.ts` (`stationArt`, `syncGrowth`) |
| Station panel: A vs B bars per experiment | `web/src/ui/StationPanel.tsx` |

## Thresholds (shared/src/growth.ts)

`FUNNEL_MIN_ENTERED` 50 people/day, `FUNNEL_DROP` 20%, `MEASURE_DAYS` 7, `MIN_SAMPLE` 200 people in each complete baseline/after window, `ALPHA` 0.05, `MIN_LIFT` 2%.

## Known gaps (next slices)

- **Funnel choice.** The future live adapter can suggest the step with `guessFunnel` (`/cart → /checkout`, `/pricing → /signup`,
  `/ → /signup`, `/ → /pricing`). Next: let the player name the funnel on the PostHog connect page, or ask
  PostHog for its saved funnels.
- **Before/after, not A/B.** It compares the week before the launch with the days after. Seasonality and
  other launches can fool it. Next: ship the change behind a PostHog feature flag and measure the split.
- **Roll back is a log line in the sim.** Live has no "keep / roll back" card yet; the verdict lands in the
  floor log and the station panel. Next: a deck card that opens a revert PR through the gauntlet.
- **Future live verdicts are plain comparisons**, so they belong in the floor log, not "How it thinks". Spark could explain
  *why* it moved (or didn't) and pick the next idea; that's the obvious next Spark call.
- **Ordered cohort producer is not implemented.** Tenant-authorized, definition-matched PostHog funnel
  queries must supply whole-window unique-person counts before the guarded live adapter can run.
  Missing baseline/after windows leave measurements pending; route traffic alone never creates an experiment.
