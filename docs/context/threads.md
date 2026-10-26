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
| Design Shiptorio's verification loop one-pager | working | `docs/LOOP.md` + `docs/loop.html` (live: https://claude.ai/artifact/3thVDxNxToYkyKTTqoFnbr). The verification gauntlet (CI inspector → verify bay → AI review → launch pad → orbit watch), rework belt with scar tags, promote-a-check, research stations, click-to-act station panel. PRODUCT.md updated (stages, tools, contract, web). |

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

Only what Codex has pushed is visible here, not its live session. All Codex commits are
authored "J B". As of ~16:55 UTC its last push was 16:42.

| Branch / PR | What | State |
| --- | --- | --- |
| `codex/shared-protocol` / #3 | Protocol proposal. Last commit (16:42) merged #1's layout in and kept only `shared/README.md` + `shared/test/protocol.test.ts` on top of main's contract | Draft. Close to mergeable: needs main merged in (it predates the docs PRs) |
| `codex/backend-setup` / #4 | Persistent Factory DO, authenticated routes, websocket snapshots/patches, signed `issues` webhook ingestion with delivery dedup, rejects unset webhook secret | Draft, still on the old single-Worker scaffold. **Overlaps main's `server/src/factory.ts` + `index.ts`**, so it has to be ported, not merged |

Overlap to watch: #4 vs main's server (same features, two implementations). Codex owns
`server/`, so the port should keep main's structure and add #4's extras (delivery dedup,
secret check, origin checks, tests). Claude threads aren't working in `server/` right now.
