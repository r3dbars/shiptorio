# Shiptorio product spec: Spark runs the factory

> Status: draft v1, 2026-10-26. Owner: Justin. This sharpens `PLAN.md` and `docs/ARCHITECTURE.md`
> (it doesn't replace them). Where this doc and those disagree on **product behavior**, this doc wins.
> Stack is Cloudflare (see `AGENTS.md`). Open product calls are at the bottom, each with a recommendation.

## The promise in one line

**Connect your repo, play the game, and your product gets better for real.** Every move in Shiptorio
ends as a real PR, a real release, a real reply to a real customer. The more you play, the more you ship,
and shipping is what gets you customers and money.

Shiptorio is simple to start: sign in with GitHub, pick a repo, and in about a minute Muse Spark has built
you a starter factory and shown you the first bottleneck. There is always a bottleneck, there is always a
next move, and it never ends. That's the game. Shipping is the point.

## Who does what

Three actors. Keep them straight, everything else follows.

| Actor | Role in the game | Real thing |
| --- | --- | --- |
| **Player** (you) | Factory owner. Sets direction, approves anything that leaves the building, spends science | Founder / dev who owns the repo |
| **Spark, the Foreman** | Runs the floor. Watches every input, finds the bottleneck, moves work, places and tunes machines, proposes the next move | Muse Spark (`muse-spark-1.3`, Meta Model API) in a tool-calling loop inside the repo's Factory Durable Object |
| **Assemblers** | Workers. Take one task from Spark, write the code, push a branch | Spark itself (hosted), or Claude Code / Codex / Cursor / Grok through the local runner |

Spark is never a chat sidebar. Spark is the thing making the factory move. You see Spark as a character
on the map (the Foreman drone flying between machines) and as one voice in the floor log and the
Next Move card.

## The core loop

```
 INPUTS (ore)                 FACTORY (Spark runs it)                       OUTPUTS (rockets)            IMPACT (score)
 GitHub issues   ─┐                                                          PRs opened  ─┐
 Sentry errors   ─┼─► triage ─► build ─► inspect ─► launch pad ─► merge ─►   PRs merged  ─┼─► release ─► errors gone
 Customer email  ─┤   (Spark)  (assemblers) (tests,   (waits on you)         releases    ─┘              customers answered
 PostHog traffic ─┘                          lint,                                                       users unblocked
 Repo itself (lint/complexity)               visual)                                                     revenue (later)
```

One session, as the player sees it:

1. **Open Shiptorio.** The map shows your repo as districts. Overnight: 2 biters on `/checkout` (new Sentry
   errors), 5 new ore chunks (3 issues, 2 customer emails), 3 PRs sitting on the launch pad.
2. **Read the Next Move card.** Spark has already done the obvious stuff (triaged, merged duplicates, started
   2 fixes). The card says the one thing that is holding the factory back right now:
   *"Bottleneck: launch pad. 3 PRs waiting on your review for 9h. Merging #41 closes the checkout crash
   hitting 112 users. [Review #41] [Let Spark auto-launch docs PRs]"*
3. **Make the call.** You merge (rocket launches), or approve a build Spark wants, or spend science on research.
4. **Watch the cascade.** The merge ships a release, Sentry goes quiet, biters die, the customer who emailed
   about it gets a reply, the score moves.
5. **New bottleneck appears.** Now inspection is slow because the rework loop is eating power. Spark proposes
   a second inspector. Back to 2.

The loop is Factorio's: fix one bottleneck, the next one shows up. The difference is that every step
changes the real product.

## Inputs, outputs, and what you see

### Inputs (ore)

| Source | Ore on the map | How it gets in | Hackathon? |
| --- | --- | --- | --- |
| GitHub issues | `#` crystals at the mine | GitHub App `issues` webhook + backfill on connect | **Yes** |
| Sentry errors | Crater + biters on the district the stack trace points to | Sentry webhook (internal integration) | **Yes** |
| Customer feedback | Envelopes floating at the well | Inbound email to `feedback+<repo>@<our domain>` (Cloudflare Email Routing → Worker) | **Yes** (demo shop) |
| PostHog traffic | Road traffic per district; sets each district's risk and value | PostHog API pull, every few minutes | Stretch |
| The repo itself | Pollution haze over districts (lint errors, complexity, TODOs) | Spark scan on connect + on each push | Stretch |

### Outputs (rockets)

| Output | Map moment | Real thing |
| --- | --- | --- |
| PR opened | Item rolls onto the launch pad | PR by `shiptorio[bot]`, links back to its ore (`Closes #n`, Sentry id, email thread) |
| PR merged | Rocket launches | Human merge (or auto-launch, see trust) |
| Release | Rocket reaches orbit, district lights up | Deploy or GitHub release on the merge |
| Customer answered | Envelope flies back out of the well | Spark-drafted reply to the person who reported it |
| Error resolved | Biters die, crater fills in | Sentry issue goes quiet for N minutes after release |

### Customer context

Every ore chunk carries **who it hurts**. Spark attaches it during triage:

- users affected (Sentry user count, PostHog sessions hitting that route)
- who asked (email senders, issue reactions), and whether they're paying (later: Stripe)
- linked items (this email is the same bug as this Sentry error)

That context is what makes Spark's priorities real: a crash on `/checkout` that 112 people hit beats a
typo in the docs, and the map shows why.

## The bottleneck engine

The game always shows **one bottleneck and one next move**. That's the core UX promise.

### How Spark finds it

The factory is a pipeline of stages: `intake → triage → build → inspect → pad (review) → release → impact`.
Every tick the Factory DO computes, per stage, from real state:

- **WIP** (items waiting), **age** (oldest item's wait), **throughput** (items out per hour, rolling)
- **value at risk** = sum of item value waiting there (value comes from customer context: users affected,
  severity, paying customers, district traffic)

The bottleneck is the stage with the highest **value × wait**. That number is deterministic code, not a
model guess, so it's stable and cheap. Spark's job is the next part: explain it and pick the fix.

| Bottleneck | What it looks like on the map | Typical Spark move |
| --- | --- | --- |
| Intake | Ore piling up untriaged | Raise splitter effort, add a splitter |
| Build | Assemblers all busy, queue on the belt | Add an assembler, switch one to a solar plant with charge left |
| Inspect | Items bouncing in the rework loop | Add an inspector, give the assembler a test-writing loadout, split the item smaller |
| Pad (review) | Rockets stacking on the pad | Ask the player to review (top PR first), or offer auto-launch for low-risk districts |
| Release | Merged but not deployed | Ask to cut a release |
| Impact | Shipped, but Sentry still firing | Reopen the ore with the new stack trace, flag the PR that missed |
| Power | Machines blocked, batteries empty | Switch to steam (Spark API), lower effort on low-value items |

### The Next Move card

Always on screen, bottom center. It has: the bottleneck (one line, real numbers), why it matters (who it
hurts), and 1 to 3 buttons. One button is always Spark's recommendation. If there's genuinely nothing to
do, the card says what Spark is doing and what will need you next (never empty).

## Spark, the Foreman: the agent loop

### Where it runs

Inside the repo's **Factory Durable Object** (`server/src/factory.ts`). The DO alarm already ticks the
factory. On top of that:

- **Event wakes:** a new ore, a CI result, a PR merged, a Sentry spike, or a player action wakes Spark right away.
- **Heartbeat:** otherwise every 60 s while a player is watching, every 10 min when nobody is.
- **Budget:** each wake gets a token and tool-call budget (say 8 tool calls). Steam power (Meta API credits)
  is a visible game resource, so Spark's own thinking shows up on the power grid.

Each wake is one Spark call with tools (OpenAI-compatible `tools` on `api.meta.ai/v1`), fed a compact
**factory brief**: bottleneck table, top 10 items with customer context, machines and power, trust per district,
and the last few player decisions. Spark replies with tool calls; the DO validates each one against the
trust rules, applies it, and logs it. Long work (writing code) is never inside a Spark call; it's a job
handed to an assembler.

### Spark's tools

Grouped by how far the effect reaches. The **tier** decides who has to approve (see trust below).

**Look (tier 0, always allowed)**

| Tool | Does |
| --- | --- |
| `get_factory_brief()` | Bottleneck table, queues, machines, power, trust |
| `get_item(item_id)` | One ore/item with its source, history and customer context |
| `search_code(query, district?)` | Find files for an item (GitHub code search / tree in KV) |
| `read_file(path, ref?)` | Read a file |
| `get_sentry_issue(id)` | Stack trace, user count, first/last seen |
| `get_feedback(thread_id)` | Customer email thread |
| `get_metrics(window)` | Lead time, throughput, escaped defects, cost, users affected |

**Run the floor (tier 1, Spark does it, player can undo)**

| Tool | Does |
| --- | --- |
| `triage(item_id, kind, district, value, summary)` | Classify ore, place it on the right belt |
| `link_items(a, b, reason)` | "This email is the same bug as this Sentry error"; merges ore, sums value |
| `split_item(item_id, parts[])` | Break a big item into smaller tasks |
| `route_item(item_id, machine_id)` | Send an item to an assembler |
| `set_effort(machine_id, effort)` | Spark reasoning effort (`minimal`…`xhigh`) as the machine's module |
| `set_power(machine_id, source_id)` | Move a machine between solar / steam / geothermal |
| `place_machine(type, harness, at)` | Build within the factory's current unlocks and budget |
| `remove_machine(machine_id)` | Tear down an idle machine |
| `post_log(text)` | One line in the floor log, in Spark's voice |

**Change the repo (tier 2, opens PRs only, never touches `main`)**

| Tool | Does |
| --- | --- |
| `start_job(item_id, harness, plan)` | Hand an item to an assembler with a short plan; the job opens a PR |
| `request_rework(item_id, failure, hint)` | Send a rejected item back with what failed and what to try |
| `inspect_pr(pr, gates[])` | Run the gates (lint, types, tests, visual) and set the PR's quality tier |
| `comment_on_issue(issue, text)` | Status note on the source issue ("fix is in #41") |
| `add_turret(district, test_plan)` | Start a job that adds tests around a district |

**Leave the building (tier 3, the player approves by default)**

| Tool | Does |
| --- | --- |
| `propose_move(title, why, options[])` | Fills the Next Move card. This is how Spark asks for anything it can't do |
| `request_merge(pr)` | Asks the player to launch a rocket (or auto-launches if the district has the permit) |
| `cut_release(prs[])` | Release / deploy after merges |
| `draft_customer_reply(thread_id, pr)` | Drafts the "we fixed it" email; sent on approval |
| `close_ore(item_id, reason)` | Close an issue as won't-fix / duplicate |

Every tool call becomes a `log` line and an entry in the item's history, so the player can always ask
"why did Spark do that" and see the reasoning Spark gave in the call.

### What the player decides vs what Spark decides

| Decision | Player | Spark |
| --- | --- | --- |
| Which repo, which inputs to connect | ✓ | |
| Goal for the week ("ship checkout fixes", "grow signups") | ✓ sets it | uses it to weight value |
| Triage, duplicates, linking email ↔ Sentry | can override | ✓ |
| Which machine gets which item, effort, power | can override | ✓ |
| Placing / removing machines (within budget) | can do it by hand | ✓ |
| Spending science on research | ✓ | recommends |
| Opening PRs | | ✓ (through assemblers) |
| Merging PRs (rocket launch) | ✓ | only with an earned launch permit |
| Releasing | ✓ | only with an earned permit |
| Emailing a customer | ✓ approves the draft | drafts it |
| Closing issues as won't-fix | ✓ | proposes |
| Spending real money beyond the set budget | ✓ | never |

Rule of thumb: **inside the factory, Spark acts and you can undo. Anything that leaves the factory
(merge, release, customer email, money) needs you, until you've earned the trust to hand it off.**

## Trust and approvals

- **Tier 0–1:** Spark just does it. Every action shows on the map and in the log with an undo for 5 minutes.
- **Tier 2:** Spark does it, but only ever as a PR on a `shiptorio/*` branch. Never `main`, never `.github/`,
  never secrets (`SAFE_PATH` in `engine.ts`).
- **Tier 3:** goes to the Next Move card for the player. Exception: a **launch permit**.

**Trust meter, per district.** Starts at 0. A clean launch (merged, released, no new Sentry errors from that
PR within 24 h) adds trust; an escaped defect (new errors traced to the PR, or a revert) costs a lot more
than a launch earns. Districts have a **risk** rating from Spark (traffic, blast radius; `/checkout` high,
`docs/` low).

**Launch permits** are earned per district when trust passes a threshold that scales with risk, and each
permit also needs a minimum quality tier (docs at normal, checkout at rare or better). With a permit,
Spark may merge (and release) PRs in that district on its own. The player can revoke any permit with
one click, and a single escaped defect revokes it automatically. This is "you earn the right to automate".

**Hard limits that no trust level lifts:** no pushes to `main`, no force pushes, no workflow or secret
changes, spend capped by the player's budget, customer emails always need approval in v1.

## Score: game numbers that are real numbers

Every number on the HUD is a real metric with a game skin. No fake points.

| HUD | Real metric | Source |
| --- | --- | --- |
| **Rockets** | PRs merged (by kind: red bug, green feature, grey cleanup, blue tests) = science packs | GitHub |
| **Lead time** | Ore arrives → PR merged, median, this week | Factory DO history |
| **Biters killed** | Sentry issues resolved after a Shiptorio release | Sentry |
| **Escaped defects** | Launched PRs that caused new errors or a revert | Sentry + GitHub |
| **Customers answered** | Feedback threads closed with a shipped fix | Inbox |
| **Users unblocked** | Sum of users affected by resolved ore | Sentry / PostHog |
| **Cost per rocket** | Steam credits + solar usage per merged PR | Power grid |
| **Revenue** (later) | MRR / conversions in districts Shiptorio touched | Stripe / PostHog |

The headline number is **Ship Score** for the week: `users unblocked + 10 × customers answered + rockets`,
minus `25 × escaped defects`. It's simple, it only goes up by shipping good work, and it goes down hard when
you ship bad work. (Tune the weights later; the shape is what matters.)

Achievements tie to real milestones: **Zero-day** (Sentry error to merged fix in under 10 min), **Lights out**
(8 h unattended with no escaped defects), **Green belt** (20 PRs with no rework), **First customer saved**
(a customer email answered with a shipped fix).

## How a decision cascades to the real world

The demo story, step by step. Every row is a real effect.

| You see | Spark does (tool calls) | Real world |
| --- | --- | --- |
| Biters swarm `/checkout` | `get_sentry_issue`, `triage(bug, checkout, value=112 users)` | Sentry error on the demo shop |
| An envelope at the well glows | `get_feedback`, `link_items(email, sentry, "same stack")` | Customer emailed "checkout broke" |
| Next Move: "Checkout crash, 112 users, fix it at high effort?" [Go] | `propose_move` | |
| You click **Go** | `set_effort(asm1, high)`, `start_job(item, spark, plan)` | Spark assembler writes the fix |
| Item enters the inspector, gets stamped red | `inspect_pr(#41, [lint, types, tests])` → fail, `request_rework` | CI fails on the PR |
| Second pass, stamped green, rocket on the pad | `inspect_pr` → rare tier, `request_merge(#41)` | PR #41 green |
| You merge, rocket launches | `cut_release([#41])`, `comment_on_issue` | Merged, deployed |
| Biters die, crater fills | metrics tick: biters killed +1, users unblocked +112 | Sentry quiet |
| Next Move: "Send this reply to Dana?" [Send] | `draft_customer_reply(thread, #41)` | Customer gets "fixed, thanks for telling us" |
| Score: Zero-day unlocked | | Real lead time: 8 min |

## Onboarding (first 2 minutes)

1. **Sign in with GitHub** (GitHub App). One click.
2. **Pick a repo.** Install the app on it if needed.
3. **Spark scans it** (15–60 s, shown as the island rising out of the void): repo tree → districts, open issues
   → ore, CI config → which inspectors exist, a quick risk pass per district. Spark writes a one-line read of
   the repo in the log ("Next.js shop, checkout and cart carry most of the risk, 14 open issues, no tests
   around checkout").
4. **Starter factory.** Spark places splitter → assembler (Spark on steam) → inspector → launch pad, with belts,
   and starts on the highest-value issue. First item is moving before the player does anything.
5. **Connect more ore** (optional, from the map, not a form): Sentry (paste DSN org + token or install the
   integration), feedback address (we give you `feedback+repo@…`, forward your support inbox to it),
   PostHog key.
6. **Add your own agents** (optional): `bunx shiptorio-runner pair ABCD-1234` adds solar plants for the
   player's Claude / Codex subscriptions.
7. **Set a goal** (one line, can skip): "fix checkout", "ship the onboarding redesign". Spark uses it to weight value.
8. **First Next Move card** appears. Usually the first PR is on the pad inside 5 minutes.

## Scope: hackathon (by noon CT Wed Nov 4) vs later

| Area | In the demo | Later |
| --- | --- | --- |
| Inputs | GitHub issues, Sentry, feedback email (demo shop) | PostHog traffic, lint/complexity pollution, Linear, Slack, Intercom |
| Spark loop | Event wakes + heartbeat, tools from all four tiers, factory brief, budget | Long-horizon planning, weekly goals that steer research |
| Bottleneck engine | Stage table, value × wait, Next Move card | Per-district bottlenecks, forecasting ("pad will jam by 3 PM") |
| Assemblers | Spark (hosted), one subscription CLI via runner | Cursor, Grok, local Glimmer (geothermal) |
| Trust | Tiers, trust meter, one launch permit shown (docs auto-launch) | Permits on every district, automatic revocation tuned on real data |
| Outputs | PR, merge, release on the demo shop, customer reply draft + send | Real deploy integrations (Cloudflare, Vercel), changelog |
| Score | Rockets, lead time, biters killed, customers answered, users unblocked, Ship Score | Revenue from Stripe, cohort impact |
| Onboarding | Steps 1–4, 5 for Sentry + email | Self-serve Sentry install, any inbox |

**Demo must-haves, in priority order:** (1) the Next Move card driven by the real bottleneck,
(2) the heal cascade table above, live, (3) Spark's tool calls visible in the floor log, (4) the score moving
on real numbers, (5) a launch permit earned on camera (docs PR auto-launches).

## What each lane builds from this

**Contract (`shared/`, its own PR):** add `Stage` and `Bottleneck` (stage, wip, age, throughput, valueAtRisk),
`Move` (id, title, why, options[], recommended), `CustomerContext` on `Item` (usersAffected, reporters[],
linked[]), `Trust` per district (score, risk, permit), `Metrics` on `FactoryState`. Protocol: server → web `move`,
`move_resolved`; web → server `choose_move {moveId, option}`, `undo {actionId}`, `revoke_permit {district}`,
`set_goal {text}`. Every Spark action carries `actor: "spark" | "player"` and a `reason`.

**Backend (Codex, `server/`):** `server/src/foreman.ts` (the Spark tool loop: brief builder, tool schemas,
validation against tiers, budget), `server/src/bottleneck.ts` (pure stage math, unit-tested), Sentry + inbound
email ingest, metrics rollup in D1, permits in `engine.ts`.

**UI (Claude + Justin, `web/`):** Next Move card, Foreman drone on the map that flies to whatever Spark is
touching, floor log with Spark's lines and an undo, HUD with the score row, district trust/permit badges,
onboarding scan animation. The sim (`web/src/sim/`) gets a `heal` scenario that plays the cascade table exactly.

## Open product calls

These need Justin. Each has the recommendation we're building toward until told otherwise.

1. **How autonomous is Spark by default?** Recommend: Spark acts on everything inside the factory (tiers 0–2)
   without asking, and asks for anything that leaves it (tier 3). Alternative: Spark only proposes, the player
   clicks every move (more "game", slower, weaker "Spark runs the floor" story).
2. **Where does "money" come from in the demo?** Recommend: the demo shop runs Stripe test mode, and a
   "checkout completed" counter on the HUD goes back up after the fix ships. Real Stripe connector is later.
3. **Customer replies:** Recommend Spark drafts, the player clicks Send (always, in v1). Alternative: auto-send
   once the district has a permit.
4. **Who is it for in the pitch?** Recommend: solo founders and tiny teams with real users (the "your product
   gets better while you play" promise lands hardest there).
