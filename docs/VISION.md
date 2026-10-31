# Shiptorio vision (north star)

> **Read this first.** Every agent (Claude threads, Codex, anyone) checks this page before deciding what to
> build next. It's Justin's high-level goals, boiled down.
>
> **Living doc:** whenever Justin states a new high-level goal, fold it in here (one dated line in the Goal log,
> plus the sections it changes) and push. If this page and another doc disagree on *direction*, this page wins.
> The pre-deck version (3D map, vertical shaft, island, build mode) is archived at
> [context/archive/vision-before-deck.md](context/archive/vision-before-deck.md).
>
> Last updated: 2026-10-30.

## The goal

**Gamify your repo's ship loop, so playing the game ships real things.** Every rocket that launches is a real
merged pull request. Shipping is the point.

**Why it matters: there's always a bottleneck, and it's usually waiting on one of your calls.** AI writes the code
now. What slows shipping is a person deciding what AI should build and what it has to prove. Shiptorio puts that
one decision in front of you, makes it a swipe, and then teaches the factory to make that kind of call on its own.
**Verify, then automate.** It never ends: clear one jam and the next one shows up. That's the game.

## The story (locked 2026-10-28)

Belief before setup. A newcomer gets the story before they connect anything:

1. Your software is a factory.
2. There's always a bottleneck, and it's waiting on your call. (Never "you are the bottleneck".)
3. Swipe, and it moves.
4. Approve the same kind of thing twice more and it's automatic, so you're free for the next jam. (The climax.)

**North star test:** open it, see your one bottleneck within 5 seconds, swipe once, it clears.

## What shiptorio.dev is

- **The 2D pixel deck is the product** (`web/src/deck2d/`, `web/deck.html`). One floating deck, one line, one card.
  Sign-in, repo pick and connecting your coding agent all happen inside it. No other frontend.
  Art rules: [context/pixel-deck.md](context/pixel-deck.md).
- **The line, one name per station, everywhere:** Repo → Planner → Builder → Checks → Review → Gate → Launch.
  Source of truth `STOP_LABEL` in `web/src/deck2d/contract.ts`, guarded by `web/test/station-names.test.ts`.
  Checks runs the CI check and the proof check. How each maps to GitHub: [context/github-deck-loop.md](context/github-deck-loop.md).
- **Shippy is the only character.** Shippy the robot walks the line, parks on the jam and pulls the lever. No humans.
- **Meta Muse Spark is Shippy's brain.** It reads the factory, picks the bottleneck, says in one plain line why, plans
  the work and reviews it. It never writes code. Coding runs on the player's own machine with their own Codex or
  Muse Code subscription (the local runner). Player copy says Shippy, never "Spark", except one short tutorial beat that says
  Shippy is powered by Meta Muse Spark.
- **One trust meter.** The dots on a card: approve the same kind of card as is three times and that kind becomes
  automatic (`server/src/learn.ts`). Later or a change resets it. The Gate (merging) never learns on its own.
  Older trust systems in the code (launch permits, autonomy levels) don't show on the deck.
- **Colors mean one thing each:** yellow = waiting on you, red = actually stuck, green = automatic, cyan = running.

## The front door (Justin, 2026-10-29)

Anyone can open shiptorio.dev and play the tutorial right away: Shippy shows what this is and walks them through
a few swipes until the factory runs a step on its own. No password, no sign-in, no waitlist in the way. The
tutorial is scripted in the page, so it spends no Spark calls. **The password comes at "create your own factory,"**
right before GitHub sign-in; past it, pick a repo and connect your agent. Real repos stay locked to people with the
password. Live on shiptorio.dev; shiptorio.com keeps its landing page and gate until a promotion. How it works:
[context/landing.md](context/landing.md).

## Principles

1. **Play → real-world results.** If it doesn't end as something real (a merged PR, a fixed error), it's decoration.
2. **Spark is the brain, never a worker.** Triage, planning, routing and review stay with Spark. Codex and Muse
   Code are the hands.
3. **Autonomy is earned.** Day one, every step asks. The trust meter is the only progress bar.
4. **Verify everything.** Checks (CI + proof) → Review → Gate (your hold on Ship it). Fails loop back.
5. **One thing at a time.** One card, one bottleneck, one thing moving. Calm: only the jam pulses.
6. **Simple out of the box.** Two minutes from opening it to your first swipe. Plain, short words. Deleting beats
   adding.
7. **Mobile first.** Every screen works on a phone held in one hand.

## Non-goals (for now)

- Spark as a coder or a hosted build farm.
- Silent autonomy, automatic merging in the deck, auto-sending to customers.
- Breadth before the core loop works: shaft map, marketing, pricing, Stripe, multi-repo empire, build mode, new mines.

## Current focus (Justin, 2026-10-30)

The deck is the whole product. Simplify, polish and clean up the real issue-to-merge loop. **No new tour work,
features, screens or settings.** Justin proves one real ship by hand: approve the plan, let his own Codex or
Muse Code subscription build locally, hold **Ship it** at the Gate, and verify both the real GitHub merge and
the rocket. A tutorial, fixture or replay cannot stand in for that proof.

**Freeze Oct 31. Record Nov 1. Submit Nov 4 at noon CT.** The event cutoff is 8 PM CT; noon is our submission
plan. After the freeze, fix only blockers in the existing loop or recording. The **shaft map, build mode,
multi-repo empire and pricing are parked**. The old React map was deleted; it is not a second game surface.

Schedule and ownership: [demo plan](context/demo-plan.md). Shot list: [demo script](context/demo-script.md).

## How to decide what's next

Mostly-yes means go.

- [ ] Does it make the deck simpler, clearer, friendlier or more polished?
- [ ] Does it help the north star test (bottleneck in 5 seconds, one swipe, it clears)?
- [ ] Does it end in something real (a PR, a merge, a rocket)?
- [ ] Does it keep Spark as the brain, not the worker?
- [ ] Does it respect earned trust (asks first until the player taught it)?
- [ ] Is it deleting or cleaning up rather than adding?
- [ ] Can it ship as a small PR today?

Only ping Justin for things only he can do (a login, a key, a hold on Ship it), with one line he can act on.

## Goal log

New high-level goals from Justin go here, dated, then get folded into the sections above. Entries before
2026-10-28 describe the 3D map era; where they conflict with the sections above, the sections win.

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
  plain what each part does. Historical: the shaft implementation was deleted on Oct 29.
- 2026-10-27: "This new artwork and vertical system needs to be the way this app works." The shaft was then the map
  for everyone; both that shaft and the earlier island implementation were deleted on Oct 29.
- 2026-10-27: Build mode (advanced, optional): players build and redesign the factory themselves, Factorio /
  RollerCoaster Tycoon style, on the Black Iron art. Every piece is a real pipeline part, so the layout is the
  pipeline config, and the gauntlet can be added to but never bypassed. Spec (archived): `docs/context/archive/build-mode.md`.
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
  real first issue rides through. Behind `?buildout=1` until Justin has played it. Contract (retired with
  the React app in #722); plan https://claude.ai/artifact/T6puBBYVnZiFaBiqephirN.
- 2026-10-28: The story is locked (belief before setup, four beats). The 2D pixel deck wins the art bake-off; the
  3D deck and the shaft are parked. Web app only. Shippy is the only character.
- 2026-10-29: The 2D deck is permanent and is the whole product, including sign-in, repo pick and agent connection.
  Meta Muse Spark is Shippy's brain for the whole factory.
- 2026-10-29: No new features. Polish, simplify, clean up. Product done by end of Mon Nov 2; Tue and Wed are filming.
- 2026-10-29 20:56: **Tutorial first, password at "create your own factory".** Anyone visiting shiptorio.dev lands in
  Shippy's tutorial with no password, waitlist or landing page in front. The password pops up only when they choose to
  create their own factory, right before GitHub sign-in. Real accounts stay locked; the tutorial is scripted (no Spark
  spend). shiptorio.com follows only via a promotion. Details: `docs/context/landing.md`.
- 2026-10-29: Docs, README and code should all describe what shiptorio.dev is now and where it's headed.
- 2026-10-29: The old React app is deleted (shaft and island maps, old UI, judge replay, ~40k lines). The deck is the only
  web app: "/" and old demo links go to it on every host, and `/judge` plays the deck's story with no password.

- 2026-10-30: The deck is the product; no new tour work. Justin proves one real ship by hand. Freeze Oct 31, record Nov 1, submit Nov 4 at noon CT. Shaft map, build mode, empire and pricing stay parked.
