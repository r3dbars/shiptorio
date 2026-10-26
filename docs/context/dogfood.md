# Dogfood: real issues end to end (friction log)

Goal (Justin, 2026-10-26 20:11): one clean, checkable run in a dedicated **test repo**. File a real
issue, see it pop up in Shiptorio, Meta Muse Spark works it in a real agentic loop (triage, file scope,
plan, judge), the local runner builds a PR, the gauntlet proves it, it launches. Every step has a GitHub
link. Then keep feeding issues through and fix whatever hurts.

Owner: Claude thread "Run a real issue end to end in a test repo". Spark-visibility work is in the
"Make Meta Muse Spark central" thread.

## The test repo: `r3dbars/shiptorio-testbed`

A tiny bun + TypeScript shop cart (`src/cart.ts`, `src/format.ts`, `src/index.ts`, tests in `test/`).
It has `typecheck` / `test` / `build` scripts, a `bun.lock`, and a CI workflow, because the runner
supervisor and verify bay assume all of those (see F2). Source is staged in the project files at
`shiptorio/testbed/` until the repo exists. All base tests pass; none of them cover the seeded bugs,
so a real fix has to add a test that fails on base and passes on head (that's what the verify bay proves).

Seeded issues (one per run):

| # | Issue | Bug | Lane |
| --- | --- | --- | --- |
| 1 | SAVE10 takes 10 cents off instead of 10% | `discount()` treats percent like cents | src |
| 2 | An order of exactly $50.00 still pays shipping | `shipping()` uses `>` not `>=` | src |
| 3 | "Typo in the receipt docs: $12.05 reads as $12.5" | `formatCents()` doesn't pad cents. Title says docs/typo on purpose: Spark triage should see it's a code bug where a keyword rule would say docs | src |
| 4 | Receipt says "2 items" when I bought 3 | `itemCount()` counts lines, not quantity | src |
| 5 | README setup says npm, the project uses bun | docs only | docs |

What to capture per run (from the Spark-central thread): Spark's planning comment on the issue
(triage verdict + reason, each tool call in the five-turn loop, plan, allowed files), its AI review
comment on the PR, and the `brain` decision log in the game ("how it thinks" panel). Also try one run
where the first fix doesn't really fix the bug, so AI review fails it and the rework re-plan kicks in.

## Run log

| When (UTC) | Step | Link | Notes |
| --- | --- | --- | --- |
| 10-26 20:15 | Testbed app built and staged | project files `shiptorio/testbed/` | Waiting on Justin: create the repo + install the Shiptorio and Claude apps |

## Friction log

Format: what hurt, how bad, what we did. Fixed items stay for the record.

- **F1. The runner pairs to exactly one repo.** `runner/src/cli.ts` reads one `SHIPTORIO_REPO`, and
  `runner:control pair` defaults to `r3dbars/shiptorio`. A player with two repos needs to re-pair (or
  run two helpers). For the test run we re-pair the Mac's runner to the testbed. Real fix: one pairing
  per player that can take jobs for any installed repo. *Open, runner lane.*
- **F2. The runner assumes a bun repo.** Supervisor runs `bun install --frozen-lockfile` then
  `bun run typecheck|test|build`; the verify bay runs `bun test`. Any repo without those scripts fails
  every job. The testbed is built to fit; real users won't be. Real fix: read the checks from the repo
  (package.json scripts / CI) or let Spark propose them in the plan. *Open, runner lane.*
- **F3. Agents can't stand up a test repo.** Creating a repo from the agent sandbox is refused (GitHub
  403 for the integration), and installing the GitHub App is a manual GitHub step. Fine for us, but it's
  the first thing any new player hits: "install the app on a repo". *Justin action.*
- **F4. Agents can't see the live factory.** The cloud sandbox can't reach shiptorio.com (proxy 403), so
  progress is checked through GitHub (issue, PR, checks, Spark's review comment) or a Remote Control
  session on Justin's Mac. *Workaround.*
