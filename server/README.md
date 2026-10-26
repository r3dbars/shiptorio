# Backend lane: first factory slice

The shared plan is the root `AGENTS.md`. Codex owns this directory and `runner/`;
Claude Code owns `web/`. The existing `src/` Worker delegates factory traffic to
Hono in `server/routes.ts`. Existing map and login routes continue working.

## Frontend connection

Use the same-origin session established by `/auth/login`.

- `GET /api/repos/:owner/:name/factory`: v1 `snapshot`.
- WebSocket at the same path: initial `snapshot`, followed by `patch` and `log`.
- POST at the same path, or send on the socket: a validated `WebToServer` message.
- Schemas and TypeScript types: `@shiptorio/shared` (`shared/src/protocol.ts`).

Factories persist in a per-repository SQLite Durable Object. Browser commands
can place/remove machines, connect belts, and set modules. Cross-origin requests
are rejected. Repository access uses the existing `ALLOWED_LOGINS` gate.
Only authenticated allowed users can read or modify a factory.

A verified `issues.opened` GitHub webhook inserts one ore item per issue number.
Replayed events do not duplicate items or advance the revision. The GitHub App
manifest now requests read access to issues and subscribes to issue events;
existing installed Apps need their permissions and subscriptions updated separately.

Local commands (Node 24):

```sh
npm ci --prefix shared
npm ci
npm run dev
# In another terminal:
npm test
npm run typecheck
npm run typecheck --prefix shared
npm run test:smoke
```

The smoke check uses an isolated `demo/smoke-<uuid>` factory in local storage,
verifies signed issue delivery/replay, authorization, origin checks, and real
WebSocket snapshot/patch delivery. It never deploys or calls a real GitHub repo.
Local dev initializes an empty webhook secret with random bytes; existing values
are preserved. The test reads the local secret without printing it.

## Remaining pipeline work

This slice stops at persistent ore and build controls. No issue is sent to an LLM,
no local runner is dispatched, and `launch_pr` returns a clear error. These need:

1. Meta's confirmed API documentation, endpoint, model ID, and secure `META_API_KEY`
   binding; verify real structured planning responses before enabling scheduling.
2. Spark-controlled triage/routing and the assembler/inspector state transitions.
3. Outbound authenticated local runner, scoped per-job GitHub installation tokens,
   branch pushes, server-created PRs and merge-webhook rocket events. Subscription
   CLIs must only execute on the user's machine.

Do not deploy or change remote Cloudflare resources without explicit authorization.
