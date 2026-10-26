# Shiptorio build plan

> **Stack update (Oct 26):** we host on Cloudflare (Workers, Durable Objects, D1, KV), not Fly.io and Neon.
> Where this plan says Fly or Neon, read Cloudflare. `AGENTS.md` has the current layout.

Window: Mon Oct 26, 11 AM CT → Wed Nov 4, 8 PM CT. **Submit by noon Wed Nov 4.**
Rule: every day ends with something we can screen-record.

## The game, mapped to real things

| Game | Real |
|---|---|
| Terrain / districts | Directories and modules of the connected repo, colored by health |
| Ore patches | Sentry (crater), feedback inbox (well), GitHub Issues (mine), PostHog (road traffic) |
| Machines | Agent steps: splitter, assembler, inspector, visual inspector, cleanup, turret builder, launch pad |
| Belts | Typed queues. A belt refuses to connect machines whose contracts don't match |
| Pollution | Tech debt: lint errors and complexity per district |
| Biters | Sentry error spikes, attacking the district the stack trace points to |
| Turrets / walls | Tests, lint and type checks around a district |
| Modules | Spark reasoning effort, or prompt/tool loadouts if Spark has no effort levels |
| Rocket launch | A human merges a PR |

Agents only open PRs. They never push to main.

## Models and power

**Muse Spark is the brain, always:** triage, splitting, routing, inspection, starter-factory planning,
email ↔ Sentry matching, voice foreman actions. Subscription agents only take orders from Spark.

| Power source | Game | Behavior |
|---|---|---|
| Spark on Meta's API | Steam plant #1 | Burns credits |
| Spark on Baseten (`meta-models/muse-spark-open-1026`) | Steam plant #2 | Failover |
| Claude subscription (`claude -p`) | Solar + battery | Free; recharges on the usage window |
| ChatGPT subscription (`codex exec`) | Solar + battery | Same |

Machine = harness × power. The load balancer routes by available power.
Muse Voice Transcribe powers the voice foreman. Glimmer is optional, off the critical path.

## Where things run

- **Hosted (Fly.io):** web app, server, Spark workers in containers.
- **Local runner:** the same `runner` program on the user's machine. It finds their logged-in `claude` and
  `codex` CLIs and offers them as machines. **Subscription logins never run on our servers.**

## Stack

- Monorepo (TypeScript): `web`, `server`, `runner`, `shared`
- Web: Vite + React + Three.js (pixel-art pipeline, see docs/ART.md)
- Server: Bun + Hono + WebSockets, Postgres (Neon)
- GitHub App: sign-in, installs, webhooks, PRs as `shiptorio[bot]`
- Agents in git worktrees: Spark agent loop, `codex exec --json`, `claude -p --output-format stream-json`
- Connectors: Sentry webhook + Sentry MCP, inbound email to `feedback@` (Postmark or Resend), PostHog, GitHub Issues
- Demo app: a small shop with Sentry and PostHog wired in and 3 planted bugs

## Version 1: small, but feels great

One line working end to end, polished until it feels like a game:
- Ore: GitHub issues + Sentry errors.
- Machines: Splitter (Spark), Assembler (Spark or one subscription CLI), Inspector (tests + lint), Launch pad.
- Power: one steam plant (Spark) + one solar plant (a subscription via the local helper).
- Map: districts from the repo, biters on Sentry errors, a rocket on every launched PR.
- Feel: placement, moving belts, items flowing, rework loop, launch moment, sound.

The rest of the game design (quality tiers, launch permits, trust, science, research) is in
[docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) and layers on after v1 works.

## Lanes (built in parallel)

| Lane | Who | Owns |
|---|---|---|
| Backend | A Codex thread, from `briefs/codex.md` | `server/`, `runner/`, Spark, GitHub App, webhooks, harnesses |
| UI + feel | Justin + Claude Code, hands-on | `web/`: map, art, interactions, animation, sound |
| Contract | Both | `shared/` types + protocol; changes go in a PR both lanes see |
| Demo app + sprites | Muse Code, from `briefs/muse-code.md` | `shiptorio/demo-shop`, sprite set |

**The UI never waits for the backend.** `web/src/sim/` is a fake factory that sends the same messages as the real
server, with scripted scenarios. `?source=sim` or `?source=live` switches between them.
Each lane works in its own worktree and branch (`backend`, `ui`) and merges into `main` once a day.

## Day by day

| Day | Build | Checkpoint |
|---|---|---|
| Mon 10/26 | Repo, GitHub App, Spark checks (images, effort, rate limits), parallel CLI smoke test, demo app | Issue → Spark agent → real PR |
| Tue 10/27 | Map v1: districts on a grid, pan/zoom, live state over WebSocket, issues as ore | Drag ore onto an assembler; PR lands on the launch pad live |
| Wed 10/28 | Build mode, typed belts, Spark splitter, inspector with rework loop. Connect Shiptorio's own repo | Split → 2 assemblers → reject → rework → PR. First PR Shiptorio ships to itself |
| Thu 10/29 | Sentry biters, inbox ore, email ↔ Sentry matching, PostHog roads, local runner + Codex/Claude Code adapters | Break the app → biters → fix line ships a PR |
| Fri 10/30 | Visual inspector, modules, steam + solar power, load balancing, API ↔ Baseten failover | Kill a steam plant; the line reroutes |
| Sat 10/31 | Pollution, cleanup machine, turrets, auto-scaling, Spark starter-factory planner | New repo gets a working factory in 60 s |
| Sun 11/1 | Voice foreman, rocket launch on merge, eval: 20 planted bugs × machine types | Voice beat + eval table |
| Mon 11/2 | Feature freeze 6 PM, replay mode, record takes, README + diagram + eval + self-shipped PR count | Raw footage |
| Tue 11/3 | Edit, captions, fix bugs found while recording | Final cut |
| Wed 11/4 | Submit by noon | Done |

## Demo (3:00)

| Time | Beat |
|---|---|
| 0:00 | "Built this week, from zero. Some of it by Shiptorio itself." |
| 0:15 | Connect a repo; Spark lays out the starter factory |
| 0:40 | Place a splitter, an inspector, a Claude Code machine. "Bring your own agents. Spark runs the floor." |
| 1:00 | Heal: break the app, biters, email matched to the Sentry error, rework loop, PR |
| 1:45 | Scale: queue backs up, the factory adds a machine; batteries low, work switches to steam |
| 2:05 | Outage: kill a steam plant, the line reroutes |
| 2:20 | Voice: "put a turret on checkout" |
| 2:35 | Merge, rocket launch, app live, eval table |
| 2:50 | "The factory must grow. Shiptorio." |

## Risks

1. Spark lacks image input or effort levels → loadout modules; inspector judges from DOM + test run.
2. CLIs clash in parallel → separate worktree and separate config/home dir per machine.
3. Credits run out during the eval → run the eval on subscriptions first, smaller Spark sample.
4. A live fix fails on camera → small planted bugs, many takes, replay mode.
5. Subscription terms → local runner only; re-read current terms before submitting.

## Open questions (answer Mon 10/26)

- [ ] Does Spark accept images?
- [ ] Does Spark expose reasoning effort levels?
- [ ] Spark rate limits and credit balance?
- [ ] Does `codex exec` with Spark handle tool calls cleanly?
- [ ] Do `claude -p` and `codex exec` run cleanly in parallel worktrees? (`scripts/smoke-parallel-agents.sh`)
