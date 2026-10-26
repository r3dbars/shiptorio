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
