> Archived 2026-10-29: from the 3D map era (day one plan, island map, build mode). Not how Shiptorio works today; see [docs/VISION.md](../../../VISION.md).

# Codex lane: server, runner, connectors, Spark

Read `AGENTS.md` and `PLAN.md` first.

> **Stack update (Oct 26):** the server is a Cloudflare Worker (Hono, Durable Objects, D1, KV), not Fly.io with
> Postgres on Neon. `AGENTS.md` has the current layout and commands. The rest of this brief still applies.

## You own

- `server/`: Bun + Hono, WebSockets, Postgres (Neon) via Drizzle, GitHub App auth and webhooks, deployed on Fly.io
- `runner/`: one program that runs hosted (Spark workers) or on a user's machine (adds `claude` and `codex` machines)
- Connectors: Sentry webhook + MCP, inbound email webhook, PostHog, GitHub Issues
- The Spark client (Meta API with Baseten failover) and the Spark agent loop
- The Codex machine adapter (`codex exec --json` → machine status events)

## Contract with the map

The map only reads server state over WebSocket and sends player actions back. Put every message type in
`shared/` before using it. Minimum set for Tue 10/27:

- `District` (path, bounds on the grid, health)
- `Ore` (source, title, payload ref, district)
- `Machine` (kind, harness, power, position, status, queue)
- `Belt` (from, to, item type)
- `Item` (task spec moving along a belt, with state)
- `Pr` (number, url, district, status)

## Checkpoints

- **Mon 10/26:** GitHub App; a GitHub issue → Spark agent in a worktree → real PR on the demo app.
- **Tue 10/27:** districts computed from the repo tree; issues published as ore over WebSocket.
- **Wed 10/28:** splitter and inspector machines; rework loop with the failure attached.
- **Thu 10/29:** Sentry, inbox, PostHog; email ↔ Sentry matching; local runner with the Codex adapter.
- **Fri 10/30:** power sources, load balancing, API ↔ Baseten failover.
