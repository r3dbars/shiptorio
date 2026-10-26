# The growth loop (prototype)

The first loop past code, toward the long-term vision in `docs/VISION.md` ("Where it goes": marketing,
acquisition, retention, same game, more districts). PR #177.

**Play it:** `?source=sim&scenario=growth`

## The loop

1. **Signal.** The PostHog mine already pulls people per route per day. A funnel step (`/cart → /checkout`)
   that converts at least 20% worse yesterday than its 7-day baseline is a drop.
2. **Proposal.** Spark proposes one small, reversible experiment (copy, a CTA, an onboarding tweak, a small
   layout change) through `Factory.think("growth")`, so it lands in "How it thinks". No Meta key, or no
   answer: a fixed rule picks one (`fallbackExperiment`) and it's logged as a fallback. Spark never writes it.
3. **Ship.** The experiment becomes ore (`kindHint: "feature"`, fingerprint `growth:<id>`) and rides the
   normal line: triage, the player's go, the player's assembler, the whole gauntlet, the merge gate. No
   shortcuts. In the sim, the yes is a Next Move card: "/cart → /checkout fell 31%. Run an experiment?"
4. **Measure.** After the launch, the **measure station** (new machine `measure-1`, next to orbit watch)
   freezes the 7 days before the launch as the baseline (A), then adds each full day after the launch (B)
   and runs a two-proportion z-test.
5. **Verdict.** `lift` (p < 0.05, at least +2%, at least 3 days in), `hurt` (p < 0.05, at least −2%, ends
   the watch early), `no lift` (the 7-day window ran out). It pops over the station (`+20% LIFT`,
   `NO LIFT`, `HURT`) and the sim offers a card: keep it / roll it back.

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

`FUNNEL_MIN_ENTERED` 50 people/day, `FUNNEL_DROP` 20%, `MEASURE_DAYS` 7, `MIN_SAMPLE` 200 people after
launch, `ALPHA` 0.05, `MIN_LIFT` 2%.

## Known gaps (next slices)

- **Funnel choice.** Live picks the step with `guessFunnel` (`/cart → /checkout`, `/pricing → /signup`,
  `/ → /signup`, `/ → /pricing`). Next: let the player name the funnel on the PostHog connect page, or ask
  PostHog for its saved funnels.
- **Before/after, not A/B.** It compares the week before the launch with the days after. Seasonality and
  other launches can fool it. Next: ship the change behind a PostHog feature flag and measure the split.
- **Roll back is a log line in the sim.** Live has no "keep / roll back" card yet; the verdict lands in the
  floor log and the station panel. Next: a deck card that opens a revert PR through the gauntlet.
- **Live verdicts are plain math**, so they go in the floor log, not "How it thinks". Spark could explain
  *why* it moved (or didn't) and pick the next idea; that's the obvious next Spark call.
- The PostHog query looks back 9 days, so a live experiment that waits longer than a day between launch
  and the first poll still gets a full baseline only if the poll runs within ~2 days of the launch.
