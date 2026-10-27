---
title: Test players and the player bot
description: Isolated player accounts and browser testing without touching real repositories.
section: Reference
order: 30
---
# Test players and the player bot

Test accounts are opt-in: `TEST_USERS=on`, on loopback or exactly `https://shiptorio.dev`, with a matching `PUBLIC_URL`. They cannot be enabled on shiptorio.com. The normal preview password gate remains on the real app.

The **Sign in as tester** links below GitHub sign-in and `/test/users` offer:

| Player | Starting point |
| --- | --- |
| test-newbie | Fresh account, no repositories |
| test-guest | Signed out, play-first sample |
| test-midgame | Sample repository, three fixture ships, floor autonomy |
| test-broke | Sample repository, zero build quota and Spark dollar budget |
| test-blocked | Sample repository with a failed check awaiting a decision |

Signed testers use normal revocable sessions with reserved negative user IDs. Signing in again preserves their progress. They cannot read real repositories, connect mines, manage accounts, administer the app or pair real local runners. Fixture repositories are confined to `test-fixture/<persona>`. Their install link goes to the same-origin `/test/install` fixture, never a real GitHub installation page. Test sign-in still requires the preview password.

## Run the bot

```sh
bun run build
bun run playtest:bot -- --persona test-newbie --url http://localhost:8809
bun run playtest:bot -- --persona test-blocked --url https://shiptorio.dev
```

The bot operates visible player controls at 390 and 1280 pixels, captures screenshots after actions, records JavaScript and HTTP errors, and reports a screen that stays stuck for sixty seconds. These are browser viewport tests, not physical-phone proof. Evidence lands in `playtest/out/` as Markdown, JSON and PNGs. That folder is ignored by Git.

Local runs start the real Worker, D1 and Factory Durable Object in Miniflare. GitHub and Spark use the existing Stranger E2E stubs. The fixture helper returns labeled test build receipts; the real server still checks them, runs its gauntlet and requires the bot to press the player’s Launch control. This does **not** prove an external Codex build or a production launch.

## Staging boundary

Test factory requests require a `TEST_FACTORY` service binding to the private `shiptorio-fixture` Worker. Without that binding and a test-only signing key they fail before reaching a real factory. Production still refuses negative IDs, even when someone accidentally sets `TEST_USERS=on`.

The staging frontend verifies the normal tester session, then signs the request's exact persona, method, path and body for sixty seconds. It strips browser cookies and authorization headers before the service hop. The private backend has its own D1, KV and Durable Objects, creates its own session, and restricts all provider calls to the existing GitHub and Spark fixtures. It has no public route or workers.dev URL, no real API credentials, and no native-network fallback. The fixture runner handles one labeled build receipt per persona; it is not a real Codex execution. Repeated sign-ins preserve progress rather than resetting a completed game. The bot explicitly calls `POST /test/reset` before its first staging viewport. This requires its own normal tester session, preview access and matching origin; it resets only that fixed persona's private fixture. Active fixture jobs cannot be reset.

Prepare and inspect the resource plan without changing Cloudflare:

```sh
node playtest/staging/setup.mjs
node playtest/staging/check.mjs
```

The second command tests the real private Worker in Miniflare: signed delegation, isolated storage, same-origin install, signed webhook, inventory and runner pairing, with zero native provider egress. Unit tests cover tampering, expiry, blocked hosts, durable runner state and one-job limits. The local player bot separately proves the actual plan/approval/gauntlet/Launch journey.

After explicit approval to create the additional staging resources, `node playtest/staging/setup.mjs --apply` creates only `shiptorio-fixture`, its D1 database and KV namespace. `--activate-stage` additionally binds the existing `shiptorio-staging` Worker to it. Neither option changes `shiptorio.com` or other Workers. Generated resource IDs and fresh test-only keys live under ignored `.fixture-setup/`, with directory mode 0700 and file mode 0600. Review the plan and deployment configuration before using these flags. Do not reuse production databases, keys or passwords for this backend.

The Player bot workflow runs locally on manual dispatch and nightly. Staging stays disabled until its isolated service is deployed and `TEST_USERS_STAGING_READY=true` is set. Add the existing staging preview password as the Actions secret `SHIPTORIO_TEST_PASSWORD`; never put it in a command, report or commit. Staging failures create one `bot-bug` issue per stable failure fingerprint, with the workflow’s screenshot artifact linked. No workflow deploys or changes production.
