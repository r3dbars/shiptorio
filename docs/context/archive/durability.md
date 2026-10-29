> **Archived 2026-10-29:** goal-8 checkpoint notes (PR #157). Current recovery steps are in ../ops.md.

# Durability checkpoint (goal 8)

`codex/data-durability` / PR #157, Oct 26 first real-factory loop checkpoint.

- Auth PR #160 owns `0004_accounts`; durability follows with `0005_durability` and does not rebuild
  account tables. Core upserts preserve creation times instead of replacing parent installations.
- Server-only stored `schemaVersion`, ordered atomic migrations, fixtures, bounded thought history,
  chunked large-state writes, measured owner export. Shared/browser protocol and web lane unchanged.
- Backup/restore procedures and the local real-Wrangler/workerd drill: [ops.md](../ops.md).
- Verified local drill: 402,041-byte Unicode state exported, restored into a separate local DO store,
  then loaded after process restart; D1 export/import rows equal, FK check empty, quick check OK.
- No Cloudflare resource created, no production restore performed, no automatic backup schedule added.
