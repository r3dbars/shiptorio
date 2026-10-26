# Shared factory protocol

Both lanes import the Zod schemas and inferred TypeScript types from `src/protocol.ts`.
These are the proposed v1 payloads implementing the message names in `AGENTS.md`.
The frontend simulator and real backend should both validate with the same schemas.

Run `npm ci`, `npm test`, and `npm run typecheck` from `shared/` (Node 24).

A browser receives a `snapshot` first. A `patch` replaces the supplied collections;
apply it only when `baseRevision` matches local state and `revision` is greater.
On a gap, reconnect for a snapshot. Repo identity is pinned by the authenticated
connection, never accepted from a browser command. Authentication, authorization,
transition rules, bounded collection sizes and message rate limits belong to the
server; schema validation alone does not provide those checks.

`on_pad` means a PR is awaiting human merge. `launch_pr` requests PR creation;
only a verified merge webhook can set `launched`. Runner installation tokens must
never appear in snapshots, logs or patches. Treat runner output as sensitive and
redact it before producing browser logs. Hosted runners must not advertise user
subscription harnesses; the server enforces that policy.
