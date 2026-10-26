# Shiptorio operations: backup and restore

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
