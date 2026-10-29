> **Archived 2026-10-29:** Justin's original plan doc export. The 3D map, Fly/Neon stack and day plan are replaced by ../../VISION.md and ../demo-plan.md.

> Export of Justin's plan doc (https://claude.ai/artifact/AWJrfEvb9c7BRwvQNcj1XL), tab "Shiptorio", taken 2026-10-26.
> **Out of date on stack:** the Fly.io + Neon parts are replaced by Cloudflare. See `decisions.md`. Two embedded diagrams didn't export.

# Shiptorio

Oct 26, 2026 · @Justin

## What Shiptorio is

Shiptorio turns a codebase into a Factorio-style factory: user feedback is the ore, AI agents are the machines, and every rocket that launches is a real merged pull request. You design the factory; the factory ships the code.

- **Name and tagline:** Shiptorio, "The factory must grow."
- **Event:** Meta AI Developer Hackathon with Cerebral Valley, Mon Oct 26 (11 AM CT) to Wed Nov 4 (8 PM CT). Built by Justin, working with AI agents.
- **Judging:** Impact 30%, use of Meta's tools 25%, demo 25% (a 3-minute video), technical depth 20%.
- **Rules that shape it:** a fresh repo with only work done during the event, and real, central use of Meta's models.
- **Who runs the floor:** Muse Spark makes every factory decision. Claude Code, Codex and other agents only work as assemblers, taking orders from Spark.
- **Why this idea won over the alternatives:** a voice-first "one mic" Mac app had clearer day-one impact but a crowded field and a quieter demo. Shiptorio has the most memorable video, the most inventive use of Meta's models, and nothing to disclose from earlier work.

## Game design

The game is Factorio's loop applied to software: there is always one more bottleneck, and fixing it ships real code.

### Three kinds of stuff

| Game | Real thing | Behavior |
| --- | --- | --- |
| Ore | Sentry errors, user feedback emails, GitHub issues, and the codebase itself (lint findings and complexity under each district) | Piles up; ignored Sentry ore turns into biters |
| Solar panel + battery | Subscriptions: Claude, Codex, Cursor, Grok | Free; drains and recharges on the plan's usage window |
| Steam plant | Paid APIs: Muse Spark on Meta's API, Baseten as backup | Always on; burns credits |
| Geothermal | Local inference: the Mac (MLX, Glimmer) or the 3090 (llama.cpp) | Free and always on; capped throughput |
| Machines | Agent harnesses: Spark, Claude Code, Codex, Cursor agent, Grok CLI, local models | Machine = harness × power source |

### The core loop

Ore arrives, you route it, PRs ship as rockets, you earn science, science unlocks research, the factory grows, and a new bottleneck appears.

&#91;embedded content: the core loop · 7 steps\]

- **Science by type:** red for bug fixes, green for features, grey for cleanup, blue for tests added.
- **Research unlocks:** new machine types, auto-triage, circuit rules ("if Sentry spikes above 10/min on /checkout, route to Spark at high effort"), blueprints to save and share layouts.
- **Daily habit:** open it in the morning, see overnight biters and PRs waiting, launch rockets.

### The shipping end: quality and trust

- **Quality tiers:** a PR's tier is the set of gates it passed. Normal (lint), uncommon (types), rare (unit tests), epic (visual QA + e2e), legendary (human review).
- **Launch permits:** Spark rates each district's risk from PostHog traffic and blast radius. /checkout needs rare or better; docs can launch at normal.
- **Inspectors cost power and time:** more gates are safer but slower. Choosing that balance is the gameplay.
- **Trust meter:** clean launches raise trust. A launched PR that causes new Sentry errors spawns biters and drops trust. Enough trust unlocks auto-launch for low-risk districts, so you earn the right to automate more.
- **Score is real:** lead time from ore to launch, escaped defects, cost per PR, pollution. Achievements such as "Zero-day" (Sentry error to launched fix in under 10 minutes).
- **Safety:** agents only ever open PRs, never push to main. A human merge launches the rocket.

## Art direction

Shiptorio is real 3D rendered as pixel art, modeled on the look of Thariq's (@trq212) game prototype clips: an orthographic camera at a 45° turn, a low-resolution render scaled up with hard pixel edges, a quantized palette, dark outlines, and everything animated. The UI is pixel lettering in dark boxes with thin light borders and round corner buttons.

- **Live factory prototype:** [Shiptorio Pixel Prototype](https://claude.ai/artifact/KGfEwhDLxxu8LMjGkcqNrK) (floating island, belts, machines, biters, rocket launches, a tuning panel with 9 presets and 10 sliders)
- **Item Lab:** [Shiptorio Item Lab](https://claude.ai/artifact/1LRgfMxAMrZ5gv1r2dkkKy) (all 12 items with states, tiers and variants)
- **Earlier screen mockups and rejected flat styles:** [Shiptorio mockups](https://claude.ai/artifact/8L5PrtJ4RfMSpDfMUmcSrA)
- **In the repo:** `docs/ART.md`, `docs/art-prototype.html`, `docs/item-lab.html`

### Locked settings (chosen by Justin)

| Setting | Value | What it does |
| --- | --- | --- |
| Pixel size | 2 px | Render at half resolution, scale up with nearest-neighbor |
| Colors per channel | 32 | Palette quantization after the render |
| Dither | 0 | No ordered dithering |
| Outline strength | 0.35 | Darkens a pixel by 35% when a neighbor is brighter |
| Outline threshold | 0.12 | Luminance difference that counts as an edge |
| Saturation, contrast | 1.05, 1.05 | Slight boost before quantizing |
| Shadows | 1024 px, hard edges | `BasicShadowMap` |
| Camera | 45° turn, 30° tilt, orthographic | The angle Justin liked |
| Sharper when zoomed out | On | Pixels shrink as you zoom out (never below 1 px), so wide views stay crisp |

### How it's built

- **Three.js** for the map (it replaced PixiJS once this style was chosen).
- The scene renders to a low-resolution render target, then a full-screen pass applies outline, saturation and contrast, then quantizes.
- Materials are flat-shaded Phong with no specular; small canvas textures with nearest filtering (stone paving, cliffs, belts, water).
- Every machine is built from boxes, cylinders, cones and lathe shapes in code, so its parts can move.
- Palette: stone #c9b48a, cliff slate #3a4268, moss #4f7d3b, steel #8a94a3, amber #f2a93b, green #5bd18b, red #ff5e52, blue #6fb2ff, void #1b2448.
- Fonts: Silkscreen for pixel UI, JetBrains Mono for small text.

## The 12 items

Each building has its own silhouette, colors and moving parts based on what it does. All are live in the [Item Lab](https://claude.ai/artifact/1LRgfMxAMrZ5gv1r2dkkKy).

| Item | Real thing | Looks like | What moves | States | Tiers / variants |
| --- | --- | --- | --- | --- | --- |
| Assembler | One coding agent in its own git worktree | Open workshop, code screen on the back wall, crates in, out-tray | Robot arm in the agent's color picks a task, welds at the bench with sparks, drops a branch; screen scrolls code; MK2 crane; MK3 second arm and dish | Idle, working, blocked (arm freezes, red beacon) | MK1–MK3; Spark, Claude Code, Codex |
| Splitter | Spark triage: merges duplicates, splits feedback into tasks | Orange silo on legs, Spark radar on top | Bucket elevator, chute swinging between two belts, radar dish | Idle, sorting | none |
| Inspector | Tests, lint and type checks | White and blue scanner tunnel | CT ring spins around each item, stamp press comes down green or red, pusher kicks rejects into a red bin | Scanning, pass, reject | none |
| Launch pad | Finished PRs waiting for your merge | Pad, red lattice gantry, fuel tank, rocket | Ring lights chase, arms swing open, rocket launches with flame and smoke | Idle, countdown, launch | none |
| Turret | Tests guarding a district | Armored gatling on an octagonal base | Six barrels spin up, muzzle flash, tracers, ejected casings, radar dish | Scanning, firing | none |
| Biter | A Sentry error on the district its stack trace points to | Segmented armored bug with spikes, pustules, pincers | Six jointed legs in a tripod gait, lunges, bursts into pixels | Walk, attack, die | Small (warning), medium (error), big (crash) |
| Solar panel | A subscription plan | Tracking panel array | Panel follows the sun, light sweeps across cells | Sunny, capped | Claude, Codex, Cursor, Grok |
| Battery | A plan's capacity | Three-cell bank, copper bus bars, transformer | Charge bars fill and drain, meter needle, sparks while charging | Charging, full, draining, empty | none |
| Steam plant | A paid API | Refinery: tanks, rusty tower with platforms, flare stack | Nodding pumpjack, flare burns bigger with spend, smoke | Idle, running, overload | Meta API, Baseten |
| Geothermal | Local inference on your hardware | Concrete cooling tower, drill rig, server rack | Steam from the tower, drill spins into glowing ground, rack lights and fans | Idle, inference, overheat | Mac (MLX), 3090 (llama.cpp) |
| Conveyor belt | A typed queue between machines | Belt on legs with rollers | Moving surface and items | Running, jammed | none |
| Ore deposit | Raw feedback waiting to be mined | Crater with crystals or rocks | Crystals pulse, floating envelopes (inbox) and # tags (issues) | Rich, depleted | Sentry, inbox, issues |

Justin's feedback so far: loves the art style, the rocket and the turret; the earlier square buildings looked too alike, which led to the redesign above. Still to push: the launch pad base and the solar panel.

## Architecture

Shiptorio is a TypeScript web app plus a small helper program on the user's own computer. The server owns the truth, the browser only draws it, and the helper only runs jobs.

&#91;embedded content: architecture · web app, server, runners\]

The helper dials out to the server, takes jobs, works in git worktrees and pushes branches; the server opens the PR.

- **Web app (browser):** the map and every panel. Renders state, sends player actions.
- **Server (Fly.io):** GitHub App (sign-in, installs, webhooks, PRs as `shiptorio[bot]`), feedback ingest, the factory engine (tick loop, queues, power-aware routing), Spark calls, Postgres on Neon.
- **Runner, hosted:** the same runner program in Fly containers, Spark harness only.
- **Runner, local (the helper):** on the user's machine. Finds their logged-in `claude`, `codex`, Cursor and Grok CLIs plus local model endpoints, and offers them as machines. Connects out to the server, so the machine never needs to be reachable. **Subscription logins never run on our servers.**
- **Per job:** the server hands the runner a short-lived GitHub installation token; the runner works in a git worktree, pushes a branch, streams events back; the server opens the PR.
- **Pairing:** `bunx shiptorio-runner pair ABCD-1234`, later a single binary from `bun build --compile`.

### Stack

- Bun workspaces: `shared/` (zod model + protocol), `server/` (Hono + WebSockets, Drizzle), `runner/` (harnesses, power detection, worktrees), `web/` (Vite + React + Three.js).
- Feel: GSAP for tweens, Howler.js for original sound effects (made with jsfxr), a mute toggle.
- Connectors: Sentry webhook + MCP, inbound email to a `feedback@` address (Postmark or Resend), PostHog traffic, GitHub Issues.

### Protocol (shared/src/protocol.ts)

- Server to web: `snapshot`, `patch`, `log`
- Web to server: `place_machine`, `remove_machine`, `connect_belt`, `set_module`, `launch_pr`
- Runner to server: `hello {mode, harnesses, powerSources}`, `job_event`, `job_done`
- Server to runner: `job_assign {jobId, repo, baseSha, token, harness, task}`
- Item states: ore, queued, working, inspecting, rejected (with failure), working, passed, on pad, launched

### Meta models

- **Muse Spark:** every factory decision (triage, splitting, routing, inspection, starter-factory planning, email-to-Sentry matching) and its own assembler. Baseten as failover.
- **Muse Voice Transcribe:** the voice foreman ("put a turret on checkout").
- **Muse Glimmer:** the geothermal plant, running locally on the Mac or the 3090.

## Build plan

Version 1 is one complete line, polished until it feels like a game; everything else layers on after it works. Submit by noon on Wed Nov 4, not 8 PM.

### Version 1

- Ore: GitHub issues and Sentry errors.
- Machines: splitter (Spark), assembler (Spark or one subscription CLI), inspector (tests + lint), launch pad.
- Power: one steam plant (Spark) and one solar plant (a subscription through the helper).
- Map: districts from the repo, biters on Sentry errors, a rocket on every launched PR.
- Feel: placement, moving belts, items flowing, the rework loop, the launch moment, sound.

### Two lanes in parallel

| Lane | Who | Owns |
| --- | --- | --- |
| Backend | A Codex thread working from `briefs/codex.md` | `server/`, `runner/`, Spark, GitHub App, webhooks, harnesses |
| UI and feel | Justin + Claude Code, hands-on | `web/`: map, art, interactions, animation, sound |
| Contract | Both | `shared/` types and protocol; changes go in a PR both lanes see |
| Demo app and sprites | Muse Code, from `briefs/muse-code.md` | `shiptorio/demo-shop` with 3 planted bugs |

**The UI never waits for the backend.** `web/src/sim/` is a fake factory that sends the same messages as the real server, with scripted scenarios (quiet morning, biter attack, rework loop, outage). `?source=sim` or `?source=live` switches. The scenarios double as demo replay. Each lane has its own worktree and branch and merges daily.

### Day by day

| Day | Build | Checkpoint you can record |
| --- | --- | --- |
| Mon 10/26 | Contract first, then lanes. Repo, GitHub App, Spark checks, simulator, first map render | Issue to Spark agent to a real PR |
| Tue 10/27 | Map v1: districts from the repo, live state, issues as ore | Drag ore onto an assembler; PR lands on the pad live |
| Wed 10/28 | Build mode, typed belts, Spark splitter, inspector with rework loop. Connect Shiptorio's own repo | Split, two assemblers, reject, rework, PR. First PR Shiptorio ships to itself |
| Thu 10/29 | Sentry biters, inbox ore, email-to-Sentry matching, PostHog roads, local helper with Codex and Claude Code | Break the app; biters; the fix line ships a PR |
| Fri 10/30 | Quality tiers, launch permits, trust, geothermal power, failover | Kill a steam plant; the line reroutes |
| Sat 10/31 | Science, research tree with 3 unlocks, achievements, auto-scaling, starter-factory planner | A new repo gets a working factory in 60 seconds |
| Sun 11/1 | Voice foreman, rocket launch on merge, eval: 20 planted bugs × machine types | Voice beat plus the eval table |
| Mon 11/2 | Feature freeze at 6 PM, replay mode, record takes, README and diagram | Raw footage |
| Tue 11/3 | Edit, captions, fix bugs found while recording | Final cut |
| Wed 11/4 | Submit by noon | Done |

## Demo script (3:00)

The moment that wins: break the app on camera, and the factory heals it with a real PR before the video ends.

| Time | Beat |
| --- | --- |
| 0:00 | Card: "Built this week, from zero. Some of it by Shiptorio itself." |
| 0:15 | Connect a repo; Spark lays out the starter factory |
| 0:40 | Place a splitter, an inspector and a Claude Code machine. "Bring your own agents. Spark runs the floor." |
| 1:00 | Heal: click the broken button, Sentry fires, biters swarm /checkout, the user's email matches the same bug, rework loop, PR |
| 1:45 | Scale: a queue backs up and the factory adds a machine; batteries run low and work switches to steam |
| 2:05 | Outage: kill a steam plant; the line reroutes to Baseten |
| 2:20 | Voice: "Put a turret on checkout." |
| 2:35 | Merge, the rocket launches, the app is live; eval table on screen |
| 2:50 | "The factory must grow. Shiptorio." |

Record the heal beat many times and keep the best take; replay mode is the safety net.

## Open questions, risks and next steps

The repo is ready locally at `~/omni/shiptorio` but not pushed: the GitHub login on the Omarchy machine expired and the `shiptorio` org isn't created yet.

### Next steps

- [ ] Create the `shiptorio` GitHub org (or use `r3dbars/shiptorio`) and claim a domain
- [ ] Log `gh` back in: `gh auth refresh -h github.com -s admin:org,repo,workflow`
- [ ] Set a git name, then commit and push the repo (plan, architecture, art, briefs, prototypes)
- [ ] Scaffold the Bun workspaces and write `shared/` model and protocol
- [ ] Rewrite `briefs/codex.md` for the backend lane and start the Codex thread
- [ ] Start the UI lane: the simulator with the biter-attack scenario, then the Three.js map from the prototype
- [ ] Run `scripts/smoke-parallel-agents.sh` (Claude Code and Codex in parallel worktrees; auto mode blocked it for Claude)
- [ ] Pick the demo app and wire Sentry and PostHog into it
- [ ] Art: push the launch pad base and the solar panel next

### Open questions

- Does Muse Spark accept images (for visual QA)?
- Does Spark expose reasoning-effort levels (for modules)? If not, modules become prompt and tool loadouts.
- Spark rate limits and credit balance, and whether `codex exec` handles Spark tool calls cleanly.

### Risks

- A live fix fails on camera: small planted bugs, many takes, replay mode.
- CLIs clash in parallel: separate worktree and config directory per machine.
- Credits run out during the eval: run subscriptions first, then a smaller Spark sample.
- Subscription terms: Claude and ChatGPT logins only run in the local helper, never hosted. Re-read the current terms before submitting.
- The "-torio" name leans on Factorio; fine for a hackathon, revisit if it becomes a company. Use original art only.
- Demo risk from impact being scored at 30%: pitch it as the control room for an agent fleet, with real metrics on screen.

The full conversation that produced this plan: Transcript
