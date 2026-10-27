# The stranger path (task 19): signup to first rocket

What a brand-new GitHub account goes through, step by step, timed, with every snag and who owns it.
Re-run it any time: `bun run stranger` (or `node playtest/stranger/run.mjs` after `bun run build`).
CI runs the **Stranger E2E** workflow on every PR to `main`, including drafts and docs-only changes.

## How the dry run works

`playtest/stranger/run.mjs` bundles the Worker exactly as deploy does, runs it in Miniflare (real D1 with
every migration, KV, the Factory Durable Object, the built web app, the preview password on), and points
every outbound GitHub call at `playtest/stranger/github-stub.mjs`. The stub is a pretend GitHub with a
fresh account (`fresh-stranger`, no Shiptorio row, no installation) that owns one repo,
`fresh-stranger/lemonade-stand`, with two open issues. The browser is a fresh Chromium profile; its visits
to github.com (authorize, install the App) are answered by the stub too, and the install sends the real
signed `installation` webhook. No secrets, no network, nothing on shiptorio.com is touched.

`ALLOWED_LOGINS` contains only `fresh-stranger`: no wildcard or signup bypass.

## Timings (scripted, 2026-10-26)

| # | Step | Before | After |
| --- | --- | --- | --- |
| 1 | Front door: preview password | 1.0s | 0.5s |
| 2 | Welcome tour shows, then Skip | 3.0s | 2.4s |
| 3 | Sign in with GitHub | **stuck**: "signs in" to the sandbox as `you`, offers `you/demo-shop` | 3.4s, real GitHub sign-in, "Hey fresh-stranger" |
| 4 | No repos yet: install the App | small text link, same tab, GitHub then strands you | 2.4s, one big button, GitHub in a new tab |
| 5 | Back in Shiptorio, repo listed | had to find "refresh" (signs in again) | 2.6s, shows up by itself (polls while empty) |
| 6 | Open the factory (live map, scan) | not reachable | 2.0s |
| 7 | Next move: "Plug in Claude or ChatGPT" | not reachable | 0.3s |
| 8 | Suggested "Connect a local agent" | server answers "Connector setup is not implemented yet." | 2.2s, opens Power |
| | **Total to a live factory asking for power** | **never** (dead end at step 3) | **25s scripted** |

A human adds reading time: the full welcome tour is 8 beats, GitHub's install page is one click.

## Snags

| # | Snag | Status | Owner |
| --- | --- | --- | --- |
| 1 | A bare visit to `/` ran the sandbox onboarding even on the real server: "Sign in with GitHub" did nothing real and offered the fake `you/demo-shop`. A stranger could never sign in from the front door; only `?source=live` links worked. | **Fixed**: `web/src/main.tsx` asks `/api/version`; when the Worker answers, a bare visit is live. `bun run dev:web` (no API) stays in the sandbox. | Claude |
| 2 | "SIGN IN WITH GITHUB" rendered as a small unstyled pill. | **Fixed**: the main button style. | Claude |
| 3 | Zero repos (every new account) showed "Not there? Install the Shiptorio app on the repo, then refresh" as small print, plus an owner/name box that only ever works for repos already listed. | **Fixed**: one big "Install Shiptorio on a repo" button (new tab) and the list refreshes by itself every 3s and on focus. The owner/name box only shows if the list fails to load. | Claude |
| 4 | After installing, GitHub had nowhere to send the player (the App has no Setup URL), so it left them on GitHub's settings page. | **Fixed in code**: `/github/installed` sends them to the repo picker and new Apps get `setup_url` from the manifest. The existing App needs its Setup URL set once (optional, the polling in #3 already covers it): GitHub → Settings → Developer settings → GitHub Apps → Shiptorio → Setup URL `https://shiptorio.com/github/installed`, tick "Redirect on update". | Claude / Justin (optional setting) |
| 5 | The first Next Move's suggested button, "Connect a local agent", sent `connect_source {kind: claude}`, which the server answers with "Connector setup is not implemented yet." | **Fixed on the map** (`NextMove` opens Power in live). Still open in the **check-in deck**: swiping that card right sends the same message. Server fix belongs with goal 11: make `connect_source` claude/codex answer with the runner steps. | Codex (goal 11) |
| 6 | Power says "pair the runner" with a tooltip for `bunx shiptorio-runner pair`, which doesn't exist. A stranger has no way to install the runner. | Open: PR #166 adds `RunnerConnection` (install.sh + browser pairing code) to this exact sheet. Not duplicated here. | Codex (goal 11, #166) |
| 7 | The preview password is the real front door, and a login outside `ALLOWED_LOGINS` gets a bare-text 403 "x isn't on the allow list". | Open: PR #161 (waitlist, invites, `/waitlist` page). | Codex (goal 12, #161) |
| 8 | The live map shows the whole HUD at once on a first visit (tour lessons only run in the sim's `first-run`), which breaks VISION's progressive disclosure for exactly the player who needs it. | Open, next for the web lane: run the `tutorial.tsx` lessons on a player's first live visit. | Claude (web) |
| 9 | Runner → plan → PR → gauntlet → Launch → rocket was outside the run. | Covered by the full fixture E2E extension below. Real installer/CLI execution and external providers still need the live acceptance run. | Codex |

## What changed in code (this PR)

- `web/src/main.tsx`: live-or-sandbox decided by whether the Worker is there.
- `web/src/ui/Onboarding.tsx`: zero-repo install step, auto-refresh, owner/name box only on failure.
- `web/src/ui/NextMove.tsx`, `web/src/App.tsx`: "Connect a local agent" opens Power in live.
- `server/src/index.ts`: `GET /github/installed`. `server/src/auth.ts`: manifest `setup_url`.
- `playtest/stranger/`: the dry run. `.github/workflows/stranger.yml`: runs it on path changes.

## Current-main integration verification (2026-10-26)

The Linux installation timeout reproduced locally with a successfully signed installation
webhook and persisted membership, but 17 picker polls still returned no accessible repo.
The GitHub fixture lacked the collaborator-permission endpoint now required by production
revalidation. It now grants access only for the fixture's installed repo, exact user and
installation token, and supplies real-shaped repository IDs and installation permissions.
No authorization, signup quota or membership check is bypassed.

The first browser and installation backfill could also initialize a factory concurrently,
letting a late empty initializer replace new work. Initialization now coalesces. A held-network
Factory regression covers shared completion, failed initialization followed by retry, differing
installation IDs, and pause/migration during lookup without resurrecting state.

The real Worker/browser dry run then completed all eight steps locally in 15.4 seconds;
the installed repo appeared automatically in 3 seconds. That observation is desktop fixture
proof, not a physical-phone or real-GitHub account claim. Current-main full `bun run check`
passes (549 tests, two platform skips); the Linux Stranger workflow is the release gate.

After the runner-onboarding merge, the first repo intentionally opens Power with
`connect=1`. The final desktop run accepts that immediate handoff or the visible
agent card, and additionally requires real issue data received over the live socket;
a URL-only empty Power sheet cannot satisfy it. All eight current-main steps passed
in 26.0 seconds. Linux CI must run this updated acceptance path before merge.


## Full E2E extension (2026-10-26)

The existing eight-step browser journey now continues through signed issue delivery (including a retry),
device-code runner pairing approved in the browser, Spark's real planning tool loop with fixture responses,
player plan approval, runner claim and finish HTTP routes, PR publication, stale CI rejection, current-head
CI, regression-proof verification, Spark AI review, a visible Launch card and the player's click to merge.
The live socket must report `launched` with the human gate passed. No direct merge RPC or state seeding
stands in for the browser's plan approval and Launch actions.

External boundaries are explicit: `github-stub.mjs` serves GitHub OAuth/install/API/webhooks and git results;
`spark-stub.mjs` serves deterministic Meta completion JSON; the fixture runner supplies branch/head/diff
and a base-fails/head-passes receipt. This tests production lease, scope, proof-binding, PR publication
and gauntlet integration. It does **not** execute Codex/Claude, install the runner on a real machine,
validate actual model output, or merge any real GitHub PR. The build receipt is a fixture, not physical
runner proof. Every factory decision still goes through production Spark code.

Run `bun run stranger`; use `STRANGER_OUT=/tmp/stranger-e2e` to keep evidence in a known directory.
Chromium must be installed (`bun x playwright install chromium`). `STRANGER_PORT` changes the default
8799, `CHROMIUM_PATH` selects a browser, and `PLAYWRIGHT_MODULE` remains an optional module override.
CI uses the locked Playwright version, a fresh local database and no repository secrets. Every step
saves a screenshot; `timings.json` includes the final factory state and provider call summaries;
`trace.zip` contains the browser trace. CI uploads evidence even when the journey fails. Failure
screenshots and the database/socket/API diagnostics identify the first broken boundary.

The first added browser pairing step reproduced a real bug: `no-referrer` makes Chromium send opaque
`Origin: null` for the approval form. PR #252 narrows the pairing-page policy to `same-origin`, while
retaining exact-origin CSRF checks. Tests exercise the real form without an injected Origin header.
