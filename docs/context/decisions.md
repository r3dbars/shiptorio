# Decisions and open items

- 2026-10-27: The 12-card cap reserves at most one existing eligible runner decision
  when passive source alerts would hide it. Awaiting plan consent takes precedence
  over a new planning proposal; only a passive unblock/Look later slot can be replaced.
  Score order and Spark ordering remain intact, as do suppression, explicit escalation
  and launch proof. This is visibility only, never approval or synthetic work.


- 2026-10-26: Runner plan approval binds the validated selected card to its durable
  job, not the transient top card. Concurrent deck refreshes cannot silently drop
  a tap or remove an unrelated card; the lock rechecks job/card/repo binding and
  the current issue revision. Authenticated WebSocket regressions reproduce both
  yield points and reject a changed issue or rebound job. This is local race proof,
  not attribution for any particular production tap.


Running log of what's been decided on Shiptorio and what's still waiting. Newest at the top
of each section. If you decide something, add it here in the same PR.

## Decisions

- 2026-10-26: The growth draft accepts explicit whole-window ordered-funnel cohort counts, never conversion inferred from route totals. Experiment decisions wait for the complete fixed horizon; insufficient evidence stays inconclusive, and before/after differences are observational. Simulator cohorts are explicitly synthetic. Real tenant-scoped PostHog measurement and dispatch remain unfinished.

Latest live verification, Oct 26: Sentry is now delivering signed issue-created and
issue-resolved webhooks, not merely configured. Isolated verification issue
7813706988 appeared as factory ore and disappeared after resolution in Sentry.
PostHog is connected and its Transcripted traffic-drop signal is flowing. The
existing GitHub App's Commit statuses read permission is repaired (superseding the
older pending-permission note below). Detailed evidence and remaining real runner
acceptance are in `live-source-launch-proof.md`.

PRs #141/#142 are merged with green CI and Deploy runs 40401140082/40401524789.
Both protected version endpoints matched `a4fc27c5407460577965a47a5d15d7a3feafbaef`.
Only `shiptorio` was deployed. PR #146 subsequently repaired planner-comment
revision handling. Issue #125 was completed by a concurrent agent PR and is not
counted as game-loop evidence; #170 is reserved for the real runner acceptance.
That acceptance remains incomplete; no approval or verification boundary was bypassed.

Security hardening checkpoint (Oct 26): preserve the existing signed webhook and
session boundaries, enforce browser mutation origins centrally, and add durable
per-IP/per-user budgets using the existing Factory binding (no new Cloudflare
resources). CSP will allow the app's Google fonts and inline styles; executable
inline scripts remain blocked except nonce-authorized original art prototypes.
Tenant membership is a separate concurrent change. Security-only web edits, if
needed, are limited to untrusted link destinations and rendering regression tests.
The checkpoint advances the Oct 26 live intake foundation and Oct 29 source intake.

Release verification, Oct 26: live bottleneck/deck #96, repeatable playtests #85,
Firefox/HTTPS entry #95/#98, repository picker #118, same-head CI/session security
#101/#111, sandboxed local verification/publication #104, idle-loop #117 and disposed
live-source cleanup #119 are merged. Deploy
https://github.com/r3dbars/shiptorio/actions/runs/40394207368 is green; both protected
version endpoints matched `3dfcf63af133cd8cc9936b54c312e0ca470ab957`. Only the
`shiptorio` Worker was deployed. The installed sandbox runner is running with native
Codex and Claude authentication and its existing pairing; its installation receipt
contains no credential values. New code never runs with the publisher's Git metadata.

Cloudflare's zone-level Always Use HTTPS is now on for both Shiptorio domains, with
TLS 1.2 minimum and TLS 1.3 enabled. External HTTP root and /access requests return
301 to HTTPS on both domains. The password gate remains active. Live browser proof
confirmed the real `r3dbars/shiptorio` picker entry and opened its factory; phone
layout proof remains separate from the verified Safari password-entry report.

GitHub CI inspection still needs one external setup repair: the existing App lacks
Commit statuses read permission, and a real installation-token GET /commits/main/status
returned 403. The manifest now requests read-only statuses alongside check-runs read;
this does not update an existing App automatically. Its admin page requires fresh
GitHub authentication, so the existing installation permission change remains pending
Justin's confirmation. Keep current-check refresh fail closed; never ignore that 403.

Security audit: the starting c799722 snapshot received an independent baseline and
architecture review, then parent validation. All 160 tracked text files were reviewed;
20 static screenshots and external dependency implementations were excluded. Five
source-backed findings were retained in the generated report. Server fixes and actual
macOS hostile-code probes are separate remediation evidence, not a claim that the old
audit snapshot had no findings. A contents-write GitHub token remains capable of merges;
true branch-only publishing needs mediation or independent GitHub branch rules.

The game approval PR #81 was rebased onto gauntlet PR #73 and merged. Both move handlers
remain: chooseGauntletMove gets first refusal only for pad/review cards, then runner
approval handles its own cards. The alarm runs both gauntlet and runner offers. Deploy
https://github.com/r3dbars/shiptorio/actions/runs/40382784190 went green and both domains
reported `066df5b7cf819d5cb97f85d4c4d6a2cd2b4b97f7`.

The next checkpoint adds scar-driven same-PR rework and real local regression receipts.
The runner checks out the failed PR head, appends one scoped commit, and retains its
branch/PR. Tests run against the target base with the changed tests overlaid, then head;
import/syntax/setup failures do not count as reproductions. Proof is bound to base/head
and attached to the PR; freshInspection resets gates on the new commit. A station's
third strike removes the rework recommendation and escalates to the player. Automated
acceptance covers the whole scar-to-Launch path; live browser proof remains separate.
The private preview password was rotated on both domains at Justin's request and the
old value was rejected. Its value exists only in local ignored secrets and Worker secrets.

Justin's delivery rule (Oct 26): push WIP after every meaningful step and open a draft
PR immediately after the first push. Codex merges its own completed PRs as soon as CI
is green, verifies Deploy and the live `/api/version` SHA (except docs-only changes),
and repairs red CI/Deploy in a new PR without waiting for another permission request.

Browser approval checkpoint: reuse the existing Move/choose_move contract. Requesting a
plan authorizes read-only planning; a durable awaiting_approval state prevents the local
runner from claiming it. The review card binds files, base commit, plan, item revision
and harness. Approval releases that exact job; duplicate/stale clicks, changed issues,
closed issues and declined plans cannot dispatch it. A reconnect retains the same card.
The only web-lane edits are a plan-details disclosure and its bounded scroll styling;
the existing check-in deck also sends the same approval command. A reversible macOS
background service and same-scope credential renewal remove terminal approval steps.
Implementation and unit/integration checks are complete; live browser acceptance and
deployment are verified separately before calling this shipped.

Justin authorized shipping the real agent fix: PR #62 merged and automatic Deploy
https://github.com/r3dbars/shiptorio/actions/runs/40378192118 succeeded for
`ad483ff985047cff5d9a2f9dc14e11e41c5a1ff8`. Its CI passed 69 tests, typecheck and
build. Independent operator proof reproduced six baseline failures and verified the
fix; a local Claude static review found no blocking issues. The live merge exposed an
issue-close-before-PR-merge race that deleted the tracked item before rocket credit.
The follow-up preserves PR-backed items, reconciles current-head CI without PR links,
and recovers older lost items only from a completed durable job and GitHub's actual
merged PR/issue. Duplicate completion acknowledgments reconcile receipts without
opening another PR or awarding another rocket. Regression checks cover that ordering,
stale-head exclusion, recovery, and duplicate acknowledgments. Automated independent
proof/review stations and browser approval wiring remain separate next checkpoints.

Real Spark-to-Codex acceptance passed on Oct 26: backend PR #61 deployed as
`b16638cee9a436d5dcfaf6aa74b960734e8535d0` via
https://github.com/r3dbars/shiptorio/actions/runs/40376838080. Both domains matched.
For issue #58, Spark chose read_issue → read_file (engine) → read_file (tests) →
assign_job in the live Cloudflare alarm. Job `0b663810-91db-4f37-9cab-f625e95ee6a8`
was claimed by local Codex using the existing ChatGPT sign-in. Its supervisor checked
the two approved files, passed typecheck/tests/build and pushed commit
`29cf937b43d4e127c348149753489471c411792e`. The installed Shiptorio App opened
https://github.com/r3dbars/shiptorio/pull/62; GitHub CI passed:
https://github.com/r3dbars/shiptorio/actions/runs/40377351997. The PR was then merged
at Justin's instruction (see the newer checkpoint above). This proves a real issue-to-PR path,
not the complete scars/verify/review gauntlet or browser approval flow. Sentry and
PostHog remain unconnected. The first post-deploy pairing attempt hit temporary
Worker/DO version skew; retry after propagation succeeded. The live test also caught
an evidence-directory offset, corrected to gitignored `runner/.work/`, and a stale
connect-agent Move, now resolved when the runner accepts work or re-acknowledges it.

Spark/local runner checkpoint: a bounded tool loop runs in the repo Durable Object's
alarm, with a five-turn planning budget and persisted reasons/results. Operator approval
fixes the issue, harness and exact paths. The local supervisor uses native Codex/Claude
subscription authentication in fresh clones, checks scope and local validation, pushes
only a job branch and asks the Worker to open the PR. Pairing is repo-scoped, revocable
and expires in eight hours. See `docs/RUNNER.md`. Real acceptance target is issue #58;
this implementation checkpoint does not itself claim the live agent run has passed.

GitHub connection verified (Oct 26): PR #35 merged after green CI and deployed through
https://github.com/r3dbars/shiptorio/actions/runs/40374006337. Both password-protected
domains reported commit `d60b7499b971aac477d165df598969845c2352fd`. All 55 tests,
workspace type checks, web build and ten local workerd smoke checks passed. The five
existing-App credentials were uploaded directly from gitignored `.dev.vars` to secrets
on only the `shiptorio` Worker. Installed the existing App (5483448) on only
`r3dbars/shiptorio`, installation 175555016. GitHub reports the installation delivery
and subsequent check events accepted with HTTP 202. This proves authenticated intake;
it does not yet prove a local-agent PR or the full verification gauntlet. Next checkpoint:
confirm live ore, then local runner and station verification. Codex owns `server/` and
`runner/`; Claude Code owns `web/`; contract changes remain separate PRs.

GitHub mine checkpoint: reuse the existing private `Shiptorio` App (id 5483448), rather
than creating a duplicate. New client/signing credentials were saved only in gitignored
`.dev.vars`; App JWT authentication was verified. The App webhook now uses the matching
local signing secret, JSON payloads and verified TLS. Credential upload and repo-only
installation follow the durable-intake deploy. PR #23 is deployed; PR #26 adds optional
source, ore-provenance and inspection fields. This checkpoint adds delivery-id dedupe in
the existing D1 database (migration 0002), durable DO intake, issue backfill and exact ore
folding; no new Cloudflare resources. Hosted Spark coding defaults off.

Latest scope from Justin: first prove GitHub → the four-station gauntlet → a real shipping
loop with local Codex/Claude agents. Then use Transcripted as the real-product pilot with
Sentry, support email and PostHog. Stripe is out of scope. The updated gauntlet checklist
uses merged contracts/docs #29/#31; do not create a second stations contract.

Deployment handoff (Oct 26, 17:07 UTC): PR #13 merged after CI passed against current
main (including the pixel map and Foreman contract). `bun run deploy` from main
successfully deployed only `shiptorio`; both custom domains retain the password gate.
Local workerd and remote HTTP/WebSocket smoke checks passed. The Meta key was verified
with a live ping/triage and is a Worker secret; GitHub App setup remains outstanding.
With Justin's action-time approval, created `Shiptorio GitHub Actions deploy`: Workers
Scripts/D1/KV Edit on the existing account, Workers Routes Edit on only shiptorio.com
and shiptorio.dev. Stored it as GitHub secret `CLOUDFLARE_API_TOKEN`, set
`CLOUDFLARE_ACCOUNT_ID`, and set `DEPLOY_ENABLED=true`. No token value is committed.
PR #19 merged after CI passed. The automatic push-to-main Deploy run succeeded
in 36 seconds: https://github.com/r3dbars/shiptorio/actions/runs/40365854227.
Both password-protected `/api/version` endpoints matched main commit
`1b5c1182ba6a320178c19b184608dee8cdc0986c`; both domains passed all ten remote
HTTP/WebSocket checks afterward. Auto-deploy is enabled and verified. Only `shiptorio`
was deployed; the other Workers were not modified. Future main merges trigger the
serialized Deploy workflow; verify its success and the live commit before calling a
change shipped. The preview is playable in simulator mode. Real repo execution still
needs the GitHub App and the subscription runner/Foreman work specified in PRODUCT.md.

Local backend handoff, Oct 26: Justin moved backend ownership from the cloud Codex chat to
the local checkout at `/Users/redbars/Documents/Codex/2026-10-26/review-the-official-meta-global-ai/shiptorio`.
He authorized deploying **only Shiptorio** and using `shiptorio.com` and `shiptorio.dev`.
The site must require a private preview password. First checkpoint is GitHub issue →
Spark → real PR → current-commit CI inspection/rework → human merge → rocket.
Sentry, other harnesses and voice follow that checkpoint. Spark is the factory foreman;
playing the game should cause useful, verifiable changes to a real product.
At that initial handoff the App credentials and deployment secrets were not configured.
The connection and automatic deployment checkpoints above supersede that initial state.

| When (2026-10-26, UTC) | Decision | Who |
| --- | --- | --- |
| 21:11 | **Factory-built PRs launch only in game.** Runner PRs (`shiptorio[bot]`, r3dbars/Testing) are never merged on GitHub directly; they pass the gauntlet and the Launch card, or a launch permit. Agent PRs still auto-merge. | Justin (via live check) |
| 18:47 | **Push often.** Commit and push WIP after every meaningful step; open draft PRs early. | Justin |
| 18:44 | **Auto-merge everything.** Every agent (Claude threads and Codex) merges its own PR as soon as CI is green, then confirms the Deploy on `main` is green. Skip stale drafts (#3, #4) and PRs another agent is still on. | Justin |
| 17:37 | **First sources = GitHub, Sentry, PostHog. Stripe on hold.** Demo impact shows via PostHog, not a Stripe checkout counter. North star now in `docs/VISION.md`; every agent reads it first. | Justin |
| 17:00 | Product calls locked: demo money = Stripe test mode in the demo shop (checkout counter on the HUD); customer replies = Spark drafts, player clicks Send; pitch = solo founders and tiny teams. See `docs/PRODUCT.md` | Justin |
| 16:57 | **Spark is the brain / game master, not a coder.** It plans, routes, judges and asks; it never writes PRs. Code is written by the player's own subscriptions (Claude Code, Codex) through the local runner, and each sign-in unlocks more machines and power. Spark asks before acting by default; autonomy is earned the more you play. See `docs/PRODUCT.md` | Justin |
| 16:45 | **Commit and push as often as possible.** Many agents work on this repo at once. `git fetch`, read open PRs and recent `main` commits before you start, push small commits, put shared context in `docs/context/`. | Justin |
| 16:45 | Anything that needs Justin (merge, decision, login, key, approval) gets pinged to them right away, with the exact action and a link. | Justin |
| 16:4x | **Locked art style: pixel 3D** (real 3D rendered as pixel art), slate/amber palette, Silkscreen font. The Feedback Factory canvas is now a *layout-only* reference (its Factorio-brown palette and Titillium font are out). | Justin |
| 16:3x | **Lanes:** Claude Code + Justin own `web/`. Codex (cloud) owns `server/` + `runner/`. `shared/` changes go in their own PR both lanes see. | Justin |
| 16:1x | **Stack = Cloudflare**, not the plan doc's Fly.io + Neon ("that is where I have the .com"). One Worker `shiptorio`, Hono, Durable Objects, D1, KV, GitHub App. | Justin |
| 16:1x | Created D1 `shiptorio` (id `153f63dc-f65f-4c02-a0b1-6c78b7d6aa08`, schema 0001 applied) and KV `shiptorio-cache` (id `c9d7c44e1c304a2b9a285049ee1e3408`). Not deployed. | Claude, OK'd by Justin |
| 16:0x | Never touch the other Workers on the account: `transcripted-feedback`, `stack99-relay`, `r3dbar-subscribe`, `redbars`. | Justin |
| plan | Muse Spark (Meta API, `muse-spark-1.3` at `https://api.meta.ai/v1`) makes every factory decision. Claude Code / Codex are only assemblers. | Plan doc |
| plan | Meta AI Developer Hackathon, Oct 26 – Nov 4 2026. **Submit by noon CT Wed Nov 4.** Fresh repo, only work done during the event. | Plan doc |

## Open items

| Item | Waiting on |
| --- | --- |
| Domains confirmed: shiptorio.com and shiptorio.dev, both live with password gate | Done |
| Local deployment and automatic GitHub Actions deployment configured and verified | Done |
| Existing GitHub App credentials uploaded and installation restricted to r3dbars/shiptorio | Done; authenticated installation delivery accepted |
| Local subscription runner and full CI / verify / review / human-merge loop | Codex; not yet proven |
| Meta key installed locally and as a Worker secret; live Spark ping/triage verified | Done |
| Codex PRs #3 (shared protocol) and #4 (factory API + issue ingestion) were built before #1 merged. They need porting onto `main`'s `shared/` + `server/` layout | Codex |
| PR #7 Item Lab art and PR #8 pixel map are merged and live | Done |
| Does Spark accept images (visual QA)? Rate limits, credit balance? | Anyone with a key |

- 2026-10-26: Upgrade non-local HTTP to HTTPS before any authentication path; secure-only preview cookies otherwise make a successful HTTP password form appear to do nothing. Keep the gate as a native HTML form, verify cookie acceptance with an explicit recovery message, and preserve the requested factory URL. HTTPS responses include HSTS; local HTTP development stays available.

Live bottleneck/check-in checkpoint (Oct 26): derive all queue metrics in pure
`bottleneck.ts`, using recorded stage entries/exits rather than invented throughput.
CI/verify/review map to the existing inspect contract with a specific station id;
merge maps to pad. Release/impact waits require observed history; a merge alone is
not evidence of a failed deploy or customer impact. Alarm mutations batch one deck
projection; browser and runner changes update it immediately. Local runner presence
expires after 20 seconds, and missing builders become a resources bottleneck.

Open proposals join a persisted pool; the ranked top 12 form the live check-in deck.
The top card remains `state.move`, and any visible card can be chosen safely. Required
CI/verify/AI proof comes from the item's inspection, never from supplied card stamps.
Existing same-PR rework and earned launch permits retain their own handlers. Later
returns a card on the next websocket check-in, keeps its defer count across restarts,
and the third defer offers an explicit never-or-delegate choice. Scoped kind rules
persist in D1; wrong-call notes reach the planner brief. Dismissals have five-minute
undo, including retracting their pending automation preference. The single
`recordApproval(kind, scope)` hook records intent for the autonomy lane; it cannot
create a permit or silently authorize a build/merge. No web or workflow changes.
- 2026-10-26: Firefox native form submissions may omit Origin. Preview login accepts a same-origin Referer, or same-origin navigation Fetch Metadata when Referer is also absent, only if Origin is absent; explicit foreign origins remain blocked; opaque origins require the signed form proof below. A stale HTTP POST redirects to a fresh HTTPS form without replaying its password, and refused requests show recovery instructions.
- 2026-10-26: Header-stripping Firefox privacy modes can authenticate using a hidden HMAC form token plus matching HttpOnly SameSite=Strict cookie, bound to the origin and expiring in ten minutes. Missing/opaque Origin can use that proof; explicit foreign Origin or cross-site Fetch Metadata cannot. Gate responses forbid framing and third-party form targets.

- 2026-10-26: Keep the onboarding sandbox honest: its picker offers the demo shop whose sample issues it actually runs, with an explicit sandbox note below sign-in. Real repository choices remain in live mode. Let the rocket clear its 3.4-second launch before a compact celebration card arrives at the screen edge; the launch is the main event. Bounded web fixes authorized by Justin's request to fix all open playtest issues.

- 2026-10-26: Reframe the actual machine footprint when it changes, including both layout axes, so building the starter line brings its launch pad into view. Portrait framing may zoom closer than the old baseline. Tour lessons pin the exact district and gauntlet labels they name, then clear them when dismissed; touch players do not need hover. Phone news captions are limited to two lines. Sign-in and repo selection retain the island backdrop from the concurrent art pass, with a rendering fallback that keeps forms usable on phones without WebGL. These bounded web fixes follow Justin's explicit all-issues cleanup request.

Playtest checkpoint: the reusable seeded runner covers every simulator scenario with
both a full journey and disconnect lifecycle. Keep its reports distinct from CUA
rendered checks and real GitHub/runner acceptance. Extract source-mine placement into
a pure module so the simulator does not import WebGL at module load; this preserves
placement behavior while allowing headless protocol tests. Suppress queued callbacks
and delayed deals after source close. Browser smoke checks reuse the authorized CUA
handle and always choose explicit simulator mode; no real PR is created by playtests.

First-run idle follow-up (#105): once the sandbox's initial fixes have all shipped,
offer one explicit input-growth card for an unconnected Sentry/PostHog mine. Opening
a mine adds its actual map deposit/belt; it does not invent customer ore. The seeded
first-run regression must observe that connect-source decision after its rockets.
Rendered smoke tests accept the line panel as the primary interaction while the
simulator is building automatically; waiting for a suggested merge before CI is done
is not itself an app failure. Console findings belong only to the current navigation.
- 2026-10-26: Name the dock action Place so it cannot be confused with the Build view. The field-guide tooltip counts concepts found, separate from the tour step count.
- 2026-10-26: Local supervisor checks need an OS boundary, not just an environment allowlist. macOS verification uses deny-default sandbox-exec with checkout/private scratch writes, isolated HOME, and offline checks; unsupported platforms fail closed. Dependency installation is an explicit scripts-disabled network phase. Publication must not trust repository-controlled Git hooks/configuration after agent/test execution.

## Live source connections — 2026-10-26

- Connected Sentry and PostHog to `r3dbars/shiptorio` through PR #97's existing
  authenticated `/connect/<kind>?repo=...` forms. Credentials remain in `CACHE`
  under `cred:<kind>` and repo links under `link:<kind>`; no new storage or
  Cloudflare resources. Never copy credential values into this log.
- PostHog: US project `378427` (Justin's existing Default project, containing
  Transcripted events), restricted personal key with only `insight:read`,
  `query:read`, `event_definition:read`, and `project:read`. Use
  `dictation_completed`, not the web-only `$pageview` default. Live factory
  reported a successful poll, traffic at `/`, and a queued ore item for
  `dictation_completed` on 2026-10-25. These are Transcripted product signals;
  they must not be described as Shiptorio usage or proof of a Shiptorio defect.
- Sentry: internal integration **Shiptorio factory** in org `r3dbars`, Project
  and Issue & Event read only, Alert Action enabled, issue lifecycle webhooks
  enabled at `https://shiptorio.com/webhooks/sentry`. The current Sentry UI
  disables raw `error` / `error.created` subscriptions despite these read
  scopes; no write/admin permissions were added to bypass that restriction.
  Saved its Client Secret through the existing connect form. Live factory
  shows the Sentry mine connected, but its first Sentry-originated issue
  delivery remains unverified. No synthetic customer error was inserted.
- Existing GitHub App's read-only Commit statuses permission is now saved and
  accepted on the repo-only installation; the legacy commit status API
  returned HTTP 200. This completes the previously pending permission step.
- Checked only the `shiptorio` Worker with `wrangler tail`, discarding request
  headers, query strings, log arguments and exception messages before output.
  Observed factory alarms and runner/GitHub requests had no exceptions or
  error logs during this check. Both source deposits are present in the live
  factory. No other Workers were changed.

- 2026-10-26: The optional real-map welcome tour is explicitly a sandbox. Only the intro simulator source can run its cues or sample Sentry ore; a live-source URL cannot enable it. Repeated tour actions are idempotent. Its dedicated playtest follows all eight actual UI beats, including scar → second verification → launch and automated shipping, and closes mid-build to protect delayed callback cleanup. Protocol proof remains separate from rendered desktop and physical-phone checks.
- 2026-10-26: Launch credit is durable per merged PR and commits atomically with science and permit counters. Orbit regressions keep their scars and new work when old merge receipts replay. Idle orbit watches schedule their actual 24-hour deadline; incoming work can preempt that distant alarm. This records elapsed observation, not proof of customer impact.

### 2026-10-26 — Multi-tenant access boundary (goal 1)

All live repository entry points resolve the current signed-in user through
`server/src/authorization.ts::requireUser`, then require both an installed GitHub App
and effective GitHub repository permission. The accounts lane owns users/sessions;
this seam deliberately adds no competing user or session tables. PR #160 supplies `accounts.ts`, user ids and revocable sessions; the isolation
integration uses those same rows for HTTP, sockets and runner capabilities. Positive membership grants last at
most 60 seconds in KV; D1 installation/repo removal always takes precedence.
Browser socket attachments bind the authenticated user to one canonical repo;
connect, moves and outgoing broadcasts all check access. Existing runner pairings
must be repeated: new capability tokens also bind the pairing user and their
session expiry. `/connect`, `/api/sources` and `/api/setup/status` need an explicit
`repo` query parameter. Source keys must be repo-scoped; the encrypted-credential
lane owns their final storage integration (PR #155). Factory-generated PRs remain
launchable only through the game. See [security.md](security.md) for the inventory.

- 2026-10-26: Shiptorio's own GitHub planner audit comment is output, not fresh work input. Identify it by the exact bot login, Bot actor type and planner header; human lookalikes, other bots and substantive comments retain revision protection. New plans refresh canonical issue context before pinning their input revision so persisted planner chatter cannot teach the next plan its own previous scope. Existing ready jobs are never rewritten or approved by this cleanup.

- 2026-10-26: Progression remains opt-in behind ?progress=1. Browser progress and morning briefs are scoped to the signed-in GitHub identity (simulator separate); card XP waits for authoritative deck removal. Stored progression is validated before rendering, level math is constant-time, and visible launch bonuses are retained instead of repaid after a 200-record rollover.

Credential isolation (Oct 26, goal 3): mine credentials move from global/per-repo KV
plaintext to installation + repo + kind D1 envelopes. AES-GCM uses fresh data keys
wrapped by CRED_MASTER_KEY; scope/kind/version are authenticated. First authorized
read migrates and deletes plaintext; revocation tombstones prevent stale KV or operator
secret fallback from restoring access. Claude accounts #160 supplies session/user/repo
membership. Worker-secret overrides stay with the pinned/legacy operator map. Keys
never enter factory messages, provider errors, logs, or connection responses; shared
redaction covers those output boundaries. The requested master key was generated directly into Wrangler after confirming
authorized access and an absent binding, only on shiptorio. No value was printed
or saved to a file; setup command is in docs/context/encrypted-credentials.md.

- 2026-10-26: Art direction is **Black Iron** (Cogworks variation 1), brightened, 1x pixels, with height (high rework line) and aether conduits/tesla coils borrowed from the other variations. The art must show the real journey of each work item and obvious IDLE / WORKING / BLOCKED states. Reference build: `docs/black-iron.html`, source in `docs/art/black-iron/`. In-world signage says SHIPTORIO.

Credential identity security follow-up (Oct 26): #159 protects direct D1 collisions,
but synthetic tests reproduced name reuse through Worker overrides, unmigrated KV,
and encrypted old-name scopes after rename. Mine storage/AAD now binds the active
installation plus immutable GitHub repo ID. Operator overrides and legacy adoption
require explicit installation/repo ID pins; name-only historical material remains
unread without identity proof. Same-ID renames retain proven new connections, and
retention deletes only the original ID's credentials. Existing production ownership
was verified through nonsecret metadata and its immutable pins are preserved in
production config; provider key values, revocations and permissions are unchanged.
- 2026-10-26: Black Iron becomes the style for the **whole game** (Justin: logo, gate, sign-in, landing, intro, tutorial, every sheet, docs, map). Rulebook `docs/art/IRON-STYLE.md`, tokens `web/src/iron.css`, Silkscreen + JetBrains Mono self-hosted in `web/public/fonts/` (public past the gate).

### 2026-10-26 — PR backlog integration receipt

- Cleared the original PR backlog and the follow-up queue through #222 and #226.
  #222 preserves the runner pairing route's strict CSP and password-protected
  factory/API while applying the shared page styles. Current-head CI and the
  actual Stranger onboarding check passed before merge.
- Full local check for the final styling integration: 644 tests passed, two
  platform skips, zero failures; typechecks and web/standalone runner builds passed.
  Six read-only desktop/mobile viewport renders covered Sentry, PostHog and runner
  pairing, including labelled keyboard focus and unchanged runner CSP. These are
  browser fixtures, not physical-device or real pairing acceptance.
- #207 deployed immutable repository credential identity. Authenticated connect
  reads confirmed both Sentry and PostHog still connected for r3dbars/shiptorio;
  metadata-only D1 checks confirmed both active encrypted rows at
  installation:175555016:repo-id:1434502633. No secret rotation or customer send.
- The heavy playtest release reported 24 simulator journeys, six browser/visual
  tests and 5,000 deliveries across 250 sockets with zero failures. These do not
  establish a real issue-to-PR launch. Reserved issue #170 still needs the full
  in-game approval → local agent → PR → gauntlet → Launch acceptance run; the
  currently installed local runner targets r3dbars/testing.
- The existing ten-minute PR monitor remains active. Respect active lane ownership,
  require current-head checks, and keep runner PRs behind the in-game Launch gate.
- Production release `0796af32deced1ff4d48a7377c3c72a46ce67818` is live on
  https://shiptorio.com: Deploy run
  https://github.com/r3dbars/shiptorio/actions/runs/40416992098 succeeded and
  `/api/version` returned the exact SHA. Public landing returned 200, while the
  live factory deep link and `/api/repos` returned 401 without credentials.
  Authenticated Sentry/PostHog connect reads both returned 200 with connected
  controls after this release. This receipt is docs-only and does not redeploy.
- New Claude UI PRs #227 and draft #229 arrived after the backlog cleared; their
  active owner retains merge/deploy responsibility. They are not part of the
  release above. Preview/staging on shiptorio.dev was not changed or certified.


### Codex supervised exact edits (2026-10-27)

- Disposable probes isolated Codex CLI 0.162.1 file-tool failures to nested macOS
  Seatbelt execution: plain inner workspace-write succeeded without the outer
  boundary; named exact-path permissions, streaming events and canonical binary
  paths did not repair nested edits. No production sandbox was relaxed.
- Codex now retains the outer OS boundary and inner read-only mode, returning a
  bounded schema-constrained edit proposal. After all agent children stop, the
  credential-free verification sandbox applies unique exact replacements only
  within the approved path list. Explicit new files must be absent; dirty trees,
  malformed output, tool attempts, links and ambiguous matches fail closed.
- Existing diff scope/secret checks, frozen files, sandboxed checks, regression
  proof and fresh trusted publication still run afterward. This implementation
  does not establish issue #170 acceptance or a real PR launch.

### Runner factory timeout recovery (2026-10-27)

- A scoped live `shiptorio` tail captured heartbeat and webhook 500s for both active
  factories with Cloudflare's `blockConcurrencyWhile()` timeout/reset error.
  `claimRunner` held its atomic mutation gate while `patch` awaited the browser
  broadcast queue. Fresh per-frame repository authorization can wait on remote
  GitHub calls, so slow browser delivery could reset the whole factory.
- Persisted state changes now enqueue browser delivery through its existing
  `waitUntil` task without awaiting it. Frame ordering, fresh authorization,
  rejection/close behavior, explicit browser-message drains and atomic runner
  approval/lease validation stay intact.
- A held-auth regression proves two concurrent claims create exactly one persisted
  running lease and a heartbeat completes before browser authorization resolves;
  no frame is sent early or after revocation. Restoring the old await makes this
  regression fail. This receipt does not claim a real issue-to-PR launch.

## 2026-10-26 — Foundry S-rocket identity

Justin selected the third refined rocket/S logo and **“A little play. A lot shipped.”** He asked Codex to implement it as code across the title screen, company logo, app titles and overlays, and merge it. The design uses dark enamel, brass, pipe rails and larger industrial headings; the existing factory artwork remains. See `docs/art/FOUNDRY-BRAND.md` for source assets and typography.
