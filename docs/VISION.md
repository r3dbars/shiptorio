# Shiptorio vision (north star)

> **Read this first.** Every agent (Claude threads, Codex, anyone) checks this page before deciding what to
> build next. It's Justin's high-level goals, boiled down. Details live in `docs/PRODUCT.md` (product
> behavior) and `docs/LOOP.md` (the loop and the verification gauntlet).
>
> **Living doc:** whenever Justin states a new high-level goal in the project, fold it in here (one line,
> dated) and push. If this page and another doc disagree on *direction*, this page wins.
>
> Last updated: 2026-10-29.

## The goal

**Gamify your repo's ship loop, so playing the game ships real things.** Connect your repo, play, and your
product gets better for real: more shipped, more customers, more money. Every move in the game ends as a real
PR, a real release, a real reply. Shipping is the point.

**Why it matters: the human is the bottleneck.** AI now writes the code. What slows shipping is a person
deciding what AI should build, what it checks, and what it has to prove. Shiptorio makes those decisions
visible and fast. The faster you can decide, the more you ship, and the better the user experience and the
product get. But fast approvals are only step one. The bigger goal: Shiptorio pushes you to **build more and
more automation and verify all of it**. Every check you add and every clean ship earns trust, and the factory
runs more of itself over time. Verify, then automate. That's the goal of Shiptorio, and it's the first thing a
new player learns (the welcome intro).

It never ends. There is always a bottleneck, always something to optimize, always a next move. That's the game.

## Principles

1. **Play → real-world results.** If a feature doesn't cascade into something real (a merged PR, a fixed
   error, a happier customer), it's decoration. Decoration is fine only after the loop works.
2. **Spark (Meta) is the brain and game master, never a worker.** It reads the inputs, finds the bottleneck,
   plans, routes, judges, and pulls the player in with the next move. It never writes code or PRs.
3. **Your sign-ins are the machines.** The player's Claude and ChatGPT subscriptions are the power plants and
   assemblers (via the local runner). Later, local models are another resource (geothermal). More sign-ins,
   bigger factory.
4. **Autonomy is earned by playing.** Day one, Spark asks before it acts. The more you play, the more it's
   allowed to do on its own (advisor → floor → build → per-district launch permits → lights out).
5. **Verify everything (checks and balances, inspired by Lauren Tan / poteto).** CI → proof → AI review →
   human merge. Fails loop back to Spark. Every station is visible and clickable, piles show the bottleneck,
   and the game rewards adding more checks.
6. **Point at the human bottleneck.** In an agent loop the person is the slow part, so Shiptorio always
   shows what's waiting on you and makes it fast to clear: a swipeable check-in deck of 8 to 12 cards
   (phone, web, later voice). The gauntlet makes fast yeses safe, and earned trust means fewer cards.
7. **Simple, easy, addictive in a good way.** Two minutes from sign-in to your first bottleneck. Justin loves
   games; the game pull is the product. Fun is what makes people keep shipping.
8. **Plain words in the UI, no "Spark".** Players don't care what the planner model is called. Recommended options
   just get a "Suggested" tag. No named character. The only credit is one small "powered by Meta Muse Spark" line
   (onboarding/about). Internally (code, docs, contracts) Spark keeps its name.
9. **Progressive disclosure: one concept at a time, mobile first.** Shiptorio is a lot (ore, machines, power, the gauntlet, bottlenecks, autonomy), and all of it at once overwhelms. Onboarding walks a new player through it step by step, with a coach card as the guide: your factory is one codebase, then ore, a machine, power, the line, one inspection, the rocket, the bottleneck, the check-in deck. Each piece of HUD stays hidden until the coach introduces it, and each lesson is taught by doing, not by reading. New features follow the same rule: they show up when the player is ready for them. Big readable text, few boxes.

10. **The map reads like the work, bottom to top.** Raw work is mined deep underground (inbox, GitHub, Sentry,
   PostHog), rides lifts up through planning, building and the checks, and launches from the top. One continuous
   line where you can watch every item travel, in the Black Iron look (`docs/black-iron.html`), matched closely.
   If a player can't tell what a part does by looking at it, it isn't done.

11. **Simple out of the box; complexity unlocks over months of play, never up front (Justin, 2026-10-27).** Day one
    does one job very clearly: sign in, pick a repo, plug in your AI, and your first issue becomes a shipped PR,
    in the fewest steps and words possible. Two numbers on screen (waiting on you, shipped), one queue of cards,
    trust as the only progress bar. Research, mines, tools, permits and higher autonomy each show up the first time
    your own factory needs them, spread over weeks and months. Ladder: the "Unlock ladder" in the new-player
    walkthrough (https://claude.ai/artifact/NRKF9TmVW3tDMH2jUJEBV1).

## Non-goals (for now)

- Spark as a coder or hosted build farm. Building runs on the player's own subscriptions.
- Silent autonomy. Nothing big happens without the player until they've earned it.
- Auto-sending to customers. Spark drafts, the player sends.
- Breadth before the core loop works. Marketing, acquisition, retention come later.
- Stripe / real money, for now (on hold, Justin 2026-10-26).

## Where it goes

Start with code: issues, errors, PRs, the repo loop. Then grow into the rest of the business loop:
marketing, customer acquisition, customer retention. Same game, more districts.

## The game surface: the 2D pixel deck (Justin, 2026-10-29)

"I want this to be the permanent one going forward." The 2D pixel-art deck in `web/src/deck2d/` is THE game
surface, on by default everywhere (`?px=0` still shows the old painted look; the 3D shaft is parked). Claude
threads and Codex iterate on this same deck, not on copies or variants. The rules for working on it are in
[`docs/context/pixel-deck.md`](context/pixel-deck.md).

**2026-10-29: The 2D deck is the actual product, including sign-in, repo selection and coding-agent connection. Bridge the existing backend and account flows into this UI; simplify duplicate entry points rather than building another frontend. Demos remain explicit previews, not the default product.**

**2026-10-29: Meta is Shippy's brain for the whole factory: identify bottlenecks, recommend the next useful decision, and help the player keep work moving toward automation. Planning one PR is a supporting ability, not the product's organizing idea. Validate this loop with Muse Spark first; evaluate a stronger model later without moving factory decisions into the coding worker.**

## Finish line (Justin, 2026-10-29)

Polish, simplify and clean up the loop we have; no new features. Product done by **end of Monday Nov 2** (Fri full
day, Sat ~4h, Sun ~4h, Mon finish). Tue Nov 3 and Wed Nov 4 are filming the demo video only; the hackathon cutoff is
Wed Nov 4 8 PM CT. Day-by-day plan and freeze points: [docs/context/demo-plan.md](context/demo-plan.md).

## Current focus: a great player experience (Justin, 2026-10-27 10:50)

"Focus less on the judges and just focus more on making this web app a great experience." The game itself is the
priority now. The Nov 4 hackathon date still stands, but it no longer decides what we build. Every thread and Codex
follows this order:

1. **Make the core loop feel great to play.** Gameplay mechanics on phone and desktop, what you do with the UI vs
   with objects in the world (machines, carts, belts, floors), and the repair-and-unlock progression. Design:
   `docs/GAMEPLAY.md`, playbook https://claude.ai/artifact/QDvFEZePgx5bzBv7TBHZz8, A/B picks
   https://claude.ai/artifact/HTDQR39URzPniTeugbZGkR (Justin's picks get recorded in GAMEPLAY.md).
2. **Prove the loop for real.** Real clean ships on r3dbars/Testing and one real autonomy level-up. The experience
   only counts if it ships real PRs.
3. **Nail the vertical map.** Match the Black Iron mockup (https://claude.ai/artifact/QR3JBEyauy8VAEGptsPGi9),
   side-by-sides before merging.
4. **Polish and reliability over new surfaces.** Fewer, better things on screen (principle 11).
5. **Judge mode stays as it is** (live at /judge). No new hackathon-only work; Justin makes the demo video himself.
6. **Still parked:** build mode, pricing, multi-repo empire, new mines (they show up later as unlocks in the
   gameplay ladder).

**Codex points at reliability:** deploy guardrail, E2E tests, runner reliability, limits/quota visibility, security.

## Gameplay picks (Justin, 2026-10-27)

The full approved rounds 1–4 and rollout policy are in [GAMEPLAY-PICKS.md](GAMEPLAY-PICKS.md).
[GAMEPLAY.md](GAMEPLAY.md) preserves the early design context; the following is the round-1 summary:

- **Setup is play:** you start in an abandoned foundry; picking the repo, connecting your AI and picking the first
  issue are three repairs you watch happen. Locked parts are visible but broken (only the next one or two), you fix
  them by tapping them, and a repair costs one real action, never points. Trust shows as lamps up the lift tower.
- **Moving and looking:** the camera snaps to floors, opens on whatever needs you, tags show only on tap / hover,
  tapping a machine opens a small callout on it.
- **Deciding:** one card, always at the bottom. Later on the left, Continue on the right, every card swipes. Launch is
  a big red hold button on the right with sound and a real press. Autonomy level-ups come as a card.
- **Feel:** first rocket gets the full camera cut, later ones a corner flash; caught bugs show as a scar on the work;
  a soft foundry hum is on by default.
- **Refining:** gameplay is tuned through short A/B rounds on real game art that narrow in each time
  (https://claude.ai/artifact/HTDQR39URzPniTeugbZGkR). Justin's later 12:37/14:28 direction supersedes the earlier
  `play`-flag rollout: approved picks are intended for everyone without a new play flag. Existing kill switches
  and temporary `?attention=0` compatibility remain where implemented. These design records are not release receipts.

## The loop today

- **Playable loop:** real GitHub issue → Spark → fix PR (player's agent) → CI inspect / rework → human merge → rocket.
- **Signal sources (mines):** GitHub, Sentry, PostHog. Stripe is on hold.
- **Gauntlet:** CI inspector, proof/verify bay, AI review, merge gate (`docs/LOOP.md`).
- **Who it's for:** solo founders and tiny teams with real users. Hosted on shiptorio.com (password-gated for now).
- **Hackathon:** Meta, submit by noon CT Wed Nov 4. It's a date, not the goal.

## How to decide what's next

Before starting something, check it against this list. Mostly-yes means go.

- [ ] Does it make the game **better to play** (the "Current focus" list above)?
- [ ] Does it move the **current focus** loop closer to working end to end?
- [ ] Does it make **play cascade into a real result** (PR, fix, reply, customer)?
- [ ] Does it keep **Spark as the brain**, not the worker?
- [ ] Does it respect **earned autonomy** (asks first unless the player unlocked it)?
- [ ] Does it add or surface a **check**, or at least not bypass one?
- [ ] Does it **grow the loop** (more checks, more sources, more autonomy) or clear what's waiting on the human?
- [ ] Will it feel **simple and fun** in the first two minutes?
- [ ] Does it **show up when the player is ready**, not all at once?
- [ ] Is it the **current bottleneck**, not a later district (marketing, Stripe, etc.)?
- [ ] Can it ship as a **small PR today**? If not, slice it smaller.

If something needs Justin, ask with one line he can reply to (e.g. "say: merge 30").

## Goal log

New high-level goals from Justin go here, dated, then get folded into the sections above.

- 2026-10-26: Vision written from Justin's project chat, `docs/PRODUCT.md`, `docs/LOOP.md`.
- 2026-10-26: First sources are GitHub, Sentry, PostHog. Stripe on hold.
- 2026-10-26: Onboarding is a major focus, built on progressive disclosure (principle 9).
- 2026-10-26: HUD redesign: less dense, mobile first, progressive disclosure, no "Spark" in player-facing UI.
- 2026-10-26: Onboarding starts with a real "Welcome to Shiptorio" intro right after GitHub sign-in: your repo
  visualized and gamified, and the goal stated plainly (the human stops being the bottleneck; decide faster on
  what AI builds, checks and verifies, ship more, better product). Dynamic and polished, real care spent on it.
  Playable mockup: `docs/onboarding-mockup.html`.
- 2026-10-26: The point isn't a nicer UI for swiping faster. It's a system that encourages you to build more
  automation and verify it all, so the factory gets more automated over time. Intro teaches: verify, then automate.
- 2026-10-26: Humans are the bottleneck in the agentic loop. Shiptorio always points at it, and a swipe
  check-in (8 to 12 cards, right = do it, left = later, down = never + why) lets you push the whole system
  forward in two minutes. Cards favor growing automation, verifiability and inputs. Details: PRODUCT.md "Check-in".
- 2026-10-27: The map goes vertical (principle 10). Work is mined underground, cascades down, rides up through
  refining and the checks, becomes a PR and launches from the top. The visual style is critical and must make
  plain what each part does. Lives in `web/src/map/shaft/`.
- 2026-10-27: "This new artwork and vertical system needs to be the way this app works." The shaft is the map
  for everyone (game, judge mode, tour, landing loop); the island stays behind `?world=iron` for one release.
- 2026-10-27: Build mode (advanced, optional): players build and redesign the factory themselves, Factorio /
  RollerCoaster Tycoon style, on the Black Iron art. Every piece is a real pipeline part, so the layout is the
  pipeline config, and the gauntlet can be added to but never bypassed. Spec: `docs/BUILD-MODE.md`.
- 2026-10-27: Simple out of the box, complexity over months (principle 11). Justin approved the walkthrough cuts:
  no XP or levels (trust is the only progress bar), two counters (waiting on you, shipped), Next Move and the
  check-in deck become one queue, research / mines / tools hidden until needed, no first-run Check in / Build fork.
- 2026-10-27: Plan locked through Nov 4: prove the loop with real clean ships on Testing + one real autonomy
  level-up, nail the vertical map to the mockup, judge mode + 2-min video, feature freeze ~Nov 1, park build
  mode / pricing / empire / new mines. Codex on reliability prompts only. Superseded the same morning by "great player experience first" (below).
- 2026-10-26: Make independent self-hosting simple for open-source users bringing their own Meta API keys and GitHub App: one guided Cloudflare setup command, with a credential-free CI dry run.
- 2026-10-27 10:50: Focus less on the judges, more on making the web app a great experience. Player experience is
  now the main track (gameplay mechanics, world interactions, repair-and-unlock progression); judge mode is frozen
  as is. See "Current focus".
- 2026-10-27 11:17: Round 1 gameplay picks in (abandoned-foundry start, repairs by tapping the broken thing, Later
  left / Continue right on every card, big red hold-to-launch button). A/B rounds are how gameplay gets refined from
  now on. See "Gameplay picks" and `docs/GAMEPLAY.md`.
- 2026-10-27 20:06: **Build as you go.** The dimmed tour look becomes how the game starts: camera parked, nothing
  exists until you build it, and eight builds (repo tunnel, AI boiler, builder, first issue, planner, build, checks,
  launch pad) rise in 5 to 8 animated seconds each, burst online with electricity and stamp themselves done while a
  real first issue rides through. Behind `?buildout=1` until Justin has played it. Contract:
  `web/src/buildout/CONTRACT.md`; plan https://claude.ai/artifact/T6puBBYVnZiFaBiqephirN.
