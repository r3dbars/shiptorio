# Decisions and open items

Running log of what's been decided on Shiptorio and what's still waiting. Newest at the top
of each section. If you decide something, add it here in the same PR.

## Decisions

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
