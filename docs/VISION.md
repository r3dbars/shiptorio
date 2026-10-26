# Shiptorio vision (north star)

> **Read this first.** Every agent (Claude threads, Codex, anyone) checks this page before deciding what to
> build next. It's Justin's high-level goals, boiled down. Details live in `docs/PRODUCT.md` (product
> behavior) and `docs/LOOP.md` (the loop and the verification gauntlet).
>
> **Living doc:** whenever Justin states a new high-level goal in the project, fold it in here (one line,
> dated) and push. If this page and another doc disagree on *direction*, this page wins.
>
> Last updated: 2026-10-26.

## The goal

**Gamify your repo's ship loop, so playing the game ships real things.** Connect your repo, play, and your
product gets better for real: more shipped, more customers, more money. Every move in the game ends as a real
PR, a real release, a real reply. Shipping is the point.

**Why it matters: the human is the bottleneck.** AI now writes the code. What slows shipping is a person
deciding what AI should build, what it checks, and what it has to prove. Shiptorio makes those decisions
visible and fast. The faster you can decide, the more you ship, and the better the user experience and the
product get. That's the goal of Shiptorio, and it's the first thing a new player learns (the welcome intro).

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

## Non-goals (for now)

- Spark as a coder or hosted build farm. Building runs on the player's own subscriptions.
- Silent autonomy. Nothing big happens without the player until they've earned it.
- Auto-sending to customers. Spark drafts, the player sends.
- Breadth before the core loop works. Marketing, acquisition, retention come later.
- Stripe / real money, for now (on hold, Justin 2026-10-26).

## Where it goes

Start with code: issues, errors, PRs, the repo loop. Then grow into the rest of the business loop:
marketing, customer acquisition, customer retention. Same game, more districts.

## Current focus (Meta hackathon, submit by noon CT Wed Nov 4)

- **First playable loop:** real GitHub issue → Spark → fix PR (player's agent) → CI inspect / rework →
  human merge → rocket.
- **First signal sources (mines):** GitHub, Sentry, PostHog. Stripe is on hold.
- **Gauntlet for Nov 4:** CI inspector, proof/verify bay, AI review, merge gate (`docs/LOOP.md`).
- **Pitch:** solo founders and tiny teams with real users.
- **Lanes:** Claude + Justin on `web/`; Codex on `server/`, `runner/`, Cloudflare. Hosted on shiptorio.com
  (password-gated for now).

## How to decide what's next

Before starting something, check it against this list. Mostly-yes means go.

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
- 2026-10-26: Humans are the bottleneck in the agentic loop. Shiptorio always points at it, and a swipe
  check-in (8 to 12 cards, right = do it, left = later, down = never + why) lets you push the whole system
  forward in two minutes. Cards favor growing automation, verifiability and inputs. Details: PRODUCT.md "Check-in".
