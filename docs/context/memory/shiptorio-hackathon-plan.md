---
name: shiptorio-hackathon-plan
description: Justin's Shiptorio plan doc (Meta hackathon Oct 26–Nov 4 2026) and its stack, which differs from the Cloudflare PR #1
metadata:
  type: project
  modified: 2026-10-26T16:20:04.538Z
---

Plan doc: https://claude.ai/artifact/AWJrfEvb9c7BRwvQNcj1XL ("Shiptorio", Claude Doc). Meta AI Developer Hackathon w/ Cerebral Valley, Oct 26 11AM CT – Nov 4 8PM CT; submit by noon Nov 4. Rules: fresh repo, only work done during the event, Meta models central (Muse Spark makes every factory decision; Claude Code/Codex are only "assemblers").

Planned stack: Bun workspaces `shared/` (zod model + protocol), `server/` (Hono + WebSockets, Drizzle, GitHub App, factory engine) on Fly.io, Postgres on Neon, `runner/` (local helper running claude/codex CLIs in git worktrees, dials out to server), `web/` (Vite + React + Three.js pixel-art 3D map; Silkscreen font; GSAP, Howler). `web/src/sim/` fake factory, `?source=sim|live`. Lanes: Codex thread = backend (briefs/codex.md), Justin + Claude Code = web/ UI.

Justin's local repo `~/omni/shiptorio` (plan, docs/ART.md, art prototypes, briefs) was NOT pushed as of the doc; gh login on the Omarchy machine had expired.

As of 2026-10-26 16:20Z: PR #1 on r3dbars/shiptorio is a Cloudflare Worker version (see [[shiptorio-architecture]], [[shiptorio-cloudflare-resources]]) that doesn't match this stack. Coordinator is asking Justin to pick; hold Cloudflare-specific work until then.
