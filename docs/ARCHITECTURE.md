# Shiptorio architecture and game design

> **Stack update (Oct 26):** we host on Cloudflare, not Fly.io and Neon. The server is one Worker (Hono) with a
> Factory Durable Object per repo, D1 for installs and PR state, and KV for cached repo maps. Where this doc says
> Fly, Neon, Postgres or Drizzle, read Cloudflare. `AGENTS.md` has the current layout. The game design, lanes,
> protocol and runner design below all still hold.

## Context

Shiptorio is Justin's Meta hackathon entry (Oct 26 – Nov 4, 2026): a Factorio-style map of a codebase where
feedback (GitHub issues, Sentry errors, user emails, PostHog traffic) is ore and the machines are real agent
pipelines that open PRs. We decided:

- **Web app** for everything you look at (map, connecting services, the factory).
- **Small helper ("runner") on the user's own computer** that only starts their logged-in `claude` and `codex`
  CLIs. Subscriptions never run on our servers.
- **TypeScript everywhere**, so the map, server and helper share one set of types.
- **Muse Spark is the brain** (triage, splitting, routing, inspection); Claude Code and Codex are only assemblers.

The repo already exists locally at `~/omni/shiptorio` with `README.md`, `PLAN.md` (day-by-day schedule),
`AGENTS.md`, `briefs/codex.md`, `briefs/muse-code.md`, `scripts/smoke-parallel-agents.sh`. No code yet.
The visual direction is the "industrial" artboard at https://claude.ai/artifact/8L5PrtJ4RfMSpDfMUmcSrA.

## Game design

### Three kinds of stuff
1. **Ore = demand.** Sentry errors, user feedback emails, GitHub issues, and the codebase itself (lint findings and
   complexity are deposits under each district). Ore piles up; ignored Sentry ore turns into biters.
2. **Power = compute.** Every model source is a power plant:
   | Plant | Real thing | Behavior |
   |---|---|---|
   | Solar + batteries | Subscriptions: Claude, Codex, Cursor, Grok | Free; capacity drains and recharges on the plan's window |
   | Steam | APIs: Muse Spark (Meta API, Baseten backup), others | Always on; burns credits |
   | Geothermal | Local inference: Mac (MLX, e.g. Glimmer), 3090 (llama.cpp server) | Free and always on; capped throughput; weaker on hard items |
3. **Machines = harnesses.** Spark brain machines, plus assemblers running Claude Code, Codex, Cursor agent, Grok CLI,
   or an OpenAI-compatible harness pointed at a local model. Machine = harness × power source.

### The loop (why it's addictive)
Ore arrives → you route it → PRs ship (rockets) → you earn **science** → science unlocks research → bigger/faster
factory → a new bottleneck shows up → you fix it. Same loop as Factorio: always one more bottleneck.
- **Science packs by type:** red = bug fixes, green = features, grey = cleanup, blue = tests added.
- **Research unlocks:** new machine types, auto-triage, circuit rules ("if Sentry spike > 10/min on /checkout,
  route to Spark at high effort"), blueprints (save and share a layout), better inspectors.
- **Session loop:** open Shiptorio in the morning → see overnight biters and PRs waiting on the pad → launch rockets.

### The shipping end: quality and trust
- **Quality tiers** (like Factorio Space Age): an item's tier is the set of gates it passed —
  normal (lint) → uncommon (types) → rare (unit tests) → epic (visual QA + e2e) → legendary (human review).
- **Launch permits per district:** Spark rates each district's risk from traffic (PostHog) and blast radius.
  /checkout needs rare or better; docs can launch at normal. Safety rules are game rules.
- **Inspectors cost power and time:** stacking gates is safer but slower. That tradeoff is the gameplay.
- **Trust meter = autonomy:** clean launches raise trust; a launched PR that causes new Sentry errors spawns
  biters from that PR and drops trust. Enough trust unlocks auto-launch for low-risk districts. You literally
  earn the right to automate more.
- **Score = real metrics:** lead time (ore → launch), escaped defects, cost per PR, pollution.
  Achievements: "Zero-day" (Sentry → launched fix in < 10 min), "Lights out" (8 h unattended), "Green belt"
  (20 PRs, no rework).

### In the hackathon demo
Quality tiers + launch permits, trust meter, science + 3 research unlocks, the three power types
(solar, steam, geothermal with Glimmer on the Mac or the 3090).

## Version 1 (small, but feels great)

One line, working end to end, polished until it feels like a game:
- Ore: GitHub issues + Sentry errors (inbox and PostHog come after v1).
- Machines: Splitter (Spark), Assembler (Spark or one subscription CLI), Inspector (tests + lint), Launch pad.
- Power: one steam plant (Spark) + one solar plant (Claude or Codex subscription via the local helper).
- Map: districts from the repo, biters on Sentry errors, a rocket on every launched PR.
- Feel: placement, belts moving, items flowing, rework loop, launch moment, sound.
Everything else in "Game design" layers on after v1 works.

## How we build it: two lanes in parallel

| Lane | Who | Owns | Working style |
|---|---|---|---|
| Backend | A Codex thread | `server/`, `runner/`, Spark client, GitHub App, webhooks, harnesses | Runs from `briefs/codex.md`; Justin checks in |
| UI + feel | Justin + Claude Code, hands-on | `web/`: map, art, interactions, animation, sound | Tight loop, lots of iteration |
| Contract | Both, agreed first | `shared/` (types + protocol) | Changes go in a PR both lanes see |

**What makes parallel work possible: the UI never waits for the backend.**
1. **Hour 1, together:** write `shared/src/model.ts` and `shared/src/protocol.ts` (the message list below).
2. **The UI runs on a simulator:** `web/src/sim/` is a fake factory that emits the same `snapshot`/`patch`/`log`
   messages as the real server, with scripted scenarios (quiet morning, biter attack, rework loop, outage).
   Switch with `?source=sim` or `?source=live`. The scenarios double as demo replay later.
3. **Codex builds the real server to the same protocol.** When it's ready, flip to `live`; nothing in the UI changes.
4. **Git:** each lane in its own worktree and branch (`backend`, `ui`), small PRs into `main`, merge daily at
   the end of each day's checkpoint.

**UI + feel stack:** Three.js for the map (see docs/ART.md), GSAP for tweens (placement bounce, item flow, launch screen shake),
procedural Web Audio for sound (web/src/sound/: chiptune effects synthesized in code, no audio files;
belt hum, assembler clank, inspector stamps, verify bay pop/ram, rework rattle, Spark chirps, rocket countdown + launch),
a mute toggle (M) and volume in the HUD, silent until the first click. Original art only.

## How the pieces talk

```
 browser (web)  ⇄ WebSocket ⇄  server (Fly.io)  ⇄ WebSocket ⇄  runner
   map + panels                  GitHub App,                    hosted: Spark only (Fly container)
                                 webhooks, factory engine,      local: + claude, codex (user's machine)
                                 Spark calls, Postgres
```

- **Server owns the truth.** It holds the factory state, runs the tick loop, decides which machine gets which item,
  and opens PRs through the GitHub App.
- **Web only renders state and sends player actions** (place machine, draw belt, launch PR).
- **Runner only runs jobs.** It connects *out* to the server (so the user's machine never needs to be reachable),
  says which harnesses it has, takes a job, works in a git worktree, pushes a branch, and streams events back.
  The server hands it a short-lived GitHub installation token per job for cloning and pushing.
- **The same runner program runs in both places**: `--mode hosted` on Fly (Spark harness only) and
  `--mode local` on a user's machine (adds `claude` and `codex` if found on PATH).

## Repo layout (Bun workspaces)

```
shared/   src/model.ts      zod schemas: District, Ore, Machine, Belt, Item, Pr, PowerSource
          src/protocol.ts   WebSocket messages for web⇄server and runner⇄server
server/   src/index.ts      Hono app + WebSocket upgrade
          src/github/       app.ts (@octokit/app: login, installs, tokens, open PR), webhooks.ts
          src/ingest/       sentry.ts, inbox.ts, posthog.ts  → Ore
          src/factory/      engine.ts (tick, queues), balancer.ts (power-aware routing), districts.ts (repo tree → grid)
          src/spark/        client.ts (Meta API, Baseten failover), brain.ts (triage, split, inspect, plan)
          src/db/           schema.ts (Drizzle, Postgres on Neon)
runner/   src/index.ts      connect, advertise harnesses, job loop
          src/harness/      spark.ts (codex exec on Meta provider), codex.ts (codex exec --json), claude.ts (claude -p stream-json),
                            cursor.ts, grok.ts, local.ts (codex/opencode against an OpenAI-compatible local endpoint)
          src/power/        detect subscriptions (CLIs on PATH + login state) and local endpoints (MLX, llama.cpp)
          src/worktree.ts   clone/fetch with job token, git worktree add, commit, push
web/      src/              Vite + React; map/ (Three.js layers: terrain, ores, belts, items, machines, biters),
                            panels/ (PowerGrid, FloorLog, MachineInspector, Heal, Connect), store.ts (zustand from WS)
```

Root: `package.json` (workspaces), `tsconfig.base.json`, Biome for lint/format, `.env.example`, `fly.toml`.

## Key protocol messages (shared/src/protocol.ts)

- server → web: `snapshot` (whole factory), `patch` (changed entities), `log` (floor log line)
- web → server: `place_machine`, `remove_machine`, `connect_belt`, `set_module`, `launch_pr`
- runner → server: `hello {mode, harnesses[], powerSources[]}`, `job_event {jobId, kind, text}`, `job_done {jobId, branch, ok, summary}`
- server → runner: `job_assign {jobId, repo, baseSha, token, harness, task}`

Item states: `ore → queued → working → inspecting → rejected(failure) → working → passed → on_pad → launched`.

## Pairing the local helper

Connect page shows "Add your own agents" with a one-line command and a pairing code:
`bunx shiptorio-runner pair ABCD-1234` (later: a single binary from `bun build --compile`). The runner stores
its runner token in `~/.config/shiptorio/runner.json` and reconnects on start.

## Build order (matches PLAN.md days)

1. **Mon 10/26 — contract, then two lanes.** Scaffold workspaces + shared types together. UI lane: simulator +
   first map render. Backend lane: Server: GitHub App login, install
   webhook, `issues.opened` → Item → `job_assign`. Runner (hosted mode, run locally for now): Spark harness via
   `codex exec` with the Meta provider config → push branch → server opens PR.
   *Done when:* opening an issue on `shiptorio/demo-shop` produces a real PR.
2. **Tue 10/27 — map v1.** `districts.ts` (repo tree → squarified grid, deterministic), WebSocket snapshot/patch,
   Three.js terrain + ores + machines + items through the pixel pipeline (docs/ART.md), drag ore onto an assembler. Port the prototype's HUD.
3. **Wed 10/28 — build mode + rework loop.** Place machines, typed belts, Spark splitter, inspector runs tests
   in the worktree; rejected items go back with the failure attached. Connect Shiptorio's own repo.
4. **Thu 10/29 — feedback ore + local helper.** Sentry webhook → biters on district (stack frame → file → district),
   inbox webhook → ore, Spark matches email ↔ Sentry, PostHog traffic. `--mode local` with codex + claude harnesses.
5. **Fri 10/30 — quality and trust.** Gates as inspector machines, quality tiers on items, launch permits per
   district, trust meter, geothermal power (local endpoint on the Mac or 3090).
6. **Sat 10/31 — progression.** Science packs, research tree with 3 unlocks (circuit rules, auto-triage,
   blueprints), achievements.
7. **Sun 11/1 onward** as in PLAN.md (visual QA, power + failover, pollution/turrets, voice, eval, replay, video).

## First steps after approval

0. **Save the plan to GitHub.** Copy this plan into the repo as `docs/ARCHITECTURE.md`, update `PLAN.md` with v1 scope
   and the lane split, set a repo-local git name from the GitHub account (`gh api user`), commit, create the repo
   with `gh repo create shiptorio/shiptorio --public` (fall back to `r3dbars/shiptorio` if the org isn't made yet), push `main`.
   Needs first: `gh` logged back in (token currently invalid) and, for the org path, the `shiptorio` org created.
1. Scaffold the Bun workspaces in `~/omni/shiptorio` and write `shared/` model + protocol.
2. Rewrite `briefs/codex.md` for the backend lane: v1 scope, the protocol, its worktree/branch, daily checkpoints,
   so Justin can paste it into a Codex thread.
3. Update `PLAN.md` and `AGENTS.md` with v1 scope, the lane split and the simulator rule.
4. Start the UI lane: simulator with the "biter attack" scenario, then the Three.js map from docs/art-prototype.html with the locked settings in docs/ART.md.

## Things to settle on day 1 (blocking, cheap)

- Meta API request format for Spark (OpenAI-compatible or not) → shapes `spark/client.ts`; keep it behind one interface.
- Spark image input and effort levels (visual QA + modules).
- `gh` re-login and the `shiptorio` GitHub org (Justin is doing this now).
- Smoke test of `claude -p` + `codex exec` in parallel worktrees — auto mode blocked me; Justin runs
  `~/omni/shiptorio/scripts/smoke-parallel-agents.sh`.

## Verification

- `bun test` in `shared/` (schema round-trips) and `server/` (balancer routing, districts layout determinism).
- Day 1 end-to-end: run server + runner locally (`bun dev`), expose the server with a tunnel or deploy to Fly,
  open an issue on the demo repo, watch `job_event` logs, confirm a PR from `shiptorio[bot]` appears.
- Day 2: open the web app, confirm districts match the repo tree and the PR appears on the launch pad live.
- Local helper: run `--mode local`, confirm `hello` lists `claude` and `codex`, place a Codex assembler, get a PR.

### Adaptive foundry music (Day 2 feel checkpoint)

“Up from the Mine”, a 16-bar original theme, is the default after Justin's listening
approval. `?music=1` selects PR #182's older procedural score for comparison; existing
`?music=2` links keep selecting the foundry theme. `music.ts` maps factory activity into idle,
working, blocked and launch states with hysteresis. `foundryPlayer.ts` retains one
transport, schedules eighths ahead, and changes arrangements on bar boundaries with
0.48s equal-power crossfades. `foundryScore.ts` holds the reproducible score and cached
additive instrument waves: harmonium, low strings/brass, celesta and metal/piston groove.
Launch resolves over three bars (~7.8s), ducked under the existing rocket roar.
The explicit intro flag gets the same motif as a title arrangement.

The v2 module loads only after audio unlock with music on. No recordings/stems are
fetched, decoded or retained (0 audio payload, 0 decoded PCM); `quality=2` reduces voices.
The service worker caches the hashed score module only after its first request.
Master mute/visibility suspend audio, music off fades queued notes, and the separate
persisted music gain sits before master volume, preserving focus and launch ducking.
`musicState()` includes state, arrangement, loaded stems (empty), voice count and bar.
The score/waveforms and generated auditions are CC0; inventory: `web/public/music/LICENSES.md`.
