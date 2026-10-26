# AGENTS.md

Context for coding agents (Codex, Claude Code, etc.) working on Shiptorio. Read this
before you change anything.

## What Shiptorio is

Shiptorio turns a codebase into a Factorio-style factory. User feedback is the ore,
AI agents are the machines, and every rocket that launches is a real merged pull
request. Tagline: "The factory must grow."

It's being built for the **Meta AI Developer Hackathon** (with Cerebral Valley),
Mon Oct 26 to Wed Nov 4, 2026. **Submit by noon CT on Wed Nov 4**, not 8 PM.

- Judging: impact 30%, use of Meta's tools 25%, demo 25% (3-minute video), technical depth 20%.
- Rules: fresh repo, only work done during the event, real and central use of Meta's models.
- **Muse Spark (Meta's API) makes every factory decision**: triage, splitting, routing,
  inspection, starter-factory planning, email-to-Sentry matching. Claude Code, Codex and
  other agents are only *assemblers* that take orders from Spark. Don't move decisions
  out of Spark. Baseten is the failover.
- Other Meta models: Muse Voice Transcribe (voice foreman), Muse Glimmer (local
  "geothermal" inference on a Mac or a 3090).

The full plan (game design, art, items, architecture, day-by-day plan, demo script,
risks) is Justin's doc: https://claude.ai/artifact/AWJrfEvb9c7BRwvQNcj1XL. That link
needs a claude.ai login, so the parts that matter for code are summarized below.

## Stack: Cloudflare, not Fly/Neon

The plan doc says Bun + Hono on Fly.io with Postgres on Neon. **Ignore that part.**
Justin chose Cloudflare, since their domain already lives there. The current shape:

- One Cloudflare Worker named `shiptorio`. It serves the web app as static assets and
  the API on the same origin.
- Hono on the Worker for routes.
- A **GitHub App** (not OAuth) for sign-in, installs, webhooks (`pull_request`, `push`,
  `check_suite`) and opening PRs as `shiptorio[bot]`.
- A **Factory Durable Object per repo** (`server/src/factory.ts`) is the factory engine:
  it owns the state, runs the tick loop on an alarm, and talks to browsers over
  websockets (`snapshot` / `patch` / `log`).
- D1 database `shiptorio` (installs, repos). Schema in `server/migrations/`.
- KV namespace `shiptorio-cache` (bound, not used yet).
- Long agent runs go in the local runner, Cloudflare Workflows or GitHub Actions, never
  inside one request.

The D1 database and KV namespace **already exist** on Justin's Cloudflare account and
their ids are in `server/wrangler.jsonc`. The Worker is **not deployed yet**.

### Layout

Bun workspaces:

| Dir | Owns |
| --- | --- |
| `shared/` | zod model (`model.ts`) and the message protocol (`protocol.ts`). The contract between lanes |
| `server/` | Hono Worker (`src/index.ts`), GitHub App + webhooks (`github.ts`, `auth.ts`), Factory Durable Object (`factory.ts`) with pure rules in `engine.ts`, Spark client (`spark.ts`), repo → districts layout (`map.ts`) |
| `runner/` | Not started. Local helper on the user's machine: finds `claude`/`codex`/Cursor/Grok CLIs and local model endpoints, runs jobs in git worktrees, pushes branches |
| `web/` | Vite + React + Three.js. `src/map/` (scene + pixel pass), `src/sim/` (fake factory), `src/source/` (sim or live), `src/store.ts` (applies snapshot/patch) |

The Worker serves `web/dist` as static assets, so build `web/` before `wrangler dev` or deploy.

What the server does today (first cut, the backend lane owns it from here): an `issues`
webhook becomes ore. The splitter triages it with Spark (kind + district), with a keyword
heuristic when there's no key. A Spark assembler picks up to 4 files, writes the change,
commits it to `shiptorio/<item>` through the GitHub API, and opens a PR (`Closes #n`). A
`check_suite` on the PR passes it to the pad or rejects it into the rework loop (3 tries).
A merged PR launches the rocket and earns science. Spark may not write outside the repo
or under `.github/` (`SAFE_PATH` in `engine.ts`).

### Protocol (`shared/src/protocol.ts`)

- Server to web: `snapshot`, `patch`, `log`
- Web to server: `place_machine`, `remove_machine`, `connect_belt`, `set_module`, `launch_pr`,
  `route_item` (drag ore onto an assembler)
- Runner to server: `hello {mode, harnesses, powerSources}`, `job_event`, `job_done`
- Server to runner: `job_assign {jobId, repo, baseSha, token, harness, task}`
- Item states: ore, queued, working, inspecting, rejected (with failure), passed, on pad, launched

Per job, the server hands the runner a short-lived GitHub installation token. The runner
works in a worktree, pushes a branch and streams events back. The server opens the PR.
The runner dials out to the server, so the user's machine never needs to be reachable.

## Lanes

| Lane | Who | Owns |
| --- | --- | --- |
| Backend | **Codex** | `server/`, `runner/`, Spark, GitHub App, webhooks, harnesses |
| UI and feel | Justin + Claude Code | `web/`: map, art, interactions, animation, sound |
| Contract | Both | `shared/`. Changes go in their own PR that both lanes see |

If you're Codex, you're on the backend lane. Don't rewrite `web/`. If you need a
protocol change, make it a small separate PR to `shared/`.

**The UI never waits for the backend.** `web/src/sim/` is a fake factory that sends the
same messages as the real server (`?source=sim` vs `?source=live`). Keep the real server
message-compatible with the sim.

## Game rules that affect code

- Ore: GitHub issues, Sentry errors, feedback emails, lint/complexity findings.
- Power: solar + battery = subscriptions (Claude, Codex, Cursor, Grok), drains and
  recharges. Steam = paid APIs (Spark on Meta's API, Baseten), burns credits.
  Geothermal = local inference, free but capped. A machine is harness × power source.
- Machines for v1: splitter (Spark triage), assembler (Spark or one subscription CLI),
  inspector (tests + lint, with a rework loop), launch pad (PRs waiting for merge).
- Quality tiers are the gates a PR passed: normal (lint), uncommon (types), rare (unit
  tests), epic (visual QA + e2e), legendary (human review).
- **Agents only ever open PRs. Never push to `main`.** A human merge launches the rocket.
- **Subscription logins (Claude, ChatGPT/Codex) only run in the local runner, never on
  our servers.**

## Version 1 target

One complete line, polished until it feels like a game: GitHub issues and Sentry errors
as ore, splitter, assembler, inspector, launch pad, one steam plant (Spark) and one
solar plant (a subscription via the runner), districts from the repo, biters on Sentry
errors, a rocket on every launched PR.

Day-by-day checkpoints:

| Day | Checkpoint |
| --- | --- |
| Mon 10/26 | Contract, GitHub App, Spark check, simulator, first map. Issue to Spark to a real PR |
| Tue 10/27 | Map v1 with live state. Drag ore onto an assembler, PR lands on the pad live |
| Wed 10/28 | Build mode, typed belts, Spark splitter, inspector rework loop. Shiptorio ships a PR to itself |
| Thu 10/29 | Sentry biters, inbox ore, email-to-Sentry matching, local runner with Codex + Claude Code |
| Fri 10/30 | Quality tiers, launch permits, trust, geothermal, failover. Kill a steam plant, line reroutes |
| Sat 10/31 | Science, 3 research unlocks, achievements, starter-factory planner |
| Sun 11/1 | Voice foreman, rocket on merge, eval: 20 planted bugs × machine types |
| Mon 11/2 | Feature freeze 6 PM, replay mode, record |
| Tue 11/3 | Edit, fix bugs found while recording |
| Wed 11/4 | Submit by noon |

The demo's winning beat: break the demo app on camera, Sentry fires, biters swarm
/checkout, and the factory ships a real fix PR before the video ends.

## Running it

Needs Bun.

```sh
bun install
bun run dev:web      # UI only, on :5173, with the simulator: http://localhost:5173/?source=sim
bun run dev          # builds web/, then wrangler dev on :8787 (writes server/.dev.vars, local D1)
bun test             # all tests
bun run typecheck    # every workspace
bun run spark:check  # needs META_API_KEY in the environment
```

Sim scenarios: `?source=sim&scenario=quiet-morning` or `rework-loop`. Add `&autolaunch`
to have PRs on the pad merge by themselves. Live: `?source=live&repo=owner/name`.

Local dev needs no GitHub App and no Cloudflare credentials. On localhost, `/auth/login`
signs you in as `DEV_LOGIN`.

Going live (Justin does this, see `docs/SETUP.md`): `npx wrangler login`, `bun run deploy`,
then open `/setup` on the deployed URL to create the GitHub App and set its secrets with
`wrangler secret put`. Spark needs `META_API_KEY` as a Worker secret.

## Hard rules

- **Don't deploy, and don't create or change Cloudflare resources, unless Justin says so.**
- **Never touch the other Workers on the account**: `transcripted-feedback`,
  `stack99-relay`, `r3dbar-subscribe`, `redbars`. Only the `shiptorio` Worker is ours.
- Never commit secrets. Local secrets go in `.dev.vars` (gitignored); deployed ones via
  `wrangler secret put`.
- Work on a branch and open a PR. Don't push to `main`.
- Only original art. The name leans on Factorio, so don't use any Factorio assets.

## Design and art

- Art direction: real 3D rendered as pixel art. Orthographic camera at a 45° turn and
  30° tilt, render at half resolution (2 px pixels), nearest-neighbor upscale, 32 colors
  per channel, no dither, outline strength 0.35 / threshold 0.12, saturation and contrast
  1.05, hard 1024 px shadows (`BasicShadowMap`). Machines are built from primitives in
  code so their parts move.
- Palette: stone #c9b48a, cliff slate #3a4268, moss #4f7d3b, steel #8a94a3,
  amber #f2a93b, green #5bd18b, red #ff5e52, blue #6fb2ff, void #1b2448.
  Fonts: Silkscreen (pixel UI), JetBrains Mono (small text).
- References (claude.ai links): Pixel Prototype https://claude.ai/artifact/KGfEwhDLxxu8LMjGkcqNrK,
  Item Lab (all 12 items) https://claude.ai/artifact/1LRgfMxAMrZ5gv1r2dkkKy,
  Feedback Factory canvas, Belts artboard https://claude.ai/artifact/HtWP6pHDcYn9TSByR6UJcn.
- Justin's local `~/omni/shiptorio` has the plan, `docs/ART.md`,
  `docs/art-prototype.html`, `docs/item-lab.html` and `briefs/` (including
  `briefs/codex.md`). It isn't pushed yet. Once it is, those files win over this summary.

## Open questions

- Does Muse Spark accept images (for visual QA)?
- ~~Does Spark expose reasoning-effort levels?~~ Yes: `reasoning_effort` minimal/low/medium/high/xhigh
  ("none" is a 400). Meta Model API is OpenAI-compatible at `https://api.meta.ai/v1`, model `muse-spark-1.3`.
- Spark rate limits, credit balance, and whether `codex exec` handles Spark tool calls cleanly.
