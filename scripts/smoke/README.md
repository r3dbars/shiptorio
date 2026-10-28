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

Production fault drills are currently prohibited by root. Validate locally or on
staging; a future production drill needs a new explicit, serialized approval window.

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

## Chromium render gate

```sh
bun x playwright install --with-deps --no-shell chromium
node scripts/smoke/browser.mjs https://shiptorio.com /tmp/browser-smoke
# Read-only staging verification:
node scripts/smoke/browser.mjs https://shiptorio.dev /tmp/staging-browser-smoke
bun scripts/smoke/validate-browser.mjs # healthy, black, console error, thrown exception fixtures
bun run build && bun scripts/smoke/drill-local.mjs /tmp/local-browser-drill
```

The same probe runs after Live smoke and after automatic/production manual rollback.
Two fresh contexts open `/judge`, start the replay, and inspect the actual shaft
canvas drawing buffer at 390×844 and 1440×900. Sampling happens immediately after
an animation callback, before WebGL discards its non-preserved buffer; it requires
at least 12 quantized colors and 1% lit pixels. HTML/CSS overlays cannot satisfy it.
Console errors and uncaught page exceptions fail the run without an allowlist.
Pixel readback is requested on demand so the observer does not stall every render
frame. A canvas gets up to 30 seconds for software-WebGL startup within the
unchanged 45-second total CLI deadline. Both viewports run in parallel. The probe writes
screenshots plus `results.json` under the given output directory. CI uploads both
rejected and restored evidence as `deploy-browser-smoke-<run id>` even on failure.
Chromium installs before any deployment mutation, so setup failure cannot strand
an unchecked deployment. Manual staging rollback retains its existing health probe.

The local drill serves the real built judge assets, substitutes a deliberate throw
for the built JavaScript entry in memory, verifies both viewports reject that exact
exception, then restores the original assets and repeats the same smoke. It writes
healthy/rejected/restored screenshots and diagnostics without changing built files,
calling providers, deploying Workers, or exercising Cloudflare rollback.

`/judge` runs the simulator and never opens a WebSocket. It cannot prove an
authenticated live factory connection; do not call this probe live-socket proof.

For a **browser-specific** authorized rollback drill, branch from this change and
replace only the Deploy command with build → overwrite the built `index-*.js`
entry with `throw new Error("browser rollback drill")` → server deploy. This
leaves API/version probes healthy while crashing the actual delivered game.
Dispatch that branch, confirm Browser smoke reports the deliberate exception,
confirm the saved version is restored and re-smoked, and keep the run red.
Never merge the fault commit. Run the new probe against the rollback target first:
a pre-existing console error also fails restoration and must be reported honestly.
