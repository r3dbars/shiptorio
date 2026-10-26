# Encrypted mine credentials (goal 3)

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

Initial setup command (no key material is printed or saved to a file):

```sh
cd /Users/redbars/shiptorio/server
openssl rand -base64 32 | bunx wrangler secret put CRED_MASTER_KEY --name shiptorio --env=""
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

D1 migration: `0006_encrypted_credentials.sql` (renumber against main before merge).
The D1 migration runs through the existing Deploy workflow; no new Cloudflare resources.
Connection-page changes live in server-rendered `server/src/connect.ts`, not `web/`.

Production setup: authorized Wrangler access was available and the secret-name list
confirmed CRED_MASTER_KEY was absent. Generated 32 random bytes directly into
`wrangler secret put` on only the `shiptorio` Worker; upload succeeded. No existing
secrets were replaced, and the key was never printed or written to disk.

## Immutable repository identity (security follow-up to #159)

Names are aliases, not credential ownership. Every mine read/write now resolves an
active D1 repository and installation and uses `installation:<id>:repo-id:<github-id>`
for both storage and authenticated encryption. Missing IDs, archived repos, suspended
installations, mismatched caller IDs, and changed installations fail closed. A rename
within the same installation preserves a connection with proven immutable identity;
a different repository at the old name gets none of its credentials. Retention expiry
removes credentials by the original immutable ID even when another repo owns its name.

Legacy KV and old name-scoped encrypted rows cannot prove their original repository
ID. They are left unread and untouched unless the operator explicitly supplies both
immutable pins for the provider:

- `SENTRY_INSTALLATION_ID` and `SENTRY_REPO_ID`
- `POSTHOG_INSTALLATION_ID` and `POSTHOG_REPO_ID`

These are non-secret GitHub IDs, not names. Worker-secret overrides require the same
pins; `SENTRY_REPO`, `POSTHOG_REPO`, and KV `link:<kind>` alone confer no authority.
The bare Sentry webhook follows only a pinned, currently active identity. A pinned
legacy migration also checks the source name; it never migrates another repo's global
key just because the provider kind matches. New authenticated connections need no
operator pin: the authorized repo's current stable identity binds their envelope.
Unproven old connections require reconnecting or operator identity verification;
this is deliberate rather than guessing ownership from whichever repo owns a name
now. This follow-up changes no live credential values, revocations, pairing, or pins.
