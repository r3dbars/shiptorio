# Spark and the local runner

Cloudflare owns the foreman loop; subscription CLIs stay on your Mac. A player-approved
issue and exact file list become a durable job. A DO alarm gives Spark at most five
turns using `read_issue`, scoped `read_file`, `assign_job`, or `ask_player`. Each tool
request is validated and its reason/result persisted. Invalid tools, unavailable models
or an exhausted budget stop the job; no automatic coding retry or merge follows.

The runner polls outbound HTTPS, claims one lease and uses a fresh clone pinned to the
planned commit. Its supervisor receives a short-lived installation token. The coding
agent receives only its subscription environment, the plan, and the approved paths.
Codex uses workspace-write with no approval bypass; Claude uses restricted file tools.
The supervisor validates paths, regular files, secret patterns and patch size, then runs
typecheck, tests and build. It commits one change and pushes only `shiptorio/runner-*`.
The server checks the actual remote branch, commit ancestry and file scope before
opening a PR. CI alone does not mark runner PRs ready to merge: independent proof,
review and human merge remain required.

## Operator commands

Run from the repository with Bun installed (or prefix these with `npx --yes`):

```sh
bun run runner doctor
bun run runner:control pair
bun run runner:control enqueue 58 codex server/src/engine.ts server/test/engine.test.ts
bun run runner:control status
bun run runner once
```

`runner:control` bootstraps the owner request using existing gitignored
`server/.dev.vars` credentials. Pairing saves an eight-hour, repo-only token in
gitignored `runner/.dev.vars` with mode 0600. Re-pairing revokes the old token. No
credentials belong in Git, chat, CLI arguments or agent logs. Do not give an agent
the control script's environment. Local evidence and isolated clones stay under
gitignored `runner/.work/`. A successful push receipt can be acknowledged again with
`bun run runner retry JOB_UUID` if the network drops before the server responds.

This checkpoint supports explicit operator-approved jobs. Browser swipe/Next Move
approval wiring, continuous monitoring, independent verification/review execution,
scars and usage telemetry are later checkpoints, not implied by a green local build.
