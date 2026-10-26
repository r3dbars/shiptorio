# The Shiptorio loop: signals in, proof out

> Status: v1, 2026-10-26. Owner: Justin. Visual one-pager: https://claude.ai/artifact/3thVDxNxToYkyKTTqoFnbr
> (copy in `docs/loop.html`). This is the simple model of the whole game. `docs/PRODUCT.md` has the full spec;
> where they overlap, PRODUCT.md wins on details and this doc wins on the shape of the loop and the gauntlet.

## The loop in one breath

A codebase is a factory line. Signals come in on the left, AI power runs the machines, and fixes ship on the
right. **Between building and shipping, every fix runs a gauntlet of checks.** Anything that fails rides the
rework belt back to Spark. Where stuff piles up is the bottleneck, and the bottleneck is always on screen.

```
 1 ORE            BRAIN        2 BUILD            3 THE GAUNTLET                                 4 SHIPPED
 mines ──belt──► Spark ──────► assemblers ──────► CI gate ─► proof bay ─► review ─► launch pad ─► orbit watch
 (issues, Sentry,  (reads,      (your Claude Code    │           │            │          (you)        (24h real-world
  email, Stripe)   restates,     / Codex, on your    ▼           ▼            ▼                        check)
  deduped into     plans,        subscriptions)   ◄──────────── REWORK BELT (scar tags) ◄─────────────────┘
  weighted chunks) routes)            ▲
                                 POWER: Claude plant, Codex plant (your usage left), Spark steam (brain only)
```

## The four stops

1. **Ore (signals in).** Every source is a mine: GitHub issues, Sentry errors, customer email, Stripe events.
   Spark merges duplicates into one weighted chunk (40 crash reports about one bug = one chunk weighing 40).
   More mines = more ore. Connect order: GitHub issues → Sentry → email → Stripe.
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
| 1 | **CI gate** | Lint, types, unit tests. Cheap and fast, so nothing expensive runs on broken code | `types: Cart.total possibly undefined` | Yes |
| 2 | **Proof bay** | Reproduce the bug on the real app before, prove it's gone after. The PR carries receipts: a failing test that turns green, a screenshot or log from the running app | "Passed CI, but the crash still happens with an empty cart" | **Yes (the demo moment)** |
| 3 | **Review tribunal** | A *different* model than the builder attacks the diff (Claude built → Codex reviews, and the reverse). Looks for what tests miss: wrong approach, swallowed errors, security, scope creep | "Hides the error instead of fixing the null" | Yes |
| 4 | **Launch pad** | The player, with the receipts from 1–3 on the card. Merge = rocket. Districts earn launch permits over time | Player rejects with a reason | Yes |
| 5 | **Orbit watch** | 24h after deploy: Sentry quiet, metric back, customer answered. A comeback reopens the ore and costs district trust | "Sentry #8812 fired again 3h after #38" | Stretch (Sentry-based) |

### Fails go back to Spark, with a scar tag

Every failure goes onto the **rework belt back to Spark**, not straight to the builder. It carries a **scar tag**:
which station failed, why, and the evidence (CI log, the repro, the review comment). Spark re-plans with it.
Third strike on the same item → it goes to the player as a Next Move. This is how the loop learns.

### Fix it at the strongest layer (promote a check)

Checks live on a ladder. Layer 1 is strongest because it never forgets and never gets skipped:

1. Guardrail in the code (make the bad thing impossible: types, safe helpers, banned imports)
2. CI gate
3. Proof bay
4. Review tribunal
5. The player at the launch pad

**Same scar twice → Spark offers to promote it up a layer.** A review comment that keeps coming back becomes a
lint rule. A proof that keeps failing on `/checkout` becomes a test turret. The gauntlet gets stronger every
time it catches something. This is a Spark move like any other (asks first, autonomy can unlock it).

### Players add checks (research)

New stations are research, bought with science packs (shipped PRs). Spark recommends the one that would have
caught last week's misses. Starter tech: test turret, visual diff camera, security sentry, perf gauge, canary
tower (ship to 5% first), arena (two machines build, a judge keeps the better one).

### Rigor follows risk

Heavy checks cost power, so spend them where mistakes are expensive. A district's risk sets which stations its
launch permit needs: `/checkout` (high) = CI, proof, review, canary, you. `/cart` (medium) = CI, proof, review.
`docs/` (low) = CI, review. Players may remove a station per district, but that caps the district's autonomy.
The launch pad can only be skipped with an earned permit.

## Click any station, take an action

Every station on the map is a button. Clicking opens a panel with:

- **What happens here**, in one or two plain sentences
- **Right now**: pile (WIP), oldest wait, pass rate, and **caught this week** (bugs it stopped before shipping)
- **The last log line** from that station (the latest fail or pass, with the reason)
- **1–3 actions**, one marked as Spark's pick. Examples: proof bay → "Build a second proof bay", "Teach a
  /checkout proof recipe", "Let docs PRs skip proof". Rework belt → "Add a test turret on /checkout".

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

| Factory | Ore | Rocket | Proof |
| --- | --- | --- | --- |
| Product (now) | Issues, errors, crashes, feedback | Merged fix | The bug is gone |
| Acquisition | Traffic, funnel drop-offs, search terms | Landing page / onboarding test | Signup rate moved |
| Retention | Churn, cancel reasons, users gone quiet | Fix or win-back email | They came back |
| Marketing | What shipped this week | Changelog, posts, launch notes | People clicked |
| Support | Every ticket | An answer, or a fix that kills the ticket type | Fewer tickets |

## Open calls (recommendations, waiting on Justin)

1. **Demo stations:** CI gate, proof bay, review tribunal, launch pad; orbit watch if time. *Recommend.*
2. **Where fails go:** back to Spark with a scar tag, third strike to the player. *Recommend.*
3. **Who reviews:** a different model family from the builder when both are plugged in; with one sign-in, a
   fresh session with a hostile reviewer loadout. *Recommend.*
4. **Removing stations:** allowed per district, with the trust/autonomy cost shown. *Recommend.*
