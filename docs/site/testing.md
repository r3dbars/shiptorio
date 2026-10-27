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

Test factory requests require a `TEST_FACTORY` service binding to a separate isolated Worker using those provider stubs. Without it they fail with an explicit unavailable response **before** reaching a real factory. Do not point this binding at production or an unrestricted network proxy. The service must share the test-only session identity configuration, accept only reserved tester IDs and the matching fixture repo, and refuse other routes and hosts. Local Miniflare supplies a private service hop and blocks all unstubbed outbound requests.

The Player bot workflow runs locally on manual dispatch and nightly. Staging stays disabled until its isolated service is deployed and `TEST_USERS_STAGING_READY=true` is set. Add the staging preview password as the Actions secret `SHIPTORIO_TEST_PASSWORD`; never put it in a command, report or commit. Staging failures create one `bot-bug` issue per stable failure fingerprint, with the workflow’s screenshot artifact linked. No workflow deploys or changes production.
