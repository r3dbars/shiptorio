# Durability work (goal 8)

Owner: `codex/data-durability`. Oct 26 checkpoint: preserve the first real factory loop across deploys.

- Server-only persisted state version, ordered load migrations, past-state fixtures.
- Owner-only factory JSON export; D1 backup and local restore drill in `ops.md`.
- D1 migration number will be assigned after checking the auth users/sessions work and latest main.
- No shared wire-model or web edits; no new Cloudflare resources.

This PR is in progress. See its final description and ops runbook for verified results.
