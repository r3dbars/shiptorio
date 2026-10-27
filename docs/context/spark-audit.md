# Muse Spark audit (2026-10-26)

Hackathon rule: Meta models must be central. This is every decision point in the live factory, who
makes it, and what stands in when Spark can't answer. Spark = `muse-spark-1.3` on the Meta Model API
(`api.meta.ai/v1`, OpenAI-style chat completions), key in the `META_API_KEY` Worker secret (installed
and verified live earlier today, see decisions.md).

## Who decides what

| Decision | Where | Who decides | Fallback when Spark is down |
|---|---|---|---|
| Triage (kind + district) | `spark.ts` `triage`, called by `Factory.sparkTriage` | **Spark**, with a one-line reason | keyword rule (`heuristicTriage`), logged as a fallback |
| File scope for a job | `spark.ts` `pickFiles` | **Spark** | none: job fails, player re-approves |
| Job plan (5-turn tool loop: read_issue, read_file, assign_job, ask_player) | `spark.ts` `planLocalTask` | **Spark** | none: job fails, player re-approves |
| Rework re-plan after a scar | same loop, fed the failure + scars | **Spark** | none |
| AI review station | `gauntlet.ts` `reviewDiff` | **Spark**, hostile reviewer, comments on the PR | station waits (pile shows) |
| Deck ranking + suggested option per card | `spark.ts` `gameMaster`, `Factory.askGameMaster` | **Spark** (new) | value × wait score in `deck.ts` |
| Bottleneck card wording | same call | **Spark** (new) | `impliedBottleneckMove` text |
| Orbit watch: did this new Sentry spike come from the launch? | `spark.ts` `judgeOrbit`, `Factory.orbitCaused` | **Spark** (new), reads the PR's files + the error; unsure = caused | spike rule trips it |
| Research pick from the scar pile | `spark.ts` `pickResearch`, `Factory.sparkResearch` | **Spark** (new), only techs on the tree | scar-regex pick (`suggestResearch`) |
| Launch permit card: suggest Allow or Not yet | `spark.ts` `judgePermit`, `Factory.advisePermit` | **Spark** (new) advises; player taps | streak rule suggests Allow |
| Support triage: kind, district, summary, link to floor work | `spark-support.ts` `triageSupport`, `Factory.supportTriage` | **Spark** (new), links only to real open items | keyword rule (`heuristicSupport`), never links |
| Customer reply draft (answer, then "it's fixed" after launch) | `spark-support.ts` `draftReply`, `Factory.supportDraft` | **Spark** drafts; only the player's tap sends (support-mine.md) | template reply, marked fallback |
| Bottleneck detection (which stage is jammed) | `bottleneck.ts` | rule: queue telemetry (WIP × value × age) | n/a |
| Verify bay | `gauntlet.ts` `verifyFromDiff` | rule: runner proof receipts | n/a |
| Permit eligibility + revoke | `permits.ts` | rule: 5/10 clean ships to be offered, revoke on any rework | n/a |
| Same Sentry error back, revert PR, red on main | `orbit.ts` | rule: these are facts, not judgment calls | n/a |
| Hosted assembler (Spark writes code) | `spark.ts` `writeFix` | dev only, `HOSTED_SPARK_ASSEMBLER=1` | off in prod by design |

Deliberately rules, not model calls: bottleneck math, verify bay proof, launch permits. These are the
safety rails Spark plays inside. Spark can reorder cards and pick which option to suggest, but it can
never invent an action, unlock a locked ship card, skip a station, or grant a permit. Measurement and
permission stay deterministic so the automation earned by playing is provable.

## Where judges can see it

- **On GitHub:** when Spark finishes a plan for a GitHub issue, the server comments on the issue with
  the triage verdict + reason, every tool call in the loop with its reason, the plan and allowed files
  (`Factory.planComment`). AI review comments on the PR as "Muse Spark reviewing X's work". The PR
  body says "Muse Spark planned this task; the local X subscription executed it."
- **Judge page:** `/art/spark.html` (source `docs/spark.html`), linked from the panel.
- **In the game:** bell → "powered by Meta Muse Spark · how it thinks" (also Power sheet → "See how
  the planner thinks", or `?thinks=1`). It's the decision log (`FactoryState.brain`): count of Spark
  decisions vs rule fallbacks, and the last 40 calls with what it looked at, what it decided, why,
  and how long it took. Sim mode fills it with entries tagged `sim`.
- **On the map:** the foreman drone flies to whatever Spark is thinking about and shows THINKING
  while a call is in flight (it was sim-only before).

## Gaps found and fixed (PR for branch claude/project-thread-rg09k0)

1. No record of Spark's decisions anywhere a player or judge could look → `server/src/brain.ts` + the panel.
2. Deck order and suggested options were pure heuristics → Spark game master, cached per deck shape,
   one call in flight, at most every 15 s, never blocks the tick.
3. Triage had no reason and silently fell back → reason + logged fallback; the splitter log line now
   speaks in Spark's voice.
4. The live drone never moved (server never set `foreman`) → set on every Spark call.
5. Spark's plan was invisible in GitHub → issue comment.

6. Cards said what but not why → the game master writes a one-sentence `because` per card
   (`Move.because`), shown as the "Why:" line; falls back to the suggested option's reason.
7. "Never" swipes only hid cards → the dismiss rules and wrong-call corrections go into the plan call as
   `playerFeedback`; Spark returns `heeded` and the plan text lists "Respects your past calls".
8. No measure of quality → `Brain.score` scorecard in the panel and on the judge page: plans shipped
   (distinct Spark-planned jobs that merged, via `scoreShip` in the launch transaction), review catch
   rate (Spark verdicts that sent the PR back), and fallback share. Shared math: `scorecard()` in
   `shared/src/model.ts`.

9. Live Testing run (2026-10-26 22:25) showed triage and rank falling back on "schema validation failed"
   and malformed JSON → triage prompt now states its JSON shape, read-only judge replies drop unknown keys
   instead of rejecting them (planner and fix replies stay strict), off-list kinds/districts fall back
   per field, `parseJsonReply` repairs trailing commas and smart quotes, and `sparkJson` asks once more
   with the rejection reason before the fixed rule decides.

10. The game master burned about half of a day's budget (200 calls) on failing re-ranks during the Testing run.
    Now it re-ranks at most once a minute, and only when the card set changes (pile size is no longer part of the key).
    After a failure it backs off 1, 2, 4, 8, then 15 minutes, and it stops at half the daily calls or tokens. Spark also
    can't switch a card's suggested option to a do-nothing "Later" when the card has a real next step, which stalled
    autopilot on Plan cards.
11. Docs issues that need a new file (CHANGELOG.md, docs/SHIPPING.md) failed scoping, because the file pick only
    accepted existing paths. Spark can now propose up to two new `.md` files at the repo root or directly in `docs/`.
    They still pass the runner path rules, and the player still approves the scope on the Build card.

Check every prompt against the real API before a demo: `META_API_KEY=... bun run spark:check` runs
triage (including the testbed's misleading "docs typo" issue), the game master and all three judges.

## Still open

- Spark doesn't yet set `item.value` (priority). Bottleneck math uses source evidence weight or kind
  defaults. Next step: have triage return a 1–10 priority and fold it in once the scale is settled
  with ore weights.
- Cross-source `link_items` (Sentry ↔ PostHog ↔ issue) is described in `ore.ts` but not wired to a Spark call yet.
