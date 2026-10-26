# Encrypted mine credentials (goal 3, in progress)

PR #97 stored `cred:sentry` / `cred:posthog` globally in KV. PR #135 auto-connected
Worker secrets on map open. New credentials use D1 keyed by installation + repo + kind;
user login is audit metadata, never an authorization boundary. The auth lane must
resolve and authorize the repository before constructing a CredentialScope.

The credential envelope uses AES-256-GCM, a fresh random data key per write, and a
master-key-wrapped data key. Both encryptions authenticate the scope, kind, version.
See [WebCrypto AES-GCM parameters](https://developer.mozilla.org/en-US/docs/Web/API/AesGcmParams).
KV plaintext migrates only for its pinned/previously linked factory, after durable
insert, then is deleted. Revocation tombstones block stale migration and Worker
secret fallback. Overrides are limited to the legacy owner factory, default
`r3dbars/shiptorio`, or explicit SENTRY_REPO / POSTHOG_REPO.

Justin sets the master key; this task does not set or print secret values:

```sh
cd /Users/redbars/shiptorio/server
openssl rand -base64 32 | bunx wrangler secret put CRED_MASTER_KEY --name shiptorio
```

Key version defaults to `1`. Before changing CRED_MASTER_KEY, retain the old version
in the Worker secret CRED_PREVIOUS_KEYS (JSON object mapping versions to base64 keys),
then set CRED_KEY_VERSION to the new version together with the new key. Reads lazily
re-encrypt old envelopes using compare-and-swap. Keep prior keys until all rows have
rotated; never put keys in Wrangler vars, git, logs, chat, or factory state.

Checkpoint: Thu 10/29 mines + Fri 10/30 trust. No shared protocol changes or web-lane edits.

## Account integration and compatibility

Built on Claude's accounts PR #160: authenticated users have a stable GitHub `users.id`,
and repo access comes from that model before D1 resolves an installation id. The writer
is recorded as the numeric user id. Both account-era `cred:<kind>:<repo>` and global
`cred:<kind>` KV formats migrate. The existing `/webhooks/sentry/:owner/:repo` URLs
remain unchanged. Global material stays with its pinned/linked repo, including
`r3dbars/testing` when that is the existing link. Neither credentials nor global links
are written to KV anymore.

Worker-secret overrides still win on the operator factory. Its page identifies an
operator-managed connection; rotating there requires changing the existing Worker
secret. It refuses to pretend a pasted key replaced an active override. Revoke writes
a tombstone even for Worker overrides and works without the master key. Explicitly
reconnecting after removing the override clears the tombstone. Revocation stops new
Shiptorio uses; an already in-flight provider request can complete, and revoking the
provider credential itself remains a separate provider-side action.

D1 migration: `0005_encrypted_credentials.sql` (renumber against main before merge).
The D1 migration runs through the existing Deploy workflow; no new Cloudflare resources.
Connection-page changes live in server-rendered `server/src/connect.ts`, not `web/`.
