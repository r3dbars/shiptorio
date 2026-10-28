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

Every push to `dev` deploys staging automatically (Actions → **Staging**; docs-only pushes skip it).
Manual Run workflow still works for any branch: `gh workflow run staging.yml --ref <branch>`. See
`docs/context/branches.md` for the dev → main flow. Production Deploy runs on pushes to `main`.
`DEPLOY_ENABLED=true` and the existing `CLOUDFLARE_API_TOKEN` / `CLOUDFLARE_ACCOUNT_ID`
Actions secrets are needed. Tokens must cover the two Shiptorio Workers and staging
D1/KV; do not broaden access to unrelated Workers. Production: promote `dev` to `main`
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
Cloudflare and retained only in `~/.config/shiptorio/staging.env` (outside git,
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

Sign in as a GitHub login explicitly listed in `ADMIN_LOGINS`, then open `/admin/flags`
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
emit structured `flag.changed` with actor/scope/value (no credentials). Reload `/admin/flags` after
propagation to see globals; use the admin API to inspect personal overrides.

## Rollback (code/assets, not data)

For releases with chunked factory state, preserve `state-storage.ts` in a rollback build.
An older reader cannot interpret its manifest; see Data backup and recovery below.

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
can be reapplied through `/admin/flags`; mine secrets must be rotated/reconnected. There
is no complete DO snapshot/export/restore tooling in this change. Do not reset a
namespace to recover: it can lose leases, receipts and merge accounting. Preserve
DO data, reconcile GitHub merge/head state and use the data backup and recovery procedure below
before resuming work. This is a D1 recovery procedure, not a whole-factory
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


# Data backup and recovery

Only operate on the `shiptorio` Worker and database. No new Cloudflare resource is needed for this
procedure. Run commands from `server/` with the repository's Bun/Wrangler version. Backups contain
private repository text, account/session hashes, and possibly encrypted credentials: store them in
access-controlled storage outside git. Export before migrations or recovery work, and at least daily
while the private beta is active. This is an operator runbook; no automatic backup schedule is enabled.

## D1 backup

```sh
cd server
umask 077
backup_dir=$(mktemp -d "${TMPDIR:-/tmp}/shiptorio-backup.XXXXXX")
bunx wrangler d1 export shiptorio --remote --output "$backup_dir/d1.sql"
git rev-parse HEAD > "$backup_dir/commit.txt"
shasum -a 256 "$backup_dir/d1.sql" > "$backup_dir/SHA256.txt"
```

Copy this directory to the operator's encrypted backup storage and record its time and database ID
(`153f63dc-f65f-4c02-a0b1-6c78b7d6aa08`). Keep daily copies for 30 days and a copy before each migration.
Verify the SQL exists and is nonempty. Never treat an unverified command or an empty file as a backup.
Wrangler's **local export does not accept `--persist-to`**: use a configuration file in the directory
whose `.wrangler/state` you want to export. `--remote` exports D1 only, not Durable Objects or Worker
secrets. [D1 export documentation](https://developers.cloudflare.com/d1/best-practices/import-export-data/).

## Owner factory export

While signed in (including the preview gate), open:

```text
https://shiptorio.com/api/repos/OWNER/REPO/export
```

The download contains `format: shiptorio-factory`, `exportedAt`, a `state` with `schemaVersion`, and
`storage` with UTF-8 `stateBytes`, item/thought counts, thought bytes, and whether state is chunked.
The route requires a current account session, repo membership, a still-installed repo, and a login
matching the repo owner (case-insensitive). Anonymous callers get 401; another owner gets 403 or the
membership guard's 404; absent factories get 404. Organization collaborators cannot export as the
organization owner with this version. A map viewer is not automatically an export owner.

This is a **factory-state snapshot**, not a complete DO database dump. It excludes credentials,
runner pairings/leases/jobs, webhook queues, dismissal books, and launch-credit ledgers. Keep the full
DO through PITR for operational recovery; use JSON for inspecting, migrating, and recovering state
into a separate local copy. Do not replay old queued jobs into production from a JSON snapshot.
Worker secrets must be recovered separately from the operator's secret manager. Recovery must never
silently grant a launch permit or reuse a runner lease.

## Local restore drill (repeatable, no cloud changes)

From the repository root:

```sh
bun server/scripts/durability-drill.ts
```

The script creates **two new temporary directories**, applies all current D1 migrations to the first,
seeds a dummy installation, repo, account and preference, exports with real Wrangler, imports the SQL
into the second, and compares rows plus `PRAGMA foreign_key_check` and `PRAGMA quick_check`.
It then starts real local workerd, restores an old-shaped factory with a large Unicode goal, downloads
it through the real owner export endpoint, restores that JSON into the second local DO store, restarts
the process, and checks every state field equals the download. The drill's local-only Worker entry is
`server/test/fixtures/durability/worker.ts`; production config never references that restore method.
The JSON result prints the temporary directory and measured state size. Port 18793 must be free.

Verified locally on Oct 26, 2026: D1 export/import rows equal, foreign-key check empty, quick check `ok`;
402,041-byte chunked state preserved after JSON restore into a different store and process restart.
A pre-migration production D1 export was also restored into an isolated local directory and upgraded
with migration 0005: 2 repositories and 1 user retained; FK check empty and quick check `ok`.
The remote preflight found zero orphan repositories. The private backup remains outside git.
Migration and export unit tests also exercise every persisted version, unknown nested fields, future
schema rejection, missing chunks, interrupted writes and retry, retention, authorization and headers.

For a real saved SQL backup, **restore to a clean local directory first**, using a minimal local config:

```sh
restore_dir=$(mktemp -d "${TMPDIR:-/tmp}/shiptorio-restore.XXXXXX")
cat > "$restore_dir/wrangler.json" <<'JSON'
{"name":"shiptorio-local-restore","compatibility_date":"2026-10-01","d1_databases":[{"binding":"DB","database_name":"shiptorio","database_id":"153f63dc-f65f-4c02-a0b1-6c78b7d6aa08"}]}
JSON
bunx wrangler d1 execute shiptorio --local --config "$restore_dir/wrangler.json" --file "$backup_dir/d1.sql"
bunx wrangler d1 execute shiptorio --local --config "$restore_dir/wrangler.json" --command "PRAGMA foreign_key_check; PRAGMA quick_check; SELECT count(*) AS repos FROM repos; SELECT count(*) AS users FROM users;"
bunx wrangler d1 export shiptorio --local --config "$restore_dir/wrangler.json" --output "$restore_dir/restored.sql"
```

Check empty FK violations, `quick_check = ok`, expected account/repo counts and selected private rows
against the backup manifest. Apply newer forward migrations to this copy and rerun the checks before
considering a production recovery. Never import old SQL into the populated production database.

## Production recovery and deploy rollback

1. Pause runners and mutation intake for the affected factory; preserve the failed D1 export, DO
   snapshot, current deployment SHA and incident time. Coordinate a maintenance window before recovery.
2. Restore D1 locally and run the drill above. Choose a recovery point that precedes the mistake.
   Cloudflare D1 Time Travel can restore the existing database to a bookmark/time within the account's
   retention period. Inspect it with `bunx wrangler d1 time-travel info shiptorio`. A production restore
   is a separate, deliberate destructive action, not part of this drill or a code rollback.
3. DO state is separate from D1. SQLite-backed DOs provide `getCurrentBookmark`,
   `getBookmarkForTime(timestamp)` and `onNextSessionRestoreBookmark(bookmark)`; the last schedules a
   restore for the next instance/session. Use a narrowly scoped, reviewed maintenance RPC for the
   affected DO only, then force a new session and remove that RPC. Do not reset the namespace or its
   Wrangler migration tag. Restore D1 and DO to compatible points while intake remains paused.
   [DO PITR API](https://developers.cloudflare.com/durable-objects/api/sqlite-storage-api/#pitr-point-in-time-recovery-api),
   [D1 Time Travel](https://developers.cloudflare.com/d1/reference/time-travel/).
4. Reconcile open GitHub PR heads and delivery ledgers, re-pair runners, and verify a factory export,
   the map, and the CI/merge gates before resuming intake. Preserve ledger keys to avoid double credit.
5. Code rollback alone does not roll back data. A release older than the chunked-state reader cannot
   read a chunk manifest. Keep this reader in any rollback build. A future stored `schemaVersion`
   deliberately fails closed instead of being rewritten by old code; restore a compatible snapshot or
   ship a forward migration. Verify the exact merge's Deploy workflow and live version afterward.

## Schema and size policy

- `state` is a server-only persisted contract. Versions 0 (unversioned) → 1 (gauntlet/orbit) → 2 (bounded
  thoughts) run in order on load and commit the migrated state atomically. Do not edit released
  migrations; append a step and add a fixture. Unknown fields survive; invalid/future data is retained
  on disk and causes an error. No deploy should call `deleteAll` or recreate a factory to fix a schema.
- State is measured as UTF-8 JSON, **not total SQLite allocation or provider-billed bytes**. Above
  96 KiB it is split into 16,000 UTF-16-code-unit chunks (at most 64 KiB UTF-8 each), with an atomic
  manifest. Shrinking removes obsolete chunks in the same transaction. This avoids both legacy
  128 KiB value constraints and large single-value writes. Active items are never silently dropped.
- Thought history: newest 40, with lifetime counters retained. Existing history bounds: stage entries
  4,000 / 24 hours, approvals 200, correction notes 100, undo entries 100 / five minutes. Websocket log
  messages are ephemeral. These are bounded recent views, not a permanent audit archive. No additional
  D1 history table is needed for these views. Monitor `stateBytes` from owner exports; unbounded active
  items and runner records still contribute to total DO growth and should be archived separately if
  real factories accumulate substantial completed work. Never trim live tasks or merge-credit ledgers.
- Migration `0005_durability` adds the installation lookup index, PR state/time index and completed
  webhook expiry index. Existing primary keys cover account/repo membership and deck-rule lookups;
  session-user/expiry and PR-head indexes already exist. It preserves old creation times on upsert,
  adds missing core creation/update times, and enforces `repos.installation_id → installations.id`
  with `RESTRICT` plus a non-null repo key. Historical repo/PR creation times are backfilled from the
  earliest available `updated_at`, not invented as exact original dates.
- Account `users/sessions/user_repos/user_installations/user_prefs` are owned by `0004_accounts`.
  Their required data columns and lookup indexes were reviewed; their missing physical user FKs are
  intentionally not retrofitted in this PR while account deletion/credential migrations run concurrently.
  PR caches and muted-rule history may outlive an installation and intentionally have no cascading repo
  FK. Do not add `ON DELETE CASCADE` to histories or use `INSERT OR REPLACE` on parent installations.
- Before applying the core FK migration remotely, check for legacy orphan repos:
  `SELECT r.full_name,r.installation_id FROM repos r LEFT JOIN installations i ON i.id=r.installation_id WHERE i.id IS NULL`.
  The migration aborts on orphans and keeps their rows; repair against GitHub evidence and back up before
  retrying. Do not delete them to make deployment pass. Numbering is checked by CI; rebase/renumber
  unapplied migrations if another PR takes the next number.

## Production observability (Goal 6)

Goal 6 / Oct 26 checkpoint. Applies only to the `shiptorio` Worker. Never target another Worker.

## Find a failure in under a minute

1. Open `/admin` (feature flags remain at `/admin/flags`) as **r3dbars** (a live GitHub session is required). Choose a factory and refresh.
2. Check **errors**, then use its `requestId` to correlate **events**, **spark**, and **webhooks**.
   The snapshot includes the DO release SHA and shows machines, belts, item states, power, and the Foreman decision log. It excludes
   source credentials, runner grants/receipts, issue bodies, and private code.
3. In Sentry, filter `requestId:<id>` or `user.id:r3dbars`; `release` is the deployed git SHA.
4. If persistence is delayed, tail the Worker live using the commands below.

The admin page is read-only except for an explicit, same-origin **Send verification error to Sentry**
button. This returns the Sentry event ID, request ID and SDK flush result. A successful flush alone
is not proof that Sentry indexed the event: check the event in the Shiptorio project.
Admin access is separate from the player allowlist; it uses a live, revocable account session and
only the GitHub login `r3dbars`. Unauthorized requests receive 403.

## Configure Shiptorio's own Sentry project

This monitors **Shiptorio itself**, separate from the Sentry mine that feeds errors from a player's repo.
Create/select a dedicated Shiptorio Sentry project. From the repo root, enter its DSN at the secure prompt:

```sh
cd server
bunx wrangler secret put SHIPTORIO_SENTRY_DSN --name shiptorio
```

No DSN value or auth token belongs in git. The browser retrieves this public ingestion DSN, release,
validated GitHub login and request ID at `/api/telemetry/config`, behind the preview gate. Browser and
Worker share the project and release; the server secret is the single configuration point.
SDK setup is disabled when the DSN is absent. No Sentry management/auth token is required.

The Worker, Durable Object RPCs, alarms, websocket handlers and browser use the official Sentry SDKs.
React's error boundary offers Reload. The browser SDK's default GlobalHandlers capture unhandled
promise rejections. Unexpected factory socket closes report their repo, close code, and clean status;
intentional disposal produces no disconnect event. Browser API breadcrumbs carry response request IDs.
A three-second config timeout keeps telemetry availability from blocking the game indefinitely.

## Logs and retention

`server/wrangler.jsonc` enables Workers Logs with full invocation sampling. Every JSON log contains
`level`, ISO `ts`, `requestId`, and `event`; known `userId`, `repo`, `itemId`, and measured `durationMs`
are included where applicable. Request IDs are generated by the Worker (untrusted inbound IDs are not
accepted), returned as `X-Request-ID`, and propagated across factory RPCs, Spark and GitHub calls.
Queued webhook delivery and runner planning preserve the initiating trace across alarms. Alarm-only
work has a fresh request ID and the factory repo; an actorless webhook/alarm never invents a human user.
Spark/GitHub logs record duration, method and status, never request bodies or auth headers.

The existing `shiptorio-cache` KV holds immutable, redacted diagnostic events for **7 days**. Separate
indexes retain errors, Spark calls, and webhook events even when normal requests are busy. Admin reads
the last 50 entries per category, using a separate index for each selected factory and bulk KV reads. KV is eventually
consistent: cross-location readers can lag about 60 seconds. Workers live tail and Sentry are the faster
path. This is a bounded recent-history view, not a complete audit archive. State snapshots read the DO
but do not boot a new factory, dispatch jobs, or mutate game state.

Redaction runs before console output, KV writes and Sentry transport, including error messages/stacks
and breadcrumbs. It removes credential fields, bearer grants, common token formats, private keys,
cookies, email addresses and labelled URL/query secrets. Sentry request objects are dropped entirely.
Do not add payloads, code, raw headers or prompts to diagnostic fields.

```sh
cd server
bunx wrangler tail shiptorio --format json
bunx wrangler tail shiptorio --format json --status error
bunx wrangler tail shiptorio --format json --search '"level":"error"'
bunx wrangler tail shiptorio --format json --search '"event":"spark.call"'
bunx wrangler tail shiptorio --format json --search '"event":"webhook.processing_failed"'
bunx wrangler tail shiptorio --format json --search '<requestId>'
```

`--status error` selects failed invocations; caught failures may still return 2xx, so also filter structured
error logs. Workers Logs is enabled; no Logpush destination is provisioned. Logpush requires an explicit
storage destination and account entitlement; configure one separately if long-term export is needed.

## Verify a release

Merge only this human-authored PR after green CI. Never merge `shiptorio[bot]` PRs in this workflow.
Wait for GitHub Actions **Deploy** to succeed, then GET `/api/version` through the preview gate and
compare `commit` with the merged SHA. Open `/admin`, choose a real factory, send one verification error,
and confirm its event in Sentry has the same `requestId`, `user.id`, and deployed release SHA.

For local Workers verification with recent Wrangler versions, use
`bunx wrangler dev --local --infer-origin-from-routes false` so localhost is not rewritten to a custom
domain. Local test DSNs and fake credentials belong only in ignored `.dev.vars`.


### Goal 6 verification

Full local checks passed: tests (one existing platform skip), typechecks and web build. In a real local
Workers runtime, the SDK delivered event `bb7fd4379e684c0c9307f69e4d5034bb` to an isolated local envelope
receiver with matching request ID `0b781aa8-14d3-45d0-a4df-e362958ceaee`, `user.id=r3dbars`, and the local
release marker. Browser Playwright checks verified admin refresh/factory selection, simulator rendering,
the React reload boundary, and real SDK envelopes for React errors, unhandled promise rejection and
websocket disconnect. Test-only faults were injected by the browser test, not production endpoints.

Production `SHIPTORIO_SENTRY_DSN` was absent when checked. No Sentry ingestion project/key was borrowed
from a player's mine or the separate inbound-webhook verification. Configure the dedicated secret above,
then verify the forced event in Sentry before calling production Sentry acceptance complete.

### Goal 6 production acceptance — 2026-10-26

- Logging/Sentry/admin PR [#171](https://github.com/r3dbars/shiptorio/pull/171) and rollout
  compatibility fix [#196](https://github.com/r3dbars/shiptorio/pull/196) merged with green CI.
  The latter falls back only when the new tracing RPC is missing, before any business
  operation ran; it never retries a failed business operation. Worker and factory release
  SHAs can differ during rollout. The admin snapshot exposes the factory's actual SHA.
- [Deploy succeeded](https://github.com/r3dbars/shiptorio/actions/runs/40409576278) for
  `017ee6708dfe21a4a29c258f5cfa7a253b5befea`, a verified descendant of both PRs.
  Production `/api/version` returned that exact SHA and `/api/health` reported D1/KV/DO `ok`.
  Signed-in `/admin` refreshed and read the existing testing factory's snapshot.
- Created the dedicated **shiptorio** error-monitoring project in the existing r3dbars
  Sentry organization and installed its DSN only as the `SHIPTORIO_SENTRY_DSN` secret on
  the **shiptorio** Worker. No DSN value is recorded here. The isolated
  `shiptorio-verification` project and incoming Sentry mine remain separate.
- The production admin verification button returned event ID
  `39ce175754824ef0837c6ec46b5009d2` and request ID
  `2843bfbb-729f-447e-b066-751513ff1700`. The event was then observed indexed in
  [SHIPTORIO-1](https://r3dbars.sentry.io/issues/7813781243/) with the matching `requestId`,
  `user.id = r3dbars`, and release `017ee6708dfe21a4a29c258f5cfa7a253b5befea`.
  The issue stream showed it within a minute. Production CSP includes only the configured
  ingestion origin. Browser SDK/error-boundary/rejection/disconnect delivery was separately
  verified against the isolated local envelope receiver.
- Rollout verification caught a temporary old/new RPC mismatch. Audited the GitHub App's
  original failed deliveries from 21:47–21:52 UTC, preserving their exact 64-bit IDs, and
  redelivered all 93 matching events through GitHub. Every event was for r3dbars/shiptorio;
  none targeted the testing job. A read-only production D1 query verified **93 done, zero
  pending**, with zero rows written by the verification query. No factory data was reset,
  and no runner or job was manually restarted or re-paired.

The earlier missing-DSN checkpoint above is now resolved. Future operators can use the
existing verification button and Sentry link; no additional auth token is needed to send
an SDK verification error. Do not use a generic SDK flush result alone as proof of indexing.
