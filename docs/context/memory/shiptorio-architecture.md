---
name: shiptorio-architecture
description: Shiptorio stack and lanes as decided by Justin on 2026-10-26 (Cloudflare + bun workspaces; Claude=web, Codex=backend)
metadata:
  type: project
  modified: 2026-10-26T16:34:59.308Z
---

Justin picked **Cloudflare** over the plan doc's Fly/Neon (2026-10-26: "cloud flare, that is where I have the .com"). Which .com is still unknown (only r3d.bar seen on the account).

Layout (PR #1, branch phase-1-scaffold): bun workspaces `shared/` (zod model + protocol), `server/` (Hono Worker, Factory Durable Object per repo with alarm tick loop + websockets, GitHub App, Spark client on Meta Model API `api.meta.ai/v1` model `muse-spark-1.3`), `web/` (Vite + React + Three.js pixel pass, `?source=sim|live`). Worker serves `web/dist` as assets. AGENTS.md at root is the agent context (kept in sync by whoever changes layout/commands).

Lanes (Justin, 2026-10-26): **Claude Code + Justin own `web/`**; **Codex owns backend** (`server/`, `runner/`). `shared/` changes go in their own PR both see. Don't keep extending server/ unless Justin asks.

**Why:** hackathon plan [[shiptorio-hackathon-plan]]; Justin wants nothing deployed until they say so.
**How to apply:** frontend work in web/; ask before deploys or CF resource changes. See [[shiptorio-cloudflare-resources]], [[shiptorio-design-reference]].
