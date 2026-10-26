# The Shiptorio loop: signals in, proof out

> Status: **locked**, 2026-10-26 (Justin approved the whole one-pager and the Nov 4 stations). Owner: Justin. Visual one-pager: https://claude.ai/artifact/3thVDxNxToYkyKTTqoFnbr
> (copy in `docs/loop.html`). This is the simple model of the whole game. `docs/PRODUCT.md` has the full spec;
> where they overlap, PRODUCT.md wins on details and this doc wins on the shape of the loop and the gauntlet.

## The loop in one breath

A codebase is a factory line. Signals come in on the left, AI power runs the machines, and fixes ship on the
right. **Between building and shipping, every fix runs a gauntlet of checks.** Anything that fails rides the
rework belt back to Spark. Where stuff piles up is the bottleneck, and the bottleneck is always on screen.

```
 1 ORE            BRAIN        2 BUILD            3 THE GAUNTLET                                 4 SHIPPED
 mines ──belt──► Spark ──────► assemblers ──────► CI inspector ─► verify bay ─► review ─► merge gate ─► orbit watch
 (issues, Sentry,  (reads,      (your Claude Code    │           │            │          (you)        (24h real-world
  PostHog, email)  restates,     / Codex, on your    ▼           ▼            ▼                        check)
  deduped into     plans,        subscriptions)   ◄──────────── REWORK BELT (scar tags) ◄─────────────────┘
  weighted chunks) routes)            ▲
                                 POWER: Claude plant, Codex plant (your usage left), Spark steam (brain only)
```

## The four stops

1. **Ore (signals in).** Every source is a mine: GitHub issues, Sentry errors, PostHog events, customer email.
   Spark merges duplicates into one weighted chunk (40 crash reports about one bug = one chunk weighing 40).
   More mines = more ore. Connect order: GitHub issues → Sentry → PostHog → email. Stripe is on hold (Justin, 2026-10-26).
2. **Power (AI compute).** Claude and ChatGPT sign-ins are power plants; the meter is the real usage left this
   week. Spark's own thinking runs on its steam plant (Meta API). Local models come later as geothermal.
   There is always more ore than power, so every station's power cost is visible.
3. **The line.** Spark (brain, never writes code) reads the chunk, restates the problem in plain words, scores
   who it hurts, picks a machine and writes the plan. The player's assemblers build it and open a PR, and must
   attach evidence, not just say done.
4. **Rockets (shipped).** The player merges, the rocket launches, it deploys, and real numbers move (errors
   gone, customers answered, checkouts back). Orbit watch keeps checking after the merge.

## The verification gauntlet (the centerpiece)

Inspired by Lauren Tan's (poteto) approach to agents: **agent output is untrusted until it shows evidence.**
"Done" means the problem is gone in the running app, not that the code compiles or the agent says so. And you
only scale (more machines, more autonomy) once the checks are trustworthy.

| # | Station | What it checks | Fail looks like | Hackathon? |
| --- | --- | --- | --- | --- |
| 1 | **CI inspector** | Lint, types, unit tests. Cheap and fast, so nothing expensive runs on broken code | `types: Cart.total possibly undefined` | Yes |
| 2 | **Verify bay** | Reproduce the bug on the real app before, prove it's gone after. The PR carries receipts: a failing test that turns green, a screenshot or log from the running app | "Passed CI, but the crash still happens with an empty cart" | **Yes (the demo moment)** |
| 3 | **AI review** | A *different* model than the builder attacks the diff (Claude built → Codex reviews, and the reverse). Looks for what tests miss: wrong approach, swallowed errors, security, scope creep | "Hides the error instead of fixing the null" | Yes |
| 4 | **Merge gate** | The player, with the receipts from 1–3 on the card. Merge = rocket. Districts earn launch permits over time | Player rejects with a reason | Yes |
| 5 | **Orbit watch** | 24h after deploy: Sentry quiet, metric back, customer answered. A comeback reopens the ore and costs district trust | "Sentry #8812 fired again 3h after #38" | **Yes (live, `server/src/orbit.ts`)**: Sentry comeback or spike on the folder, a revert PR, or red checks on the merge commit. A trip scars the item, sends it back on the rework belt and revokes the lane's launch permit |

### Fails go back to Spark, with a scar tag

Every failure goes onto the **rework belt back to Spark**, not straight to the builder. It carries a **scar tag**:
which station failed, why, and the evidence (CI log, the repro, the review comment). Spark re-plans with it.
Third strike on the same item → it goes to the player as a Next Move. This is how the loop learns.

### Fix it at the strongest layer (promote a check)

Checks live on a ladder. Layer 1 is strongest because it never forgets and never gets skipped:

1. Guardrail in the code (make the bad thing impossible: types, safe helpers, banned imports)
2. CI inspector
3. Verify bay
4. AI review
5. The player at the merge gate

**Same scar twice → Spark offers to promote it up a layer.** A review comment that keeps coming back becomes a
lint rule. A proof that keeps failing on `/checkout` becomes a test turret. The gauntlet gets stronger every
time it catches something. This is a Spark move like any other (asks first, autonomy can unlock it).

### Players add checks (research)

New stations are research, bought with science packs (shipped PRs). Spark recommends the one that would have
caught last week's misses. Starter tech: test turret, visual diff camera, security sentry, perf gauge, canary
tower (ship to 5% first), arena (two machines build, a judge keeps the better one).

**Built (2026-10-26, `shared/src/research.ts`).** The flask in the top bar opens the research tree once you've
shipped a PR. Every shipped PR is a science pack. Researching a tech drops a new station onto the line right
after CI (the rest of the line slides along) and from then on it really runs on every live PR's diff, cheapest
first, before the verify bay. A fail rides the rework belt with a scar naming the check (`ScarTag.check`).

| Tier | Tech | Cost | Runs today |
| --- | --- | --- | --- |
| 1 (after 1 ship) | Leftover sweeper (console.log, debugger, `.only`, conflict markers), Secret scanner (keys, tokens, private keys) | 2 | yes, on the diff |
| 2 (after 3 ships + parent) | Type guard (`any`, @ts-ignore, eslint-disable), Scope gauge (>400 lines / >20 files), Dependency guard (manifest and lockfile change together) | 4 | yes, on the diff |
| 3 (after 8+ ships) | Perf gauge, Visual diff camera, Canary tower | 8 to 10 | shown, "coming soon" (needs the runner or deploy hooks) |

Same scar twice (matched by each tech's `scar` pattern) → the planner marks that tech "Suggested" in the tree and
offers it once as a check-in card. Sim: `?source=sim&scenario=research`.

### Rigor follows risk

Heavy checks cost power, so spend them where mistakes are expensive. A district's risk sets which stations its
launch permit needs: `/checkout` (high) = CI, verify, review, canary, you. `/cart` (medium) = CI, verify, review.
`docs/` (low) = CI, review. Players may remove a station per district, but that caps the district's autonomy.
The merge gate can only be skipped with an earned permit. The rocket still launches from the launch pad after the merge.

## Click any station, take an action

Every station on the map is a button. Clicking opens a panel with:

- **What happens here**, in one or two plain sentences
- **Right now**: pile (WIP), oldest wait, pass rate, and **caught this week** (bugs it stopped before shipping)
- **The last log line** from that station (the latest fail or pass, with the reason)
- **1–3 actions**, one marked as Spark's pick. Examples: verify bay → "Build a second verify bay", "Teach a
  /checkout verify recipe", "Let docs PRs skip verify". Rework belt → "Add a test turret on /checkout".

Actions are Next Move options scoped to that station: the same `choose_move` path, logged, with undo.
Power plants and the rework belt are clickable too.

## Why it's sticky (the "one more turn" hooks)

- **Always one bottleneck**, glowing on the map, with one next move. Fix it, the next one shows up.
- **Rockets.** Every merge is a launch. Countdown, vapor, liftoff, Sentry goes quiet.
- **Catches are trophies.** Each station counts bugs it stopped. That number only goes up.
- **Unlocks.** Stations, machines, plants. Research is always a rocket or two away.
- **Spark earns autonomy.** Advisor → Floor → Build → launch permits → Lights out.
- **Every number is real.** Ship bad work and the score drops hard.

## Later: more factories

Same ore → power → gauntlet → rocket loop, as add-on islands, each with its own ore and its own proof:

| Factory | Ore | Rocket | Verify |
| --- | --- | --- | --- |
| Product (now) | Issues, errors, crashes, feedback | Merged fix | The bug is gone |
| Acquisition | Traffic, funnel drop-offs, search terms | Landing page / onboarding test | Signup rate moved |
| Retention | Churn, cancel reasons, users gone quiet | Fix or win-back email | They came back |
| Marketing | What shipped this week | Changelog, posts, launch notes | People clicked |
| Support | Every ticket | An answer, or a fix that kills the ticket type | Fewer tickets |

## Decided calls (Justin, 2026-10-26)

1. **Demo stations:** CI inspector, verify bay, AI review, merge gate; orbit watch only if Sentry lands in time.
2. **Where fails go:** back to Spark with a scar tag, third strike to the player.
3. **Who reviews:** a different model family from the builder when both are plugged in; with one sign-in, a
   fresh session with a hostile reviewer loadout.
4. **Removing stations:** allowed per district, with the trust/autonomy cost shown.
