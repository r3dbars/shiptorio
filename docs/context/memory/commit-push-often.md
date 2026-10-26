---
name: commit-push-often
description: Justin wants every Shiptorio agent to commit + push as often as possible and check others' PRs/commits first
metadata:
  type: feedback
  modified: 2026-10-26T16:46:20.687Z
---

Justin (2026-10-26): "commit and push as often as possible because I have a lot of agents working on this all at once and we need to kind of coordinate and look at what others are doing."

**Why:** many agents (Claude threads, Codex) work on r3dbars/shiptorio at once; unpushed work is invisible to the others.
**How to apply:** small commits, push right away, merge docs/context PRs to main as you go. Before starting, `git fetch` and look at open PRs and recent main commits. Shared context lives in repo `docs/context/` (index in docs/context/README.md, linked from AGENTS.md). See [[justin-ping-when-blocked]].
