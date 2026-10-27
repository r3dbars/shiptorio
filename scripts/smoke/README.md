# Live deployment smoke

Run exactly the Deploy workflow's checks locally:

```sh
bun scripts/smoke/live.ts https://shiptorio.com "$(git rev-parse HEAD)"
# Or a local production-mode Worker (no DEV_LOGIN bypass):
bun scripts/smoke/live.ts http://localhost:8787 "$(git rev-parse HEAD)"
```

Requires APP_PASSWORD, SESSION_SECRET and GitHub App configuration on the target.
For local Wrangler, configure BUILD_SHA to match the expected SHA argument.
The probe sends no credentials and never follows the GitHub redirect. It verifies
GET /access (200 + password form), wrong-password POST /access (401), GET
/auth/login (HTTPS github.com redirect), exact /api/version SHA, public landing,
private factory/API gates, and HTTP → HTTPS on HTTPS targets. Only version
propagation is retried (12 attempts, 5 seconds apart; requests time out in 10s).

Deploy captures the active 100% Worker version before deployment; ambiguous split
traffic aborts before changing production. Deployment or smoke failure runs
`wrangler rollback <saved-version> --name shiptorio --yes`, verifies the active
version and restored site's smoke, and leaves the job failed with an error annotation
and recovery summary. Rollback restores Worker code/assets, not D1/KV/DO data or migrations.
Cancellation and job timeout cannot guarantee recovery; do not cancel an active deploy.

## Rollback drill

Manual Deploy runs can deploy a selected branch to **production shiptorio** and share
main's non-cancelling deployment concurrency group. Use only for an authorized drill:

1. Branch from current main, deliberately return 503 for GET /access in
   `server/src/access.ts`, conditional on a real Cloudflare request header such as
   `cf-ray` so local tests still pass. The deployed smoke must hit the fault.
2. Push the branch; dispatch Deploy using that branch as the workflow ref.
3. Confirm Deploy succeeds, Live smoke fails, rollback restores the saved version,
   the restored smoke passes, and the overall run is red. Record the Actions run
   and version IDs in docs/context/threads.md. Never merge the broken branch.

Verified on production in [Deploy 40428959075](https://github.com/r3dbars/shiptorio/actions/runs/40428959075):
a real branch returned 503 on GET /access, automatic rollback restored the saved
version, every restored smoke passed, and the job stayed red. Full receipt:
[docs/context/threads.md](../../docs/context/threads.md#deploy-smoke--automatic-rollback-codex-2026-10-26).
