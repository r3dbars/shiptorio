# Shiptorio product spec: Spark runs the factory

> Status: draft v2, 2026-10-26 (v2: Spark is the brain, never the coder; your subscriptions do the building; autonomy is earned). Owner: Justin. This sharpens `PLAN.md` and `docs/ARCHITECTURE.md`
> (it doesn't replace them). Where this doc and those disagree on **product behavior**, this doc wins.
> Stack is Cloudflare (see `AGENTS.md`). Open product calls are at the bottom, each with a recommendation.
> The simple model of the loop and the **verification gauntlet** is `docs/LOOP.md` (one-pager: `docs/loop.html`).

## The promise in one line

**Connect your repo, play the game, and your product gets better for real.** Every move in Shiptorio
ends as a real PR, a real release, a real reply to a real customer. The more you play, the more you ship,
and shipping is what gets you customers and money.

Shiptorio is simple to start: sign in with GitHub, pick a repo, and in about a minute Muse Spark has read
it, laid out a starter factory and shown you the first bottleneck. Then you plug in your own agents (sign in
with Claude, sign in with ChatGPT) and each one becomes a power plant and machines on the map. There is
always a bottleneck, there is always a next move, and it never ends. That's the game. Shipping is the point.

**Three ideas hold the whole product up (Justin, 2026-10-26):**

1. **Spark is the brain and the game master, not a coder.** It reads every input, finds the bottleneck,
   plans the work, routes it, judges the results, and pulls you into the loop with the next move. It never
   writes the code itself.
2. **Your subscriptions are the raw resources.** Code is written by the agents you already pay for
   (Claude Code, Codex, later Cursor, Grok, local models) through the local runner. Every sign-in unlocks
   more machines and power. More resources, bigger factory.
3. **Autonomy is earned by playing.** On day one Spark asks before it does anything. The more you play
   (approve, merge, ship clean), the more Spark is allowed to do on its own. The game gets more automatic
   the longer you play it, the way a Factorio base does.

## Who does what

Three actors. Keep them straight, everything else follows.

| Actor | Role in the game | Real thing |
| --- | --- | --- |
| **Player** (you) | Factory owner. Approves Spark's moves, plugs in resources, merges, spends science | Founder / dev who owns the repo |
| **Spark, the Foreman** | The brain and game master. Watches every input, finds the bottleneck, plans and routes work, judges results, asks you for the next move. Never writes code | Muse Spark (`muse-spark-1.3`, Meta Model API) in a tool-calling loop inside the repo's Factory Durable Object |
| **Assemblers** | Workers. Take one task and Spark's plan, write the code, push a branch | The player's own agents through the local runner: Claude Code (Claude sign-in), Codex (ChatGPT sign-in), later Cursor, Grok, local models |

Spark is never a chat sidebar. Spark is the thing making the factory move. You see Spark as a character
on the map (the Foreman drone flying between machines) and as one voice in the floor log and the
Next Move card.

### Resources: sign in to unlock

| Sign-in | Unlocks on the map | Real thing |
| --- | --- | --- |
| GitHub (required) | The island (your repo as districts), the ore mine, the launch pad | GitHub App install |
| Claude | Solar plant + battery, Claude Code assemblers | `claude -p` in the local runner on your login |
| ChatGPT | Solar plant + battery, Codex assemblers | `codex exec` in the local runner on your login |
| Sentry, feedback inbox, PostHog | New ore patches (crater, well, roads) | Webhooks / API keys |
| Later: Cursor, Grok | More solar plants and assemblers | Their CLIs in the local runner |
| Later: **local AI inference** | Geothermal plant: free, always on, capped throughput, best on smaller items | A model on your own hardware (Mac with MLX / Glimmer, a GPU box with llama.cpp or Ollama) exposed to the runner as an OpenAI-compatible endpoint |

The Spark steam plant (Meta API, paid by Shiptorio) powers only the brain: triage, planning, routing,
judging. It doesn't run assemblers. With no subscription plugged in, the factory can read, plan and show
you the bottleneck, but nothing gets built, and the Next Move card says exactly that: *"Plug in Claude or
ChatGPT to start building."* That's the first hook.

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
2. **Read the Next Move card.** Spark has already read and triaged everything (looking is free), and
   lined up its moves. Early on it asks for each one; once you've earned it, it has already done the
   routine ones. The card says the one thing that is holding the factory back right now:
   *"Bottleneck: launch pad. 3 PRs waiting on your review for 9h. Merging #41 closes the checkout crash
   hitting 112 users. [Review #41] [Let Spark auto-launch docs PRs]"*
3. **Make the call.** You merge (rocket launches), or approve a build Spark wants, or spend science on research.
4. **Watch the cascade.** The merge ships a release, Sentry goes quiet, biters die, the customer who emailed
   about it gets a reply, the score moves.
5. **New bottleneck appears.** Now inspection is slow because the rework loop is eating power. Spark proposes
   a second inspector. Back to 2.

The loop is Factorio's: fix one bottleneck, the next one shows up. The difference is that every step
changes the real product.

### The verification gauntlet (Justin, 2026-10-26)

"Inspect" is not one machine, it's a **gauntlet** of visible stations between the assemblers and the rocket:
**CI inspector → verify bay → AI review → merge gate**, then **orbit watch** after the merge. Agent output is
untrusted until it shows evidence (Lauren Tan's idea): the verify bay reproduces the bug on the real app before
and proves it's gone after; the AI review is a different model than the builder. Every failure rides the
**rework belt back to Spark** with a **scar tag** (station, reason, evidence); third strike goes to the player.
Repeated scars make Spark offer to **promote the check up a layer** (a recurring review comment becomes a lint
rule). Players **add stations through research**, and a district's risk sets which stations its launch permit
needs. **Every station is clickable**: a panel with what it does, its pile, pass rate, catches, last log line,
and 1–3 actions (one is Spark's pick). Full detail: `docs/LOOP.md`.

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

The factory is a pipeline of stages: `intake → triage → build → ci → verify → review → merge → release → impact`
(the inspect step is the gauntlet; each station is its own stage, so a pile at the verify bay shows as its own bottleneck).
Every tick the Factory DO computes, per stage, from real state:

- **WIP** (items waiting), **age** (oldest item's wait), **throughput** (items out per hour, rolling)
- **value at risk** = sum of item value waiting there (value comes from customer context: users affected,
  severity, paying customers, district traffic)

The bottleneck is the stage with the highest **value × wait**. That number is deterministic code, not a
model guess, so it's stable and cheap. Spark's job is the next part: explain it and pick the fix.

| Bottleneck | What it looks like on the map | Typical Spark move |
| --- | --- | --- |
| Intake | Ore piling up untriaged | Raise splitter effort, add a splitter |
| Build | Assemblers all busy, queue on the belt | Add an assembler, move one to a solar plant with charge left, or ask you to plug in another subscription |
| No resources | Belt full, no machines can run | "Sign in with Claude / ChatGPT to build" |
| Inspect | Items bouncing in the rework loop | Add an inspector, give the assembler a test-writing loadout, split the item smaller |
| Verify | PRs waiting for or failing reproduction | Add a second verify bay, teach a verify recipe for the district, let low-risk districts skip verify |
| Review | AI review backed up or rejecting | Move review to the plant with power left, add a reviewer, promote the recurring comment to a lint rule |
| Pad (review) | Rockets stacking on the pad | Ask the player to review (top PR first), or offer auto-launch for low-risk districts |
| Release | Merged but not deployed | Ask to cut a release |
| Impact | Shipped, but Sentry still firing | Reopen the ore with the new stack trace, flag the PR that missed |
| Power | Machines blocked, batteries empty | Move work to the plant with charge left, hold low-value items until the battery recharges, or ask for another sign-in |

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
**factory brief**: bottleneck table, top 10 items with customer context, machines and power, autonomy level
per district, and the last few player decisions. Spark replies with tool calls; the DO checks each one
against the player's autonomy level. Allowed → applied and logged. Not yet allowed → turned into a move on
the Next Move card, and applied when the player says yes. Spark never writes code: building is always a job
handed to one of the player's assemblers through the runner, with Spark's plan attached.

### Spark's tools

Grouped by how far the effect reaches. The **tier** sets how much autonomy the player has to have unlocked
before Spark may call it without asking (see "Autonomy is earned" below). On day one only tier 0 runs on its
own; everything else comes to you as a move.

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

**Run the floor (tier 1, asks first until you unlock Floor autonomy)**

| Tool | Does |
| --- | --- |
| `triage(item_id, kind, district, value, summary)` | Classify ore, place it on the right belt |
| `link_items(a, b, reason)` | "This email is the same bug as this Sentry error"; merges ore, sums value |
| `split_item(item_id, parts[])` | Break a big item into smaller tasks |
| `route_item(item_id, machine_id)` | Send an item to an assembler |
| `set_loadout(machine_id, loadout)` | The machine's module: which agent, model and effort, plus a prompt/tool loadout (e.g. "write tests first") |
| `set_power(machine_id, source_id)` | Move a machine between the player's plants (Claude solar, Codex solar, geothermal) |
| `place_machine(type, harness, at)` | Build within the factory's current unlocks and budget |
| `remove_machine(machine_id)` | Tear down an idle machine |
| `post_log(text)` | One line in the floor log, in Spark's voice |

**Start building (tier 2, asks first until you unlock Build autonomy; PRs only, never `main`)**

| Tool | Does |
| --- | --- |
| `start_job(item_id, machine_id, plan)` | Hand an item and Spark's plan (files, approach, done-when) to one of the player's assemblers; the job opens a PR |
| `request_rework(item_id, failure, hint)` | Read the failed CI / review, tell the assembler what broke and what to try |
| `inspect_pr(pr, gates[])` | Run the gates (lint, types, tests, visual), Spark reads the diff and results, sets the quality tier |
| `run_verify(pr, recipe)` | Verify bay: a job on the player's machine reproduces the bug before and checks it's gone after, on the running app; attaches the evidence to the PR |
| `request_review(pr, machine_id)` | AI review: a different model than the builder reviews the diff; Spark reads the verdict |
| `promote_check(scar, layer)` | Turn a repeated scar into a stronger check (lint rule, test turret, verify recipe); starts a job, lands as a PR |
| `comment_on_issue(issue, text)` | Status note on the source issue ("fix is in #41") |
| `add_turret(district, test_plan)` | Start a job that adds tests around a district |

**Leave the building (tier 3, the player approves; only a district launch permit lifts it)**

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
| Which repo, which inputs to connect, which subscriptions to plug in | ✓ | asks for more when you're short |
| Goal for the week ("ship checkout fixes", "grow signups") | ✓ sets it | uses it to weight value |
| Reading, triage, linking email ↔ Sentry, finding the bottleneck | can override | ✓ always (it's just looking) |
| Which machine gets which item, loadout, power | ✓ approves at first | ✓ once Floor is unlocked |
| Placing / removing machines | ✓ approves at first | ✓ once Floor is unlocked |
| Starting a build (an agent writes code, opens a PR) | ✓ approves at first | ✓ once Build is unlocked |
| Writing the code | | never. Your agents do |
| Spending science on research | ✓ | recommends |
| Merging PRs (rocket launch) | ✓ | only with an earned district launch permit |
| Releasing | ✓ | only with an earned permit |
| Emailing a customer | ✓ approves the draft | drafts it |
| Closing issues as won't-fix | ✓ | proposes |
| Spending real money beyond the set budget | ✓ | never |

Rule of thumb: **Spark always thinks for free, and asks before it acts. Each thing you approve over and
over, cleanly, is something you can hand to Spark next.**

## Autonomy is earned

Shiptorio starts manual and gets more automatic the more you play. Autonomy unlocks like research, and the
game tells you when one is ready: *"You've approved 10 of Spark's routing moves without a change. Let Spark
route on its own?"*

| Level | Unlocks when | Spark may then, without asking |
| --- | --- | --- |
| **0. Advisor** (start) | Connect a repo | Look, triage, link, find the bottleneck, write moves |
| **1. Floor** | ~10 floor moves approved as-is | Route items, set loadouts, move power, place/remove machines (5-min undo on each) |
| **2. Build** | ~5 PRs merged from Spark's plans with no escaped defect | Start jobs on your agents and run the rework loop (still PRs only) |
| **3. Launch permit** (per district) | District trust above its risk threshold, PR at its minimum quality tier | Merge (and release) in that district |
| **4. Lights out** | Permits on most districts, a week clean | Run unattended within the budget; you get a morning summary |

Thresholds are tuning, not fixed. A level can always be turned back down with one click, and an escaped
defect drops it automatically (Build falls back to Advisor in that district, the permit is revoked).

Always true, whatever the level:

- Tier 2 work only ever lands as a PR on a `shiptorio/*` branch. Never `main`, never `.github/`,
  never secrets (`SAFE_PATH` in `engine.ts`).
- Tier 3 goes to the Next Move card unless the district holds a **launch permit**.

**Trust meter, per district.** Starts at 0. A clean launch (merged, released, no new Sentry errors from that
PR within 24 h) adds trust; an escaped defect (new errors traced to the PR, or a revert) costs a lot more
than a launch earns. Districts have a **risk** rating from Spark (traffic, blast radius; `/checkout` high,
`docs/` low).

**Launch permits** are earned per district when trust passes a threshold that scales with risk, and each
permit also needs a minimum quality tier (docs at normal, checkout at rare or better). With a permit,
Spark may merge (and release) PRs in that district on its own. The player can revoke any permit with
one click, and a single escaped defect revokes it automatically. This is "you earn the right to automate".

**Permits need the gauntlet.** A district's risk sets which stations a launch permit requires (`/checkout`:
CI, verify, review, canary, you; `docs/`: CI, review). Removing a station from a district is allowed but caps its
autonomy below a permit.

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
| **Autonomy** | Your level and permits; how much ran without you this week | Factory DO history |
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
| Next Move: "Checkout crash, 112 users. Send it to your Claude Code assembler with this plan?" [Go] | `propose_move` (plan: files, approach, done-when) | |
| You click **Go** | `start_job(item, claude_code_1, plan)` | Claude Code, on your subscription, writes the fix on your machine |
| Item enters the inspector, gets stamped red | `inspect_pr(#41, [lint, types, tests])` → fail, `request_rework` with what broke | CI fails on the PR; Spark tells Claude Code why |
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
4. **Starter factory, as a proposal.** Spark shows a ghosted layout (splitter → assembler → inspector →
   launch pad, with belts) and the issue it would start on. First Next Move: *"Build this?"* You click yes,
   it snaps into place. That's your first approved move.
5. **Plug in power.** The assembler sits dark until it has power: *"Sign in with Claude or ChatGPT to start
   building."* Under the hood: `bunx shiptorio-runner pair ABCD-1234` on your machine; the runner finds your
   logged-in `claude` / `codex` and each becomes a solar plant + battery on the map. This is the step the
   whole game pushes you toward, and each extra sign-in is more machines.
6. **First build.** Spark asks to send the top issue to your new assembler with its plan. Yes → the arm
   starts welding. Usually the first PR is on the pad inside 5 minutes.
7. **Connect more ore** (from the map, not a form, whenever Spark suggests it): Sentry, the feedback address
   (we give you `feedback+repo@…`, forward your support inbox to it), PostHog.
8. **Set a goal** (one line, can skip): "fix checkout", "ship the onboarding redesign". Spark uses it to weight value.

## Scope: hackathon (by noon CT Wed Nov 4) vs later

| Area | In the demo | Later |
| --- | --- | --- |
| Inputs | GitHub issues, Sentry, feedback email (demo shop) | PostHog traffic, lint/complexity pollution, Linear, Slack, Intercom |
| Spark loop | Event wakes + heartbeat, tools from all four tiers, factory brief, budget, ask-or-act check | Long-horizon planning, weekly goals that steer research |
| Bottleneck engine | Stage table, value × wait, Next Move card | Per-district bottlenecks, forecasting ("pad will jam by 3 PM") |
| Assemblers | Claude Code + Codex through the local runner on the player's subscriptions | Cursor, Grok, local Glimmer (geothermal), hosted runner for teams |
| Gauntlet | CI inspector, verify bay, AI review, merge gate live; rework belt back to Spark; click-to-act panels; research tree shown with one unlock on camera | Orbit watch (if Sentry lands, it moves into the demo), canary, security, perf, arena |
| Autonomy | Advisor → Floor → Build shown, one launch permit earned on camera (docs auto-launch) | Lights out, permits on every district, thresholds tuned on real data |
| Outputs | PR, merge, release on the demo shop, customer reply draft + send | Real deploy integrations (Cloudflare, Vercel), changelog |
| Score | Rockets, lead time, biters killed, customers answered, users unblocked, Ship Score | Revenue from Stripe, cohort impact |
| Onboarding | Steps 1–4, 5 for Sentry + email | Self-serve Sentry install, any inbox |

**Demo must-haves, in priority order:** (1) the Next Move card driven by the real bottleneck,
(2) the heal cascade table above, live, (3) Spark's tool calls visible in the floor log, (4) plugging in a
subscription lights up new machines, (5) the score moving on real numbers, (6) an autonomy unlock on camera
(Spark earns Floor, then a docs PR auto-launches on a permit).

**First proof (build this before anything else):** one real GitHub issue → Spark triages and plans → you
approve → your Claude Code or Codex assembler (local runner) opens a fix PR → CI inspects, rejects, Spark
reads the failure and sends it back → green → human merge → rocket. One useful, verified change shipped.

**Heads up for the backend lane:** today's `server/` has a hosted Spark assembler that writes code
(`engine.ts` / `spark.ts`). That goes against this spec. Keep it only as a dev fallback behind a flag
(handy for testing without a runner); the product path is runner assemblers, and the local runner moves up
to the top of the backend list. Sentry, email, other agents and voice layer on after that loop is real. (Matches
the backend lane's plan.) Revenue and customer counts are the long-term goal; in the demo they're the
demo shop's numbers.

## Demo narrative, lined up with judging

Judging: impact 30%, use of Meta's tools 25%, demo 25%, technical depth 20%. The 3-minute video should
make each one obvious without a voiceover explaining it.

| Time | Beat | Hits |
| --- | --- | --- |
| 0:00 | "Every team has more feedback than hands. Shiptorio turns your repo into a factory that Meta's Muse Spark runs, and you just play." | Impact |
| 0:15 | Sign in, pick the demo shop repo. Spark scans it, the island rises, Spark proposes a starter factory, you click Build | Meta tools, demo |
| 0:30 | Assembler sits dark. "Sign in with Claude." Solar plant drops in, battery fills, machine lights up. "Your subscriptions are the power. Spark is the brain." | Demo, technical depth |
| 0:40 | Break checkout on camera. Sentry fires, biters swarm `/checkout`, a customer email lands and Spark links it to the same error. Floor log shows the tool calls (`get_sentry_issue`, `link_items`, `triage`) | Meta tools, technical depth |
| 1:05 | Next Move card: "Checkout crash, 112 users. Send to Claude Code with this plan?" Click Go. The arm starts welding | Demo, Meta tools |
| 1:25 | Inspector stamps red (CI fails), Spark reads the failure and tells the assembler what broke, second pass green, real PR #N on GitHub | Technical depth, Meta tools |
| 1:50 | Bottleneck moves to the pad. Merge. Rocket launches, release ships, biters die, Sentry goes quiet. Spark drafts the customer reply, click Send | Impact, demo |
| 2:15 | Scale: queue backs up, Spark asks for more power, sign in with ChatGPT, Codex machines appear. Then "Spark has earned Floor autonomy" and it starts routing on its own; docs district earns a launch permit and a docs PR auto-launches. "The more you play, the more it runs itself." | Technical depth, Meta tools |
| 2:35 | HUD: real lead time (minutes), users unblocked, customers answered, PRs Shiptorio shipped to its own repo this week | Impact |
| 2:50 | "There's always a bottleneck. The factory must grow. Shiptorio." | |

Backup: if the live fix fails on camera, the sim's `heal` scenario replays the same beats on the real UI.

## Where it lives

`shiptorio.com` (password-gated for now, so only Justin gets in) and `shiptorio.dev`, both on the
`shiptorio` Worker. The backend lane owns the gate and deploys.

## What each lane builds from this

**Contract (`shared/`, its own PR):** add `Stage` and `Bottleneck` (stage, wip, age, throughput, valueAtRisk),
`Move` (id, title, why, options[], recommended, actions[]), `CustomerContext` on `Item` (usersAffected,
reporters[], linked[]), `Autonomy` (level, per-district trust, risk, permit, progress to next unlock),
`Metrics` on `FactoryState`. Protocol: server → web `move`, `move_resolved`, `autonomy_unlocked`;
web → server `choose_move {moveId, option}`, `undo {actionId}`, `set_autonomy {level, district?}`,
`set_goal {text}`. Gauntlet (see `docs/LOOP.md`): `Station` (id, kind `ci|verify|review|merge|orbit|custom`,
district rules, wip, oldestWait, passRate, caughtThisWeek, lastLog, actions[]), `ScarTag` on `Item` (station,
reason, evidence url, strike), web → server `station_action {stationId, action}`. Every action carries `actor: "spark" | "player"`, `approvedBy: "player" | "autonomy"`
and Spark's `reason`.

**Backend (Codex, `server/` + `runner/`):** the local runner (pairing, finds `claude` / `codex`, reports
them as power sources, runs jobs in worktrees) moves to the top, since nothing builds without it.
`server/src/foreman.ts` (Spark tool loop: brief builder, tool schemas, the ask-or-act check against the
autonomy level, budget), `server/src/bottleneck.ts` (pure stage math, unit-tested), autonomy counters and
unlocks, Sentry + inbound email ingest, metrics rollup in D1.

**UI (Claude + Justin, `web/`):** Next Move card (approve / change / skip), "sign in to unlock" power slots,
Foreman drone on the map that flies to whatever Spark is touching, floor log with Spark's lines and an undo,
HUD with the score row and autonomy level, the gauntlet stations (CI inspector, verify bay, AI review, merge
gate, orbit watch) with piles and a red rework belt back to Spark, a click-to-act station panel (see
`docs/loop.html` for the layout), unlock moment animation, onboarding scan animation. The sim (`web/src/sim/`) gets a `heal` scenario that plays the cascade table exactly.

## Product calls (all decided)

1. **Autonomy (Justin):** Spark asks first, never writes code, autonomy is earned by playing, and code runs
   on the player's own subscriptions. See the top of this doc.
2. **Demo "money" (Justin OK'd the pick):** the demo shop runs Stripe test mode. A "checkout completed"
   counter on the HUD drops when checkout breaks and climbs back after the fix ships. No real payments; a
   real Stripe connector is later.
3. **Customer replies (Justin OK'd the pick):** Spark drafts, the player clicks Send, always in v1. No
   autonomy level auto-sends customer email yet.
4. **Pitch audience (Justin OK'd the pick):** solo founders and tiny teams with real users. The promise:
   your product gets better, and earns more, while you play.
5. **Verification gauntlet (Justin, 2026-10-26):** `docs/LOOP.md` is locked. Nov 4 ships CI inspector, verify
   bay, AI review and merge gate; fails go back to Spark with a scar tag; AI review is a different model family
   than the builder; stations can be removed per district at a trust cost.
