# Dogfood: real issues end to end (friction log)

Goal (Justin, 2026-10-26 20:11): one clean, checkable run in a dedicated **test repo**. File a real
issue, see it pop up in Shiptorio, Meta Muse Spark works it in a real agentic loop (triage, file scope,
plan, judge), the local runner builds a PR, the gauntlet proves it, it launches. Every step has a GitHub
link. Then keep feeding issues through and fix whatever hurts.

Owner: Claude thread "Run a real issue end to end in a test repo". Spark-visibility work is in the
"Make Meta Muse Spark central" thread.

## The test repo: [`r3dbars/Testing`](https://github.com/r3dbars/Testing)

A tiny bun + TypeScript shop cart (`src/cart.ts`, `src/format.ts`, `src/index.ts`, tests in `test/`).
It has `typecheck` / `test` / `build` scripts, a `bun.lock`, and a CI workflow, because the runner
supervisor and verify bay assume all of those (see F2). Seeded issues are [#1 to #5](https://github.com/r3dbars/Testing/issues). All base tests pass; none of them cover the seeded bugs,
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
| 10-26 20:15 | Testbed app built | project files `shiptorio/testbed/` | |
| 10-26 20:55 | Justin creates `r3dbars/Testing` | https://github.com/r3dbars/Testing | Named Testing, not shiptorio-testbed |
| 10-26 21:01 | App pushed, issues #1 to #5 filed | https://github.com/r3dbars/Testing/issues | |
| 10-26 21:08 | Shiptorio app installed on Testing | D1 `repos` has `r3dbars/testing` | Install webhook landed |
| 10-26 21:15 | Runner re-pair blocked | | Needs `server/.dev.vars` on the Mac (F5) |
| 10-26 21:20 | Runner paired to Testing | | Justin copied `.dev.vars` by hand |
| 10-26 21:30 | Docs issues #6 to #11 filed | https://github.com/r3dbars/Testing/issues | Fuel for the docs launch permit (5 clean docs ships) |
| 10-26 21:30 | Autopilot merged | https://github.com/r3dbars/shiptorio/pull/179 | Taps Spark's suggested plan/approve/launch/permit/rework so the run needs no human |
| 10-26 21:33 | Service install race fixed | https://github.com/r3dbars/shiptorio/pull/186 | F8 |
| 10-26 21:42 | Owner scripts get real sessions | https://github.com/r3dbars/shiptorio/pull/189 | F9 |
| 10-26 22:20 | Runner re-paired after #151/#160/#166 | | Waiting on Justin's dedicated Codex sign-in (F10) |
| 10-26 22:24 | Autopilot taps Plan on #1 to #6, approves #5 | | Spark planned #5 (README npm → bun) |
| 10-26 22:25 | #6 planning fails | | Generic "Planning failed"; real cause was an off-list file pick, now dropped and recorded (#226) |
| 10-26 22:50 | Dedicated Codex sign-in reaches the service | https://github.com/r3dbars/shiptorio/pull/213 · https://github.com/r3dbars/shiptorio/pull/224 | F11, F12 |
| 10-26 22:52 | First claim of #5 lost in transit | https://github.com/r3dbars/shiptorio/pull/230 | F13: job "running" with nobody on it |
| 10-26 23:10 | #5 re-handed to the runner, Codex dies in the Mac sandbox | https://github.com/r3dbars/shiptorio/pull/235 | F14 |
| 10-26 23:20 | Spark daily budget used up | https://github.com/r3dbars/shiptorio/pull/240 | F15: game master retries ate about half of it |
| 10-27 00:09 | Prod 500s: Worker over the Free plan's 10ms CPU cap | https://github.com/r3dbars/shiptorio/pull/246 · https://github.com/r3dbars/shiptorio/pull/249 · https://github.com/r3dbars/shiptorio/pull/253 | F18. Justin moved to Workers Paid at ~01:00 |
| 10-27 00:50 | Owner daily run quota (20) used up by planning retries | https://github.com/r3dbars/shiptorio/pull/284 | F19. Raised to 200 at ~02:00 |
| 10-27 01:07 | Spark may scope new Markdown docs a task needs | https://github.com/r3dbars/shiptorio/pull/261 | #10's CHANGELOG.md was "unapproved file selection" before |
| 10-27 01:52 | **First real runner PR**: Testing#12 closes #5 | https://github.com/r3dbars/Testing/pull/12 | CI green, verify bay "docs-only", AI review passed |
| 10-27 01:52 | AI review passes a broken README example on #12 | https://github.com/r3dbars/shiptorio/pull/285 | F22. `--coupon SAVE10` but src/index.ts reads argv[2] |
| 10-27 02:17 | Testing factory DO resets ("blockConcurrencyWhile waited too long") | | F21. Cleared by itself by 02:20 |
| 10-27 02:18 | Autopilot found frozen since 01:32 | https://github.com/r3dbars/shiptorio/pull/312 | F20 |
| 10-27 02:26 | Second runner PR: Testing#13 (#7, new docs/SHIPPING.md) | https://github.com/r3dbars/Testing/pull/13 | #261's new-file scope works end to end |
| 10-27 ~02:20 | **Rework catch**: manual verification sends #12 back | https://github.com/r3dbars/Testing/pull/12 | 3 scars, item rejected |
| 10-27 02:30 | No launch card for #13, no rework card for #12 | https://github.com/r3dbars/shiptorio/pull/307 | F23. Deck starvation |
| 10-27 02:40 | GitHub Actions stops assigning runners repo-wide | | F24. #307 merged but not deployed |
| 10-27 02:41 | #13's doc contradicts the code (bug #2): launch held | https://github.com/r3dbars/shiptorio/pull/312 | Not a clean ship. `AUTOPILOT_HOLD=gh-7` |
| 10-27 02:50 | Live `spark:loop`: 8/8 after the re-plan fix, 9/9 on the toolbox branch | https://github.com/r3dbars/shiptorio/pull/310 · https://github.com/r3dbars/shiptorio/pull/314 | Review now catches #12 and #13 offline |
| 10-27 03:03 | #12 rework tap refused while gh-1 holds the one job slot | https://github.com/r3dbars/shiptorio/pull/312 | F25 |

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
- **F5. Pairing a runner needs the server's secrets on the player's Mac.** `runner:control pair` reads
  `APP_PASSWORD` + `SESSION_SECRET` from `server/.dev.vars`. Only the checkout that set up the server has
  them, and the Mac's agent guard (rightly) won't copy credential files, so Justin had to `cp` it by
  hand. A real player will never have server secrets. Real fix: pair from the game ("Connect this Mac"
  shows a one-time code, `runner pair CODE` trades it for the repo-scoped token). *Open, runner lane.*
- **F6. Bun isn't on the default shell PATH** on Justin's Mac (`~/.bun/bin`), so the documented
  `bun run ...` commands fail in a fresh shell. Minor; the service bundles its own bun. *Workaround.*
- **F7. The Mac's agent guard won't start background services or auto-approve jobs.** Remote Control
  can pair and diagnose, but `runner:service install` and starting the autopilot have to be Justin's paste.
  Right call for safety; it means every runner change costs the owner a Terminal paste. *By design.*
- **F8. `runner:service install` raced launchd.** `bootout` returns before the label is released, so
  reinstalling over a loaded runner failed with `Bootstrap failed: 5`. Fixed in #186 (wait, then retry).
- **F9. Real sessions (#160) and multi-tenant access (#151) broke every owner script.** Locally signed
  cookies have no session row, so autopilot got 401 and runner claims got 403. Fixed in #189:
  `POST /auth/owner-session` trades an HMAC proof of `SESSION_SECRET` for a real, revocable session.
  Lesson: security PRs need a smoke test of the operator scripts, not only the browser.
- **F10. Three runner auth changes in one afternoon.** Between pairing (21:20) and the first job, the
  runner needed a re-pair (#151), a new owner session (#160 → #189), and its own dedicated Codex sign-in
  (#166). Each one is right on its own, but together they mean a working runner stopped working three times
  with no in-game signal beyond a 403 in a log file. Real fix: the game's power panel should say
  "runner can't claim: re-pair / sign in" with the exact command. *Open.*
- **F11. `runner login codex` failed on a fresh Mac** because the dedicated `CODEX_HOME` folder didn't
  exist yet. Fixed in #213 (create `.agent-home/.codex` first).
- **F12. The login landed in the checkout, the service reads Application Support.** So the service kept
  saying "No signed-in agent" after a good login. Fixed in #224 (`service install` carries `.agent-home`).
- **F13. A lost claim response stranded a job.** The server marked #5 running, the response was lost to an
  ECONNRESET / 30s timeout (plus a run of edge 503s), and nothing could ever claim or re-plan it: an expired
  lease also stayed "running" forever. Fixed in #230: the same idle pairing claiming again 45s+ later gets
  the job back, and expired leases fail and requeue the item.
- **F14. Codex can't start inside the macOS agent sandbox.** Seatbelt denied cfprefsd (managed prefs) and
  the configd/networkd/trust services HTTPS needs, and the runner blamed the sign-in. Fixed in #235 (agent
  profile only; verification stays locked down). The agent's redacted stderr tail now goes to the local log.
  Needs a `runner:service install` paste each time (F7).
- **F15. The game master could starve planning.** Malformed/cut-off JSON retries on every refresh used about
  half of Spark's 200 calls / 500k tokens a day, then #1 failed "budget exhausted". Fixed in #226 (cap 6144,
  keep partial fields) and #240 (re-rank at most once a minute, back off, stop at half budget).
- **F16. Autopilot can't answer `ask_player`** (#10 failed "Spark requested player input"), and it skips
  cards whose recommended option is "Later" (Spark picked Later on #6/#7/#9; #240 stops that). *By design
  for ask_player; the question is now kept on the job.*
- **F17. GitHub 304s logged as errors and sent to Sentry** (about 20 per 15 min on Testing). Fixed in #230.
- **F18. The Free plan's 10ms CPU cap took prod down.** Spark JSON repair (`escapeStrayQuotes`) was quadratic,
  and big state saves went over 10ms, so `exceededCpu` 500s hit claims and sockets. #246 made the repair linear,
  #249/#253 trimmed hot paths, and Justin moved to Workers Paid. No `exceededCpu` since.
- **F19. Planning retries burned the owner's daily run quota (20).** The fix to raise it at /admin/signup failed in
  Chromium (`no-referrer` made the Origin opaque, so 403). Fixed in #284, and the limit is now 200.
- **F20. The autopilot froze for 46 minutes.** It was started in the background with stdin on a terminal, so it got
  stopped (state `T`) on its first read. Start it with `</dev/null` (command in #312).
- **F21. Transient Durable Object resets.** Around 02:17, `/factory` and `/limits` got "blockConcurrencyWhile()
  waited for too long" for a few minutes, and runner heartbeats 500'd. A 90s tail right after showed nothing over
  ~1s, so it was probably startup after a deploy. Worth watching: `claimRunner` does D1, quota and deck work inside
  `blockConcurrencyWhile`.
- **F22. AI review checked the diff, not whether it's true.** #12's README example (`--coupon SAVE10`) can't work
  and #13's doc says "$50 or more" where the code says `> 5000`. Review passed both. #285 gives review the
  referenced files, and #310/#314 add a tool-loop reviewer. Offline `spark:loop` now catches both cases.
- **F23. Fresh launch and rework cards fell out of the deck.** Ranking is value × minutes since the item changed, so
  a PR that just went green lost to 11 issues that had waited hours, and the 12-card cap dropped it. #307 keeps
  every merge-gate card in the deck.
- **F24. GitHub Actions stopped running jobs (~02:40).** Every job failed in 3s with no runner (billing or spending
  limit). Nothing merged after #302 deployed, which includes #307.
- **F25. One job slot plus a plan cap stalled rework.** While gh-1 was planning, the #12 rework tap was refused
  ("Factory job budget reached"), and the autopilot counted each refused tap toward its 3-plan cap. #312 counts only
  plans that started.
