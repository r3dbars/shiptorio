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

## Promote to production

Open https://github.com/r3dbars/shiptorio/compare/main...dev?expand=1 and create the PR (a Claude thread can open it
too). When the full suite is green, merge with **Create a merge commit**. Never squash a promotion: squashing gives
`main` a commit `dev` doesn't have, and the next promotion conflicts. Deploy ships it; check `/api/version`.

## Hotfixes

Still go through `dev`, then promote. If a fix ever lands on `main` first, merge `main` back into `dev` right after.

## Factory PRs

Runner PRs from `shiptorio[bot]` still only launch through the in-game gauntlet and Launch card, never a GitHub merge.
