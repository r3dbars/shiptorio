# Branches: dev and main

Justin, 2026-10-28: "dev [is] the spot where all the changes go to. I can test things there and then I can push
into main when I want to." Goal: as fast as possible, so he can iterate.

| Branch | Who merges | CI on its PRs | Deploys to |
| --- | --- | --- | --- |
| `dev` | Any agent, its own PR, as soon as CI is green | check, selfhost, Stranger, CodeQL (~3–6 min) | shiptorio.dev (Staging workflow, on push) |
| `main` | Only a `dev → main` promotion Justin asks for | Everything above + six browser shards + load (~20 min); `full-suite` posts `release-validation` | shiptorio.com (Deploy workflow, on push) |

## Everyday flow

1. Branch from `origin/dev`, open the PR against `dev`.
2. Quick checks go green → merge (squash is fine on `dev`).
3. Staging deploys shiptorio.dev in ~3 min. Justin plays it there.

## New features are on on dev

Justin, 2026-10-28: "can we just always have no flags by default? It's just annoying ... everything just pushed into
dev, I can experiment with it all and see it all working together."

- **Web:** `previewOn()` in `web/src/flags.ts` is true on shiptorio.dev, so every `feature("name")` is on there with no
  URL params. Today that's the simple screen, the floating city art (`artpass`), progress and empire. shiptorio.com
  keeps them off. `?name=0` turns one off anywhere (debugging), `?name=1` turns one on, `?preview=1` / `?preview=0`
  picks the whole dev set on any host (localhost, e2e).
- **Server:** the staging worker sets `FEATURES=all` (`server/wrangler.jsonc`), so every `FLAG_DEFAULTS` flag (brain,
  autonomy, newFeatures, ...) defaults on there. A KV global `false` at /admin/flags is still a kill switch.
- **Clash rule:** the simple screen has no tour (journey pick 1), so on dev a fresh visit goes straight to it; Build as
  you go and the welcome tour play with `?simple=0`. `buildoutOn()` already folds that in.
- **New features:** ship ON on dev from their first PR. Use `feature("name")`, never a bare `?name=1` check.
- **Promoting:** a dev → main promotion keeps prod's defaults. Flipping prod is Justin's call: add the host to
  `PREVIEW_HOSTS`, or flip one feature's default, in its own PR.

## Promote to production

Open https://github.com/r3dbars/shiptorio/compare/main...dev?expand=1 and create the PR (a Claude thread can open it
too). When the full suite is green, merge with **Create a merge commit**. Never squash a promotion: squashing gives
`main` a commit `dev` doesn't have, and the next promotion conflicts. Deploy ships it; check `/api/version`.

## Hotfixes

Still go through `dev`, then promote. If a fix ever lands on `main` first, merge `main` back into `dev` right after.

## Factory PRs

Runner PRs from `shiptorio[bot]` still only launch through the in-game gauntlet and Launch card, never a GitHub merge.
