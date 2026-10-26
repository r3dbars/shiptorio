# GitHub App lifecycle

Goal 9, Mon Oct 26 GitHub App checkpoint. Lifecycle delivery is signature-verified,
deduplicated in D1, and durably queued on the `github-installations` coordinator.
Only a completed transition marks the delivery done; partial failures retry.

## Events and behavior

| Event / action | Behavior |
| --- | --- |
| `installation.created` | Save installation and permissions; register immutable repo IDs; restore retained factories, even when reinstalling gives a different installation ID; enqueue issue backfill. Grant the installing Shiptorio user access to the selected repos. |
| `installation.deleted` | Mark installation deleted and invalidate token generation; remove player repo/installation grants; archive each factory and revoke its runner pairing. |
| `installation.suspend` | Mark suspended; invalidate tokens; stop production alarms and runner work. Retain data without a deletion deadline. |
| `installation.unsuspend` | Mark active, restore active factories even when the payload omits repositories, recheck permissions, and resume backfill/work. Previously removed repos stay archived. |
| `installation.new_permissions_accepted` | Store accepted permissions, invalidate tokens, clear the permission pause when all required permissions exist, and resume work. |
| `installation_repositories.added` | Register by repo ID and restore retained data; recheck installation permissions and enqueue backfill. |
| `installation_repositories.removed` | Remove player grants and archive only the removed repo, matching its ID even if its name changed. Invalidate installation tokens. |
| `repository.renamed` | Preserve the same ID-keyed factory; update the canonical name, D1 PR/decision/player references, factory metadata, and ore fingerprints. Invalidate the old runner pairing and plans. |
| `repository.transferred` | Look up the installation at the new owner/name. Preserve factory identity if accessible, replace the installation ID and clear inherited player grants (sign in again to refresh access); otherwise archive. Transient API failures retry instead of guessing the repo is gone. |
| `repository.deleted` | Archive the repository and remove its player grants. GitHub repository IDs are not reused; recreating a name is not restoration of the deleted repository. |
| `github_app_authorization.revoked` | Requires no installation/repository in the payload. Delete the sender's sessions and cached player reach; record a revocation timestamp so older browser sockets/cookies cannot perform actions. Keep organization installations and other players intact. |

Other repository actions are ignored. Existing issues, comments, pushes, PR/review and
check events continue through the repository's own durable queue.

## Stable identity and migration

HTTP URLs remain `owner/name`; every factory lookup resolves D1 `repos.repo_id` to
`FACTORY.idFromName("repo:<GitHub repository ID>")`. Names are display/routing data.
Existing rows are upgraded lazily on use or from a lifecycle payload containing the ID.
A legacy row without an ID resolves it with an installation token while access exists.
After uninstall, the retained name-keyed factory can instead migrate on reinstall.

Migration freezes the legacy object and closes old sockets, imports **all** durable
keys atomically (state, jobs, permits, decisions, delivery queue and dedupe state), then
removes the legacy private copy and switches the D1 pointer. Import has a durable
completion marker; a retry after any RPC interruption preserves the destination.
The old object retains only a routing tombstone and cannot resume work.

Rename/transfer revokes pairing and fails outstanding plans so an agent cannot publish
with a task approved under an old repository identity. Re-pair and approve a fresh plan.
Per-repository third-party connector URLs/credentials use names: reconnect those sources
at their new name after a rename or transfer; GitHub events use the new canonical name.

## Archive and retention policy

Removal/uninstall/deletion stores `archived_at` and an explicit reason. Production ticks,
source polling, runner claims/receipts and player actions stop; the runner pairing is
revoked and active planning/build leases fail. Archived repos leave the selectable list.
Cached installation credentials are invalidated across isolates using D1 token generations.

Data is retained for **30 days from the first archive transition**. Redelivery does not
extend this deadline. The only alarm remaining is a retention wake-up; it does no factory
work. On expiry it deletes factory storage, D1 repo/PR/decision records, saved per-repo
Sentry/PostHog credentials, and an orphaned deleted-installation record. It also removes
legacy shared connector credentials if they are linked to that repo. Worker secrets are
operator-managed configuration and are not deleted by retention.

Reinstall/re-add of the **same repository ID before expiry** restores progress and cancels
the deletion alarm. Pair the runner again. After expiry it starts with a fresh factory.
Suspension and permission pauses have no 30-day deletion timer. GitHub authorization
revocation affects the player, not the organization's retained factory data.

## Tokens and permission drift

Installation tokens live in isolate memory, never D1/KV, logs, or factory snapshots.
Cache keys separate App credentials, installation and requested permission/repository
scope; concurrent refreshes share one request. Tokens refresh **60 seconds before GitHub's
`expires_at`**. Runner credentials keep their repository/contents-only scope.
Every acquisition and GitHub request checks the installation generation/status; repo
API calls also check archive/installation ownership. Revocation removes cached token
values; hashed token fingerprints retain only refresh metadata for outstanding calls.

A GitHub **401 or 403** on an installation-authenticated request invalidates the cached
token and refetches/retries **once**, then throws the final status. Authorization errors
are not swallowed as missing files/branches. JWT/user-token calls do not enter that retry.

Required permissions: `contents: write`, `pull_requests: write`, `issues: write`,
`checks: read`, `statuses: read`, `metadata: read`. Missing permissions pause production
and populate the existing GitHub source card (`needs_action`) with the exact missing
levels, instructions, and an installation-specific link:

- Personal: `https://github.com/settings/installations/<installation ID>`
- Organization: `https://github.com/organizations/<account>/settings/installations/<installation ID>`

Existing installations without stored permission metadata are checked on first use.
`new_permissions_accepted` clears the card/pause after the requirements are satisfied.

## App setup and verification

New `/setup` manifests subscribe to `repository` and `github_app_authorization` alongside
the existing issue/PR/check/push events. GitHub automatically sends installation lifecycle
events. **For an already-created App**, its owner must enable Repository events in
GitHub App settings; deploying a new manifest does not alter an existing App registration.

Fixture tests: `server/test/github-lifecycle.test.ts` uses real migrated SQLite behind
D1 and the real Factory methods for every event above, plus retention, restore and
migration. `server/test/github-token.test.ts` covers scope isolation, refresh, single-flight
issuance, generation invalidation and bounded 401/403 retries. Intake tests cover HMAC,
durable enqueue, delivery dedupe, and revocation without an installation ID.

GitHub references: [webhook payloads](https://docs.github.com/en/webhooks/webhook-events-and-payloads),
[installation tokens](https://docs.github.com/en/apps/creating-github-apps/authenticating-with-a-github-app/generating-an-installation-access-token-for-a-github-app),
[permission updates](https://docs.github.com/en/apps/creating-github-apps/about-creating-github-apps/best-practices-for-creating-a-github-app).
