# Playtests

A Claude thread plays the sim like a brand-new player and files what it finds as GitHub
issues labeled `playtest` plus `bug` / `ux` / `feel` and `web` / `backend`. Screenshots live
in a dated folder here so the issues can link them. Those issues are also real ore for the game.

## 2026-10-26 (local sim, all four scenarios + 390px phone)

Live shiptorio.com wasn't reachable from the cloud sandbox, so this run used `bun run dev:web`.

| # | Type | What |
|---|------|------|
| #37 | ux | Lower-priority ore builds first while Spark's pick waits on Go |
| #38 | bug | Ore deposit labels always say "0 waiting" |
| #39 | ux | Clicking a station does nothing |
| #40 | ux | Spark builds code in some scenarios; A/build places a Spark assembler |
| #41 | bug | A/B key hints don't work |
| #42 | feel | Idle camera drift slides labels under the HUD |
| #43 | ux | Phone layout: panels stack and hide the map |
| #44 | bug | Spark drone label stuck on request_rework |
| #45 | ux | Heal story ends without answering Dana |
| #46 | ux | Ship Score HUD is hard to read |
| #47 | feel | Zoomed out, labels pile up |
| #48 | ux | Log grows forever, Undo clipped |
| #49 | bug | Caption box flashes empty while fading |

All 13 above were fixed and closed by later PRs (#51, #52, #53, #57, #59 and others).

## 2026-10-26 round 2 (current main after the new UI, island and celebration)

Played the full new-player flow at `/` plus `heal` on desktop and a 390px touch phone.
Codex prompt: project file `codex-prompts/playtest-round-2.md`.

| # | Type | What |
|---|------|------|
| #74 | bug | After "Build it", launch pad and rocket are off-screen |
| #75 | ux | Tour names the gauntlet stations but the map doesn't show which is which |
| #76 | ux | Picking r3dbars/shiptorio gives fake checkout jobs |
| #77 | ux | Phone: tiny island, clipped scenario row, overlapping buttons |
| #79 | feel | SHIPPED card covers the rocket launch |
| #80 | feel | Sign-in and repo picker are a bare card on an empty background |
