---
name: shiptorio-claude-doc
description: Justin's Shiptorio Claude docs (main doc + repo handoff doc);  main doc (design + architecture + build plan) lives at claude.ai/artifact/AWJrfEvb9c7BRwvQNcj1XL
metadata:
  type: reference
  modified: 2026-10-26T16:19:16.720Z
---

Shiptorio Claude doc: https://claude.ai/artifact/AWJrfEvb9c7BRwvQNcj1XL (tabs: "Shiptorio" and "Transcript"). Found 2026-10-26.

Covers: Meta AI Developer Hackathon (Oct 26 to Nov 4, submit by noon Wed Nov 4), Muse Spark makes all factory decisions, game design (ore/power/machines, science, quality tiers, trust), pixel-art direction, 12 items, architecture, day-by-day build plan, 3-min demo script, risks.

Heads up: the doc's architecture is Bun + Hono server on Fly.io, Postgres on Neon, a local runner helper, Vite/React/Three.js web. That differs from the earlier Cloudflare Worker + D1 plan in shiptorio#1. Treat the doc as the newer source unless Justin says otherwise.

Related art artifacts linked from the doc: Pixel Prototype https://claude.ai/artifact/KGfEwhDLxxu8LMjGkcqNrK, Item Lab https://claude.ai/artifact/1LRgfMxAMrZ5gv1r2dkkKy, mockups https://claude.ai/artifact/8L5PrtJ4RfMSpDfMUmcSrA. See [[shiptorio-repo]].

Repo handoff doc: https://claude.ai/artifact/PEuV9HSPfkw9o4urNiY2nk (made 2026-10-26). Every text file of the local repo verbatim (README, PLAN, AGENTS, briefs/, docs/ARCHITECTURE.md, docs/ART.md, smoke script) plus which artifacts to save as docs/art-prototype.html and docs/item-lab.html. Original local folder on Justin's other computer: ~/omni/shiptorio. Use it to recreate the repo without that machine.
