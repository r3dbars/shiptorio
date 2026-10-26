# Claude project threads (as of 2026-10-26 ~16:50 UTC)

What each thread in the Claude "Shiptorio" project did. Threads live on claude.ai, so this
is the only copy agents outside it (Codex) can see.

| Thread | State | What it did / produced |
| --- | --- | --- |
| Review Justin's GitHub repos | done | Found `r3dbars/shiptorio` (then just a README). Other repos: transcripted, transcripted-webapp, redbars, pipread, BetterFeedback |
| Review Justin's Cloudflare account | done | Surveyed the account: Workers `transcripted-feedback`, `stack99-relay`, `r3dbar-subscribe`, `redbars` (don't touch). Nothing Shiptorio yet. R2 not enabled |
| Build Shiptorio on Cloudflare for the hackathon | working | PR #1 (merged): Cloudflare Worker + GitHub App + D1/KV, reshaped into `shared/` `server/` `web/` bun workspaces, Spark client, issue → Spark → PR first cut, Three.js pixel map + `?source=sim`. Created D1 `shiptorio` + KV `shiptorio-cache`. Rebuilt the repo handoff doc as PR #5 (merged: PLAN.md, docs/ARCHITECTURE.md, docs/ART.md, briefs/, both prototypes). Now porting the Pixel Prototype art into `web/` (draft PR #8) |
| Find the Shiptorio Claude doc | done | Found the plan doc and made the repo handoff doc (the local `~/omni/shiptorio` files, which were on Justin's other computer) |
| Write Shiptorio context for Codex | done | AGENTS.md (PR #2, merged) + paste prompt for Codex. Codex can't open claude.ai links, so AGENTS.md is its view of the plan |
| Move and push local Shiptorio folder | blocked | Looked for `~/omni/shiptorio` on Justin's Mac; it isn't there (it was on another machine). Superseded by PR #5 |
| Iterate on pixel art direction | working | Confirmed the locked look (pixel 3D, slate/amber, Silkscreen); Feedback Factory canvas is layout-only now. Reworked the launch pad base and solar panel in the Item Lab, draft PR #7. Waiting on Justin to "lock it" |
| Commit all Shiptorio context to repo | working | This folder (`docs/context/`), PRs #6 and #9 |

## PRs at a glance

| PR | What | State |
| --- | --- | --- |
| #1 | Day 1 scaffold on Cloudflare | merged |
| #2 | AGENTS.md | merged (via #1's history) |
| #3, #4 | Codex: shared protocol proposal, persistent factory API + issue ingestion | open drafts, built on the old scaffold. Need porting onto `main` |
| #5 | Plan, architecture, art docs, prototypes | merged |
| #6, #9 | docs/context | merged |
| #7 | Item Lab launch pad + solar panel v2 | draft, waiting on Justin |
| #8 | Pixel Prototype art port into `web/` | draft, in progress |
