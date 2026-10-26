# Shiptorio context

Everything we know about Shiptorio that isn't code, in one place, so every agent (Claude
threads, Codex, whoever) works from the same picture. Start with `AGENTS.md` at the repo
root, then come here.

**Rule:** commit and push often. Lots of agents work on this repo at once. Before you start,
`git fetch`, look at open PRs and recent commits on `main`. When you learn or decide
something, add it here and push.

## Index

| File | What it is |
| --- | --- |
| [decisions.md](decisions.md) | Decisions made so far and open items (who's blocked on what) |
| [memory/](memory/) | Snapshot of the Claude project memory (one fact per file). `memory/MEMORY.md` is its index |
| [threads.md](threads.md) | Short summary of each Claude project thread and what it produced |
| [plan.md](plan.md) | Export of Justin's plan doc (game design, art, 12 items, architecture, build plan, demo script, risks) |
| [plan-transcript.md](plan-transcript.md) | The plan doc's Transcript tab: the full conversation that produced the plan (long) |
| [feedback-factory/](feedback-factory/) | Feedback Factory canvas artboards (layout reference only) |

Also in the repo, once PR #5 merges: `PLAN.md`, `docs/ARCHITECTURE.md`, `docs/ART.md`,
`docs/art-prototype.html` (Pixel Prototype), `docs/item-lab.html` (Item Lab, all 12 items),
`briefs/`.

## Source links (need a claude.ai login)

| Thing | Link |
| --- | --- |
| Plan doc | https://claude.ai/artifact/AWJrfEvb9c7BRwvQNcj1XL |
| Repo handoff doc (local repo files verbatim, same as PR #5) | https://claude.ai/artifact/PEuV9HSPfkw9o4urNiY2nk |
| Pixel Prototype | https://claude.ai/artifact/KGfEwhDLxxu8LMjGkcqNrK |
| Item Lab | https://claude.ai/artifact/1LRgfMxAMrZ5gv1r2dkkKy |
| Feedback Factory canvas (layout only) | https://claude.ai/artifact/HtWP6pHDcYn9TSByR6UJcn |

## Things that override older docs

- Stack is **Cloudflare**, not Fly.io + Neon. Ignore those parts of the plan/architecture docs.
- Art is **pixel 3D, slate/amber, Silkscreen**. The Feedback Factory's brown Factorio palette is out.
- No secrets in this folder, ever. Resource ids (D1, KV) aren't secrets.
