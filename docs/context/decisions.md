# Decisions and open items

Running log of what's been decided on Shiptorio and what's still waiting. Newest at the top
of each section. If you decide something, add it here in the same PR.

## Decisions

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
