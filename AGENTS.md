# AGENTS.md

Read this before you change anything. It's short on purpose: what's true **today** (2026-10-29). History lives in
[`docs/context/archive/`](docs/context/archive/README.md); don't follow rules you find there.

## Read first

1. [`docs/VISION.md`](docs/VISION.md): the north star. Justin's goals and how to decide what's next.
2. [`docs/context/demo-plan.md`](docs/context/demo-plan.md): the plan to the demo video, day by day, and who owns
   which files right now.
3. [`docs/context/pixel-deck.md`](docs/context/pixel-deck.md): the game surface and its art rules.
4. [`docs/context/branches.md`](docs/context/branches.md): dev and main.
5. [`docs/context/README.md`](docs/context/README.md): the index for everything else.

## What Shiptorio is

Shiptorio shows your software as a factory. GitHub issues ride a conveyor through seven stations, AI agents do the
work, and every rocket that launches is a real merged pull request. There's always a bottleneck, and it's usually
waiting on one of your calls. You swipe a card, the line moves. Approve the same kind of thing a few times and the
factory starts doing it on its own, so you're free for the next jam. Meta's Muse Spark makes the factory's decisions.

Built for the Meta AI Developer Hackathon. **Cutoff: Wed Nov 4, 8 PM CT.** Product done by end of Mon Nov 2; Tue and
Wed are filming only (see the demo plan).

**Right now: polish only (Justin, 2026-10-29).** "As simple as possible ... more simple, more clear, more friendly for
end users, and more polished." No new features, screens or settings. Deleting beats adding.

## The deck is the product

The 2D pixel deck (`web/deck.html` → `web/src/deck2d/`) is the game. It's the default on shiptorio.dev. The old 3D
map, the shaft, the old web UI and the experiment pages are being deleted; don't build on them.

The line, one name per station, everywhere (cards, captions, PR comments, logs, docs):

**Repo → Planner → Builder → Checks → Review → Gate → Launch**

Source of truth: `STOP_LABEL` in `web/src/deck2d/contract.ts`; `web/test/station-names.test.ts` guards it. No
synonyms (not inspector, verify bay, AI review, merge gate, assembler, inbox or launch pad). Checks runs CI and the
proof check. How each station maps to real GitHub events: [`docs/context/github-deck-loop.md`](docs/context/github-deck-loop.md).

Colors mean one thing each: **yellow** = waiting on you, **red** = actually stuck, **green** = automatic,
**cyan** = running.

Words: plain and short. Never "Spark" in player-facing copy (one "powered by Meta Muse Spark" credit is fine).
Never "you are the bottleneck"; say what's waiting on you.

## Stack

- One Cloudflare Worker (`shiptorio`, plus `shiptorio-staging` for shiptorio.dev). Hono routes, serves `web/dist`
  as static assets on the same origin.
- A Factory Durable Object per repo (`server/src/factory.ts`) owns state and talks to browsers over websockets.
- D1 (`server/migrations/`), KV. Ids are in `server/wrangler.jsonc`.
- A GitHub App for sign-in, installs and webhooks ([`docs/context/github-app.md`](docs/context/github-app.md)).
- Muse Spark (`muse-spark-1.3` on the Meta Model API, OpenAI-compatible) plans and decides
  (`server/src/spark.ts`).
- The local runner (`runner/`) runs Codex or Claude Code on the player's machine, in a git worktree, and pushes
  branches. Subscription logins only ever run there, never on our servers.

Bun workspaces: `shared/` (model + protocol, the contract), `server/`, `runner/`, `web/`, `playtest/`.

## Run and test

Needs Bun (and Node 22+ for Playwright).

```sh
bun install
bun run dev:web        # web on :5173; the deck is /deck.html (?source=sim, ?source=conveyor-demo, ?source=live)
bun run dev            # build web, then wrangler dev on :8787 with a local D1; /auth/login signs in as DEV_LOGIN
bun run check          # lint + typecheck + every test + build. Run it before you mark a PR ready
node scripts/shots/deck.mjs   # phone (390x844) + desktop (1280x720) shots of the deck; CLIP=12 for a clip
bun run stranger       # a brand-new account from sign-in to first card (docs/context/new-user-path.md)
```

More suites (E2E, visual, load): [`docs/context/testing.md`](docs/context/testing.md).
On Justin's Mac the deck runs with one paste (`scripts/deck-local.sh`, see pixel-deck.md).

## Branches and merging

- **Branch from `origin/dev`, PR into `dev`. Never `main`.** Rebase on `origin/dev` before you start and before every
  push.
- Push small commits often. Open a draft PR after your first push.
- **Merge your own PR into `dev` once check, selfhost and Stranger are green** (squash is fine). Staging then deploys
  shiptorio.dev in about 3 minutes.
- `main` is shiptorio.com. It only moves when Justin asks for a `dev → main` promotion, merged with a **merge
  commit**, never squash.
- New web behavior goes behind `feature("name")` from `web/src/flags.ts`; it's on by default on shiptorio.dev.
- D1 migrations: before merging, rebase and renumber yours to the next free number
  (`server/test/migrations.test.ts` checks).
- Anything visible: before and after shots at phone and desktop in the PR, and look at them yourself. Big layout
  changes: show Justin before merging.
- Add one line to [`docs/context/threads.md`](docs/context/threads.md) when you finish something.

## Who owns what

Many agents (Claude threads and Codex) work here at once. **One agent per hot area.** The current ownership table is
in [`docs/context/demo-plan.md`](docs/context/demo-plan.md). Stay inside your files; if you need a change in someone
else's, put the exact diff in your PR description. Check open PRs and recent `dev` commits before you start. Codex
working on the deck: [`docs/context/codex-deck-handoff.md`](docs/context/codex-deck-handoff.md).

## Art rules (short version)

Full rules: [`docs/context/pixel-deck.md`](docs/context/pixel-deck.md).

- Pixel density is locked: `ART_PX = 5`, whole-number zoom only, no smoothing.
- Only the 48 `PALETTE` colors in `contract.ts`. Light from the upper right, 1 px dark outlines.
- Code draws everything that moves; pictures only for static sky, city and clouds.
- Calm: one thing moves at a time, only the jam pulses, nothing flashes.
- Shippy the robot is the only character. No humans on the deck. Shippy never floats.
- Only original art. No Factorio assets.

## Never

- Never push to `dev` or `main` directly, and never open a PR against `main` (promotions are Justin's call).
- Never merge a PR the factory built (`shiptorio[bot]`, `shiptorio/runner-*` branches, anything in
  r3dbars/Testing) on GitHub. Those only ship through the deck's Gate (or a launch permit).
- Never skip, disable or quarantine a test to get green.
- Never commit secrets. Local ones go in `.dev.vars` (gitignored); deployed ones via `wrangler secret put`, by
  Justin. The repo is public (MIT).
- Never commit videos.
- Never touch the other Cloudflare Workers on the account (transcripted-feedback, stack99-relay, r3dbar-subscribe,
  redbars). Don't create or change Cloudflare resources unless Justin says so.
- Never move decisions out of Spark (triage, planning, routing, review). Agents like Codex are the hands, not the
  brain.
- Hackathon rule: only code written during the event (Oct 26 to Nov 4, 2026). npm libraries are fine.

## Accessibility

Every control is a real `<button>` or `<a>` whose name contains its visible text. Respect
`prefers-reduced-motion`. Text stays at 4.5:1 contrast or better. `node web/test/a11y/audit.mjs` (dev server up) runs
axe on the deck's story and sim cards at phone and desktop; `web/test/deck2d-a11y.test.ts` covers the card's keyboard
and names.

## Older docs

`docs/PRODUCT.md`, `docs/LOOP.md`, `docs/ART.md`, `docs/GAMEPLAY*.md`, `docs/ATTENTION.md`, `docs/SIMPLE-UI.md`
and the HTML art prototypes in `docs/` describe the 3D map era (each carries a banner). The day-one plan,
architecture, build mode and lane briefs moved to `docs/context/archive/`. Read them for background only; this
file and the docs above win.
The public docs site is `docs/site/*.md` (served at /docs); keep it true when you change player-facing behavior.
