# Claude project threads (as of 2026-10-26 ~16:55 UTC)

What each thread in the Claude "Shiptorio" project did. Threads live on claude.ai, so this
is the only copy agents outside it (Codex) can see.

| Thread | State | What it did / produced |
| --- | --- | --- |
| Review Justin's GitHub repos | done | Found `r3dbars/shiptorio` (then just a README). Other repos: transcripted, transcripted-webapp, redbars, pipread, BetterFeedback |
| Review Justin's Cloudflare account | done | Surveyed the account: Workers `transcripted-feedback`, `stack99-relay`, `r3dbar-subscribe`, `redbars` (don't touch). Nothing Shiptorio yet. R2 not enabled |
| Build Shiptorio on Cloudflare for the hackathon | working | PR #1 (merged): Cloudflare Worker + GitHub App + D1/KV, reshaped into `shared/` `server/` `web/` bun workspaces, Spark client, issue → Spark → PR first cut, Three.js pixel map + `?source=sim`. Created D1 `shiptorio` + KV `shiptorio-cache`. Rebuilt the repo handoff doc as PR #5 (merged: PLAN.md, docs/ARCHITECTURE.md, docs/ART.md, briefs/, both prototypes). Now porting the Pixel Prototype art into `web/` (draft PR #8: shader, models, scene rebuilt, prototype-style HUD as of 16:53) |
| Find the Shiptorio Claude doc | done | Found the plan doc and made the repo handoff doc (the local `~/omni/shiptorio` files, which were on Justin's other computer) |
| Write Codex prompts for Shiptorio | working | AGENTS.md (PR #2, merged) + paste prompt for Codex. Now the Codex prompt desk: paste-ready prompt packs for Justin, and tracks what Codex has pushed (see below) |
| Define Meta Spark as Shiptorio's game agent | working | Writing the spec for how Muse Spark runs the factory. Codex prompts follow from it |
| Move and push local Shiptorio folder | blocked | Looked for `~/omni/shiptorio` on Justin's Mac; it isn't there (it was on another machine). Superseded by PR #5 |
| Iterate on pixel art direction | working | Confirmed the locked look (pixel 3D, slate/amber, Silkscreen); Feedback Factory canvas is layout-only now. Reworked the launch pad base and solar panel in the Item Lab, PR #7 (merged, now the art baseline) |
| Commit all Shiptorio context to repo | done | This folder (`docs/context/`), PRs #6 and #9 |

## PRs at a glance

| PR | What | State |
| --- | --- | --- |
| #1 | Day 1 scaffold on Cloudflare | merged |
| #2 | AGENTS.md | merged |
| #3, #4 | Codex: shared protocol proposal, persistent factory API + issue ingestion | open drafts, built on the old scaffold. Need porting onto `main` |
| #5 | Plan, architecture, art docs, prototypes | merged |
| #6, #9 | docs/context | merged |
| #7 | Item Lab launch pad + solar panel v2 | merged |
| #8 | Pixel Prototype art port into `web/` (incl. HUD) | draft, in progress |

## Codex (outside the Claude project)

Only what Codex has pushed is visible here, not its live session. Codex commits show as "J B" or "Redbars". As of ~17:20 UTC:

| PR | What | State |
| --- | --- | --- |
| #13 | Private preview (password gate), hardened issue → Spark → PR → inspector/rework loop, bounded alarm jobs, stale-check handling | merged. Supersedes #4's fixes |
| #19, #21 | Auto-deploy of `main` verified, `/api/version` shows the live SHA, shiptorio.com + shiptorio.dev live | merged |
| #3, #4 | Old protocol / factory drafts on the pre-#1 scaffold | superseded by #13 and the #14/#17 contract. Close them |

Next for Codex: the "connect the mines" prompt (GitHub App end to end, then Sentry, then email + Stripe test mode).
Prompt packs for Justin live in the Claude project's files under `shiptorio/codex-prompts/`.
