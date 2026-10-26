# Security

## Access model

Every live factory belongs to a canonical lowercase `owner/repo`. Preview access
is an outer gate, never repository authorization. `requireUser(request, env)` is
the sole adapter to the accounts lane's user/session model; until its changes land,
it validates the existing signed, expiring session and preview allowlist. There
are no parallel user/session tables in this change.

`repoAccess(env, user, repo)` requires a current D1 repo row and its installation
row, verifies the installation against GitHub, and checks the user's effective
permission using GitHub's
[repository permission endpoint](https://docs.github.com/en/rest/collaborators/collaborators#get-repository-permissions-for-a-user).
No missing-row fallback discovers or enrolls repos during an access check. GitHub
errors, suspension, unknown permissions and expired sessions fail closed. An
installation token is only used internally; browser responses never contain it.

Positive grants are cached under installation + repo + user in KV for 60 seconds.
The value also contains an absolute expiry; eventual KV reads cannot extend it.
Every check first queries D1, so a processed uninstall/removal overrides cached
grants. Collaborator permission revocation may take up to that 60-second cache
window (and GitHub's own propagation delay) to become visible. Cache failures cause
a fresh GitHub check; API failure never converts into permission. D1 is the local
installation inventory; signed lifecycle webhooks revoke removed repos.

The Factory DO independently validates the session, preview cookie, Origin,
requested repo and membership before accepting a websocket. Its attachment stores
only user identity, session expiry, control epoch and repo, with no credentials.
Each move and each outgoing broadcast checks the attachment's repo against DO
state and checks current membership. A message containing another `repo` is refused
before parsing player actions. Legacy sockets lack a repo attachment and close.
Outgoing deliveries retain order while their authorization checks run.

Runner pairing requires a permitted browser user. The resulting expiring bearer
capability includes that user, their session expiry, one repo and a pairing id.
Claim, finish and renew verify repository access as that user; older unbound tokens
are refused and must be paired again. A token cannot target a different repo, or
survive user expiry, allowlist removal or processed repo uninstall.

### Entry-point inventory

| Entry point | Access boundary |
| --- | --- |
| `GET /api/repos` | Signed-in user; results filtered by installation and per-repo permission |
| `/api/repos/:owner/:repo/*` | Shared authorization middleware before any DO RPC, including jobs, runner pairing, factory websocket and future repo endpoints |
| Factory websocket upgrade | Worker check plus independent DO session/preview/Origin/repo/membership check |
| Factory websocket moves/broadcasts | Authenticated repo attachment and current membership; foreign repo messages close the socket |
| `POST /api/runner/:owner/:repo/{claim,finish,renew}` | Signed repo capability, pairing user's access and session expiry; no preview-cookie bypass for other paths |
| `GET/POST /connect/{sentry,posthog}?repo=...` | Explicit repo and current user access before status, credential lookup, save or mine activation; save also checks Origin |
| `GET /api/sources?repo=...` | Explicit authorized repo; scoped source readiness |
| `GET /api/setup/status?repo=...` | Explicit authorized repo; no anonymous global connector status |
| `GET /api/me` | Only the caller's own session login/allowlist status |
| `GET /api/version` | Build SHA only, behind the existing preview gate |
| `/auth/{login,callback,logout}` | Existing OAuth state/session flows; account persistence belongs to accounts lane |
| `/setup`, `/setup/callback` | Disabled once App configured; before configuration also require a signed-in permitted user |
| `POST /webhooks/github` | No user cookie; GitHub HMAC verified before dispatch, delivery dedupe; target DO selected from signed repo, lifecycle events update installation inventory |
| `POST /webhooks/sentry?repo=...` | No user cookie; installed target repo and its own Sentry signature secret; target query cannot select another tenant's secret |
| Legacy `/webhooks/sentry` | Only the deployment's pinned/previously linked legacy repo; never first-reader assignment |
| Static assets/SPA | Preview gate; static shell contains no live repo state. Unknown `/api/*` and `/connect/*` return 404 rather than the SPA |
| Admin/debug routes | None exposed. New repo routes inherit the common middleware; new global data routes must explicitly authorize |

Source credentials are scoped by canonical repo, with global deployment secrets
available only to the explicitly pinned/previously linked legacy repo. Connecting
or disconnecting one factory does not rewrite a global source-to-repo pointer.
Encrypted storage and credential lifecycle are owned by goal 3 / PR #155; preserve
this access boundary while integrating its installation + repo scope.

Authorization regressions cover two permitted fake users, filtered discovery,
state/jobs/moves/connect denial, websocket upgrade and outbound leaks, foreign
repo messages, uninstallation overriding cached grants, runner capabilities,
GitHub installation mismatch, expired cache values and upstream failure.
