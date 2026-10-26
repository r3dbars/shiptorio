---
name: shiptorio-codex-handoff
description: Codex is Shiptorio's backend lane; its context lives in AGENTS.md (PR #2) plus a paste prompt in project files
metadata:
  type: project
  modified: 2026-10-26T16:24:58.440Z
---

2026-10-26: Justin is handing Shiptorio context to Codex. AGENTS.md at repo root (merged to main via PR #2 on 2026-10-26) summarizes the plan doc, the Cloudflare stack choice, lanes, rules. Paste prompt: /mnt/project-files/shiptorio/codex-handoff.md.

**Why:** Codex can't open claude.ai links, so AGENTS.md is its only view of the plan.
**How to apply:** When the layout, commands or stack change (e.g. PR #1 reshape into shared/server/web), update AGENTS.md too. See [[shiptorio-hackathon-plan]], [[shiptorio-architecture]].
