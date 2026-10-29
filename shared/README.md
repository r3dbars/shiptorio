# Shared factory protocol

Both lanes import Zod schemas and inferred TypeScript types from `@shiptorio/shared`.
The canonical model is `src/model.ts`; the wire contract is `src/protocol.ts`.
The simulator and live backend use the same payloads. Run `bun install --frozen-lockfile`,
`bun test shared/test`, and `bun run typecheck` from the repository root.

A browser receives `{type: "snapshot", state}` first. A `{type: "patch", patch}`
upserts items, machines and belts by ID. `removed` explicitly deletes those entities;
`districts`, `power`, `science` and `trust` replace the corresponding state fields.
`log` carries `level`, `text`, `at` and optionally `itemId`. These are the payloads
used by `web/src/source/patch.ts` (applyPatch); do not substitute a second revision-based protocol.

Player commands are `place_machine`, `remove_machine`, `connect_belt`, `set_module`,
`route_item` and `launch_pr`. Only a verified merge webhook launches the rocket.
Runner installation tokens belong only in `job_assign`, never in browser messages.
Schemas strip unknown fields; they do not replace authorization, transition checks,
log redaction, message size limits or server enforcement of local-only subscriptions.
