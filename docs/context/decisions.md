# Decisions and open items

Running log of what's been decided on Shiptorio and what's still waiting. Newest at the top
of each section. If you decide something, add it here in the same PR.

## Decisions

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
The GitHub App does not exist yet. Justin has a Meta key; it must be entered securely.
The local Wrangler login works; GitHub Actions deployment secrets are not configured yet.
Do not mistake a local/direct deployment for automatic main deployment being enabled.

| When (2026-10-26, UTC) | Decision | Who |
| --- | --- | --- |
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
| Open `/setup` on the deployed URL to create the GitHub App, then `wrangler secret put` its secrets | Justin, after deploy |
| Meta key installed locally and as a Worker secret; live Spark ping/triage verified | Done |
| Codex PRs #3 (shared protocol) and #4 (factory API + issue ingestion) were built before #1 merged. They need porting onto `main`'s `shared/` + `server/` layout | Codex |
| PR #7 Item Lab art and PR #8 pixel map are merged and live | Done |
| Does Spark accept images (visual QA)? Rate limits, credit balance? | Anyone with a key |
