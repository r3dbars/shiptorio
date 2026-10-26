# Pricing and usage (draft, 2026-10-26)

> **Status: draft for Justin's call.** Nothing is charged. The beta stays free and Stripe is on hold
> (docs/VISION.md). Numbers live in `shared/src/pricing.ts` (with tests). The landing page shows plan cards
> only with `?pricing=1`. Readable version: https://claude.ai/artifact/LrSxaUpsbMXnq5i9hxc8XH

## Direction (Justin, 2026-10-26): open source, parked for now

Pricing is parked. Shiptorio will be **open source**: anyone can self-host it and bring their own API keys (Meta
for Spark, their own Claude / Codex sign-ins) for free. The **hosted** version at shiptorio.com will probably cost
something, for running Spark and the infra for you. So model A below is the self-host path, and B or C is what the
hosted version charges. No pricing work until Justin picks it back up.

## The one fact that shapes everything

**We don't pay for building. We pay for the brain.** Players' Claude Code and Codex sign-ins are the machines
(VISION principle 3), so code generation costs us nothing. What costs us is Muse Spark: triage, planning, AI review,
deck ranking, orbit verdicts, research and permit picks. Plus a bit of Cloudflare.

## Unit cost (from the code)

Muse Spark 1.3 at **$1.25 / $4.25 per million input / output tokens** (third-party reports, Sep 2026; check
Meta's own page). Token counts are estimates from the prompts in `server/src/spark.ts`, `gauntlet.ts`, `factory.ts`.

| Spark call, per shipped item | Calls | Est. tokens in / out | Cost |
| --- | --- | --- | --- |
| Triage (splitter, low effort) | 1 | 1.5k / 0.6k | $0.004 |
| Plan (`planLocalTask`, ≈3.5 of 5 turns, medium) | 1 | 21k / 4.5k | $0.045 |
| AI review (`reviewDiff`, medium) | 1 | 8k / 1.5k | $0.016 |
| Deck ranking (`gameMaster`, ≥15s apart, on deck change) | ~4 | 4k / 0.8k each | $0.034 |
| Orbit verdict (only when an error shows up) | ~0.5 | 2k / 0.5k | $0.002 |
| Rework loop (≈30% of items re-plan + re-review) | 0.3 | 29k / 6k | $0.019 |
| Research + permit picks | ~0.2 | 3k / 0.6k | $0.001 |
| **Total per launch** | | | **≈ $0.12** |

**Cloudflare:** Workers Paid is $5/month base. A Factory Durable Object ticks every 2s while busy or watched
(`TICK_MS`); ~2h active a day ≈ 27k GB-s + ~110k requests a month ≈ **$0.40 per active factory** after the
included usage. D1 and KV are noise at this scale.

**Example active factories (a month):** light (20 launches) ≈ $3; solo founder shipping 3 a day (90) ≈ $11;
busy crew (400) ≈ $49.

**Cheap levers to roughly halve it (≈ $0.07/launch):** deck ranking is 28% of the bill; only re-rank when the
top card would change and raise the 15s floor to 60s. Cache the static system prompts. Drop triage to minimal
effort. Log `usage` from every Spark response into "How it thinks" so these estimates become measured numbers
(ties to task 9, "Measure Spark", and Codex's cost guards).

## Three models

### A. Bring your own brain (free + BYO Meta key)
Hosted game is free. Players paste their own Meta API key for Spark; without one the factory runs on the fixed
rules (`heuristicTriage` and friends). Our cost ≈ $0.40/factory.
- Good: zero money risk, scales to any number of players.
- Bad: a Meta API key at signup kills "two minutes to your first bottleneck" (principle 7). The rules fallback is
  a much worse game. No revenue.

### B. Flat plans with included fuel (recommended)
Each launch burns Spark "fuel". Plans include a month of fuel; extra packs top up.

| Plan | Price | Launches/mo | Repos | Players | Worst-case Spark cost | Worst-case margin |
| --- | --- | --- | --- | --- | --- | --- |
| Outpost (free) | $0 | 20 | 1 | 1 | ≈ $2.40 | -$2.80 (acquisition cost) |
| Factory (solo) | $19 | 150 | 3 | 1 | ≈ $18 | ≈ 0% at full burn; ≈ 55% at typical 60 launches |
| Crew (tiny team) | $59 | 400 | 10 | 5 | ≈ $49 | ≈ 11% at full burn; ≈ 60% typical |
| Fuel pack | $5 | +25 | | | ≈ $3 | ≈ 40% |

Paid plans can also paste their own Meta key for unlimited fuel. **Out of fuel never stops the factory:** it falls
back to fixed rules and says so, so the game never locks.
- Good: predictable bill, fits next to a $20 Claude/Codex sub, the free tier still gets the full gauntlet.
- Bad: we eat Spark cost on heavy users until the levers above land. Needs Stripe (on hold).

### C. Pay per launch
Free 25 launches a month, then $0.25 per shipped rocket. Rework, failed builds and rejected PRs are free, so
you only pay for results.
- Good: purest value alignment; costs us nothing on idle factories.
- Bad: puts a meter on shipping, the one thing the game wants you to do more of. Bills are unpredictable for a
  solo founder, and "should I launch this?" anxiety fights the "verify, then automate" loop.

## Recommendation: B

Flat plans, fuel measured in launches, BYO key as the escape hatch.

Rules that keep it true to VISION:
1. **Never sell autonomy.** Permits and lights out are earned by playing on every plan (principle 4). Plans gate
   scale (repos, launches, players, mines), not trust.
2. **Never sell the gauntlet.** Every plan gets every check. Verify everything is the point.
3. **Never block the factory.** Out of fuel means fixed rules plus a "fuel low" card, never a wall.
4. **Count launches, not tokens.** Players understand rockets. Rework is on us, which keeps us honest about
   Spark's plan quality.

## What players already pay (comparables, Oct 2026)

| Tool | Price |
| --- | --- |
| Claude Code | Pro $20, Max $100 / $200 |
| OpenAI Codex | Plus $20, Pro $200 |
| Cursor | Hobby free, Pro $20, Pro+ $60, Ultra $200, Teams $40/seat |
| GitHub Copilot | Free, Pro $10, Pro+ $39, Business $19/seat |
| Devin | Core $20 + $2.25/ACU, Team $500 |
| CodeRabbit (AI review) | $24 / $48 / $72 per dev per month |

Shiptorio sits on top of a Claude or Codex sub, so it has to feel like a cheap add-on: under CodeRabbit for one
person, under a Cursor Teams seat for a whole crew.

## Open questions for Justin
- Is $19 / $59 right, or start lower ($12 / $39) during launch and eat the margin?
- Should Sentry and PostHog mines be free on Outpost? (Draft says paid, since they drive more launches.)
- Ask Meta for hackathon / startup credits for Spark? That changes the free tier math.

## Sources
- Muse Spark 1.3 pricing: https://www.mindstudio.ai/blog/muse-spark-1-3-pricing (Sep 2026, third party)
- Coding tool prices: https://amux.io/blog/ai-coding-tools-pricing-2026/
- CodeRabbit: https://www.coderabbit.ai/pricing
- Durable Objects pricing: https://developers.cloudflare.com/durable-objects/platform/pricing
