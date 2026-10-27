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
| Job plan (8-turn tool loop over the whole toolbox, then assign_job or ask_player) | `spark-tools.ts` `planLocalTask` | **Spark** | none: job fails, player re-approves |
| Rework re-plan after a scar | same loop, fed the failure + scars | **Spark** | none |
| AI review station | `gauntlet.ts` `reviewDiff` → `spark-tools.ts` `reviewWithTools` (6-turn tool loop) | **Spark**, hostile reviewer, reads the repo at the PR head before ruling, comments on the PR with how it checked | station waits (pile shows) |
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
12. Testing #12 passed AI review with a broken README example (`--coupon` flag the code never reads), because the
    reviewer only saw the diff. Now lines added to a docs file that name code (or a `bun run`/`npm run` command) pull up
    to 3 of those unchanged files, read at the PR head, into the review, and a wrong example is blocking.

Check every prompt against the real API before a demo: `META_API_KEY=... bun run spark:check` runs
triage (including the testbed's misleading "docs typo" issue), the game master and all three judges.

13. Spark could only read the issue and pre-picked files, so it planned and reviewed half-blind (Testing #12's `--coupon`
    example and #13's "$50 or more ships free" vs `subtotal > 50` both passed review). Now every agentic step shares one
    read-only toolbox (`server/src/spark-tools.ts`, built per item by `Factory.sparkToolbox`, summaries in
    `spark-context.ts`): `read_issue`, `read_comments`, `read_file`, `list_files`, `search_code` (GitHub code index, then
    a path-ranked scan), `read_pr`, `read_ci` (check runs + annotations), `read_factory` (stations, district scars,
    permits, autonomy, the player's past calls) and `read_signals` (Sentry/PostHog items and support tickets tied to the
    work, never a customer address). Rails: every path goes through `pathAllowed`/`runnerPathAllowed`, results are
    redacted and capped, the resent observations stay under 36k characters (oldest shrink first), and a secret path ends
    the loop. Spark still can't write or merge: the planner finishes with assign_job/ask_player (files it found and read
    may join the scope only when the player approves it on the Build card), the reviewer with a verdict. Each tool call
    is broadcast to the log, listed in the plan comment, and the review comment gets a "How it checked" list.
    Cost: a plan is up to 8 calls (was 5) and a review up to 6 (was 1), all under the same daily cap.

## Still open

- Spark doesn't yet set `item.value` (priority). Bottleneck math uses source evidence weight or kind
  defaults. Next step: have triage return a 1–10 priority and fold it in once the scale is settled
  with ore weights.
- Cross-source `link_items` (Sentry ↔ PostHog ↔ issue) is described in `ore.ts` but not wired to a Spark call yet.
