# Shiptorio operations

Goal 14 · 2026-10-26 · first playable-loop checkpoint: test safely and recover fast.

## Environments and ownership

| | Production | Staging |
| --- | --- | --- |
| URL | https://shiptorio.com | https://shiptorio.dev |
| Worker | `shiptorio` (default config) | `shiptorio-staging` (`--env staging`) |
| D1 | `shiptorio` | `shiptorio-staging` |
| KV | `shiptorio-cache` | `shiptorio-staging-cache` |
| DO | Production `Factory` namespace | Separate staging `Factory` namespace |

Bindings and public vars are repeated explicitly in `server/wrangler.jsonc`.
Staging DOs are created on first deployment; there is no separate DO create command.
Never point staging bindings at production IDs, copy production factory/mine data,
or install the staging GitHub App on production repositories. Use a disposable test
repo and a separate staging GitHub App with callback/webhook URLs on shiptorio.dev.
The Worker serves the same web build. Explicit `?source=sim` works without the backend.
No subscription credentials belong on either Worker. Other Workers are out of scope.

Resources already provisioned for this environment (IDs in Wrangler config). For a
fresh account, these are the exact create commands, run once from the repo root;
replace the staging IDs with the returned IDs before deployment:

```sh
bunx wrangler d1 create shiptorio-staging
bunx wrangler kv namespace create shiptorio-staging-cache
```

## Deploy

From repo root, after `bun install --frozen-lockfile`:

```sh
bun run typecheck && bun test && bun run build
bunx wrangler d1 migrations apply shiptorio-staging --remote --env staging --cwd server
bunx wrangler deploy --env staging --cwd server --var BUILD_SHA:$(git rev-parse HEAD)
curl --fail https://shiptorio.dev/api/health
```

Or Actions → **Staging** → Run workflow → choose the reviewed branch (including
`staging` if maintained). CLI: `gh workflow run staging.yml --ref staging`.
Manual dispatch is intentional: no push trigger, scheduled job or extra automatic
CI minutes. Existing CI stays PR-only with docs skips and cancellation; production
Deploy runs on main with the same checks, skips, cancellation and ten-minute bound.
`DEPLOY_ENABLED=true` and the existing `CLOUDFLARE_API_TOKEN` / `CLOUDFLARE_ACCOUNT_ID`
Actions secrets are needed. Tokens must cover the two Shiptorio Workers and staging
D1/KV; do not broaden access to unrelated Workers. Production: merge the reviewed PR
on green CI, then verify the **Deploy** run and `/api/health`, not just the merge.

Production used to also claim shiptorio.dev. The production config now claims only
shiptorio.com. Staging owns shiptorio.dev; an old production SHA redeploy must retain
this routing separation (see recovery below).

## Secrets and sign-in

Set secrets independently; named environments do not inherit production secrets:

```sh
bunx wrangler secret put SESSION_SECRET --env staging --cwd server
bunx wrangler secret put APP_PASSWORD --env staging --cwd server
bunx wrangler secret put GITHUB_APP_ID --env staging --cwd server
bunx wrangler secret put GITHUB_APP_PRIVATE_KEY --env staging --cwd server
bunx wrangler secret put GITHUB_WEBHOOK_SECRET --env staging --cwd server
bunx wrangler secret put GITHUB_CLIENT_ID --env staging --cwd server
bunx wrangler secret put GITHUB_CLIENT_SECRET --env staging --cwd server
bunx wrangler secret put META_API_KEY --env staging --cwd server
```

The initial staging access/session secrets were generated locally, sent directly to
Cloudflare and retained only in `/Users/redbars/.config/shiptorio/staging.env` (outside git,
mode 0600; parent directory 0700). They are unique to staging. GitHub/Spark secrets are intentionally not
copied. Open `/setup` behind the preview gate to create a separate staging App,
then set its returned secrets with `--env staging`; the setup page's generic commands
must be given that environment. Add its installation only to a disposable repo.
Without those integration secrets the site/health/admin work, but live factory
GitHub sign-in and Spark calls still need staging setup.

Rotate a secret by issuing a new credential at its provider, `secret put NAME` for
the correct environment, test it, then revoke the old provider credential. For
production omit `--env staging`. Never print values in logs, command arguments, PRs
or this document. Rotating SESSION_SECRET signs users and runners out; rotate/pair
again deliberately. APP_PASSWORD changes invalidate preview access. Credential
rotation is not undone safely by a code rollback: verify bindings/secrets afterward.

## Feature flags

Sign in as a GitHub login explicitly listed in `ADMIN_LOGINS`, then open `/admin`
(also behind preview access). `ALLOWED_LOGINS` alone does not grant admin access.
Global overrides and per-user overrides live only in that environment's KV under
`flags:v1:global:NAME` and `flags:v1:user:LOGIN:NAME`. Logins normalize to lowercase.

- `intro`: welcome/replay tour (default on). Explicit simulator URLs remain offline.
- `research`: purchases and new research suggestions (default on). Already-earned
  verification stations keep running; turning a flag off cannot weaken the gauntlet.
- `permits`: new grants, suggestions and autonomous merges (default on). Existing
  grants remain stored but cannot auto-merge while globally off. Disabling a permit
  manually is always possible. Per-user off blocks that user's grant actions;
  background repo automation has no user context and uses the global switch.
- `newFeatures`: default-off slot for subsequent experimental consumers. No unrelated
  features are silently enrolled; new code calls `flagEnabled(env, "newFeatures", login)`.

Global false always wins. Otherwise user true/false overrides global/default.
Choose `inherit` to delete an override. KV is eventually consistent: allow at least
60 seconds across locations, then reload the app. It is not an instant emergency
stop for an already-running merge. Missing/unreadable KV fails closed in deployment;
local test/simulator fixtures without the binding retain defaults.
`GET /api/flags` returns the signed-in user's effective flags, never another user's.
Admin `GET /api/admin/flags?user=LOGIN` returns stored overrides and effective flags;
`POST /api/admin/flags` takes URL-encoded `name`, `value=true|false|inherit`, optional
`user`, a valid admin session, preview cookie and same-origin Origin. Admin writes
emit `flag_changed` with actor/scope/value (no credentials). Reload `/admin` after
propagation to see globals; use the admin API to inspect personal overrides.

## Rollback (code/assets, not data)

Freeze merges/deploys during an incident so the next production Deploy does not
replace the rollback. Inspect versions first:

```sh
bunx wrangler deployments list --cwd server
bunx wrangler versions list --cwd server
# One command, explicit known-good Cloudflare version UUID:
bunx wrangler rollback VERSION_UUID --name shiptorio --yes --cwd server
# Staging:
bunx wrangler rollback VERSION_UUID --env staging --yes --cwd server
```

Actions → **Rollback** → Run on `main`, select `production` or `staging`, paste the
known-good **version UUID**, not a Git SHA. CLI:

```sh
gh workflow run rollback.yml --ref main -f environment=staging -f version=VERSION_UUID
```

It shares the respective deploy concurrency group and checks health after rollback.
No builds, tests, migrations, or recurring jobs are added for rollback. Afterward
check `/api/version` using your preview cookie and health, reload a map, and inspect
logs. Rollbacks may be refused across a DO class migration or removed resource;
never try to force one by deleting a namespace. Worker versions do not undo D1, KV,
or DO writes. Use additive schema changes and preserve compatibility with the last
version. Docs: [Cloudflare rollback limits](https://developers.cloudflare.com/workers/versions-and-deployments/rollbacks/).

Fallback for a known previous Git SHA: use an isolated checkout, install/build that
revision and deploy its artifact with the **current environment bindings/routes**
(review the dry run first). Do not deploy old Wrangler config which could reconnect
production data or reclaim shiptorio.dev. From a checkout with current config:

```sh
# Run from a current checkout. Choose an unused recovery directory and a reviewed SHA.
git worktree add --detach /tmp/shiptorio-recovery PREVIOUS_SHA
cp server/wrangler.jsonc /tmp/shiptorio-recovery/server/wrangler.jsonc
cd /tmp/shiptorio-recovery
bun install --frozen-lockfile
bun run build
bunx wrangler deploy --cwd server --dry-run
bunx wrangler deploy --cwd server --var BUILD_SHA:$(git rev-parse HEAD)
# For staging, add --env staging to both Wrangler commands above.
```

Do not automatically run migrations from the old SHA. Forward-fix incompatible
schema/code instead. Keep a recorded known-good version UUID for one-command recovery.

## Health, uptime and email alerts

`GET /api/health` is public, no-cache, HTTPS-only outside localhost. It returns 200
only when D1 `SELECT 1`, a KV read, and a storage read in dedicated `ops-health`
DO all succeed; each dependency has a three-second deadline. Failures return 503
with coarse status, never exception strings, tokens or repository names. Probe
reads have Cloudflare cost; no external APIs, repo initialization or alarms occur.
This tests dependency reachability, not GitHub, Spark, runner presence or full UX.

Set up two external HTTPS monitors (for example an existing UptimeRobot account):

1. HTTPS URL `https://shiptorio.com/api/health`, expected status 200. Second monitor:
   `https://shiptorio.dev/api/health`. Follow HTTPS, validate TLS, 5-minute interval,
   10-second timeout, alert after two failed probes and on recovery.
2. Add Justin's chosen email as an alert contact, verify that address and attach it
   to both monitors. No preview password, cookies or query-string token is needed.
3. Send the provider's test alert, verify email receipt. In staging only, temporarily
   point a monitor at `/api/health-test-missing` (401), confirm failure/recovery email,
   then restore `/api/health`. Do not break a real dependency to test monitoring.

Monitor setup/email delivery remains an operator step; do not claim an active alert
from merely probing health. No GitHub cron/minutes are needed. If using a paid
Cloudflare Health Check instead, configure HTTPS host/path/status as above, then
Health Checks → Configure an alert → Notification email → select checks and both
status-change triggers → Create. Confirm the account plan covers checks first.
[Cloudflare email setup](https://developers.cloudflare.com/health-checks/how-to/health-checks-notifications/).

## Logs

```sh
bunx wrangler tail shiptorio --format json --cwd server
bunx wrangler tail --env staging --format json --cwd server
```

Read only Shiptorio. Logs may include user inputs/headers; filter locally and never
paste raw request dumps or secret values into chat/PRs. Look for Worker exceptions,
`flag_changed` and alarm errors. Health response deliberately omits error details;
use the correct Worker's tail for diagnosis. Stop tail when finished.

## Backups and restore

Before schema work, save a D1 bookmark and export to a private path outside the repo:

```sh
bunx wrangler d1 time-travel info shiptorio --cwd server
bunx wrangler d1 export shiptorio --remote --output /PRIVATE_PATH/shiptorio.sql --cwd server
# Staging equivalents:
bunx wrangler d1 time-travel info shiptorio-staging --env staging --cwd server
bunx wrangler d1 export shiptorio-staging --remote --env staging --output /PRIVATE_PATH/staging.sql --cwd server
```

For recovery, stop intake/runners first, record the current bookmark (undo point),
choose the incident's last known-good bookmark and explicitly review data loss:

```sh
bunx wrangler d1 time-travel restore shiptorio --bookmark BOOKMARK --cwd server
# Or staging only:
bunx wrangler d1 time-travel restore shiptorio-staging --bookmark BOOKMARK --env staging --cwd server
```

D1 Time Travel is always enabled; inspect the account's retention window before
relying on an older bookmark. [D1 recovery docs](https://developers.cloudflare.com/d1/reference/time-travel/).
Restore/import a SQL export into an empty **test** database first, validate row
counts/schema and health, then plan production recovery. Never blindly import an
export over populated tables. Exports can contain private data; encrypt/restrict
access and never commit them.

D1 restore does not restore KV mine credentials/flags or Factory DO state. KV flags
can be reapplied through `/admin`; mine secrets must be rotated/reconnected. There
is no complete DO snapshot/export/restore tooling in this change. Do not reset a
namespace to recover: it can lose leases, receipts and merge accounting. Preserve
DO data, reconcile GitHub merge/head state and use the data-durability runbook when
available before resuming work. This is a D1 recovery procedure, not a whole-factory
backup guarantee.

## Acceptance evidence

Verified 2026-10-26, approximately 4:28 PM CT:

- [PR #162](https://github.com/r3dbars/shiptorio/pull/162) merged as
  `97831d9227df0bf39d6e350135caf0c29ffae7a3` after
  [CI passed](https://github.com/r3dbars/shiptorio/actions/runs/40404287047).
  Full local check: 234 passed, one platform-specific skip, zero failures;
  typechecks and web build passed.
- [Production Deploy passed](https://github.com/r3dbars/shiptorio/actions/runs/40404450563).
  Both https://shiptorio.com/api/health and https://shiptorio.dev/api/health returned
  200 with D1/KV/DO all `ok` after deployment.
- Staging version `72348b57-23c7-4b4a-b48b-0d6c0c065e9d` served the merged SHA.
  `/admin` returned 200; its real same-origin POST wrote a personal `newFeatures=true`
  override and the read API returned it. This used a temporary seeded staging
  account/session, not an OAuth login or production account. No repos were linked.
- Deployed staging drill version `33f66e14-2a5a-4418-a1ed-0e204d43bdfe` with
  `BUILD_SHA=rollback-drill-97831d9`; observed that marker through `/api/version`.
  Ran the documented one-command `wrangler rollback` to version
  `72348b57-23c7-4b4a-b48b-0d6c0c065e9d`. Afterward `/api/version` returned the
  merged SHA, `/api/health` stayed 200, and the KV flag remained true.
- Reset the override through the admin POST to `inherit`; observed no stored override
  and effective false. Deleted the temporary staging user and session afterward.
- Staging resources are isolated and reachable; no production factory data or secrets
  were copied. Separate staging GitHub/Spark integration secrets still need setup.
  External email monitor setup and email delivery have **not** been performed.
  Rollback was tested through Wrangler, not by spending a separate Actions run.
- No new automatic Actions triggers: Staging/Rollback are manual dispatch only.
  The follow-up evidence edit is docs-only and uses the existing #68 skip rules.
