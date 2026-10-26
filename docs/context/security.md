# Security

## Access model

Every live factory belongs to a canonical lowercase `owner/repo`. Preview access
is an outer gate, never repository authorization. `requireUser(request, env)` uses the accounts lane's `currentUser` and revocable session rows from PR #160.
The same GitHub user id and SHA-256 session reference follow browser sockets and
runner capabilities; session revocation is checked in D1 on every access check.
No additional user or session tables are introduced.

`repoAccess(env, user, repo)` requires a current D1 repo row and its installation
row, verifies the installation against GitHub, and checks the user's effective
permission using GitHub's
[repository permission endpoint](https://docs.github.com/en/rest/collaborators/collaborators#get-repository-permissions-for-a-user).
No missing-row fallback discovers or enrolls repos during an access check. GitHub
errors, suspension, unknown permissions and expired sessions fail closed. An
installation token is only used internally; browser responses never contain it.

Positive grants are cached under installation + repo + user in KV for 60 seconds.
The value also contains an absolute expiry; eventual KV reads cannot extend it.
Every check first queries D1 for the live session, `user_repos`,
`user_installations` and the repo/installation rows, so a processed uninstall/removal overrides cached
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
| `POST /webhooks/sentry/:owner/:repo` (also `?repo=...`) | No user cookie; installed target repo and its own Sentry signature secret; target query cannot select another tenant's secret |
| Legacy `/webhooks/sentry` | Only the deployment's pinned/previously linked legacy repo; never first-reader assignment |
| Static assets/SPA | Preview gate; static shell contains no live repo state. Unknown `/api/*` and `/connect/*` return 404 rather than the SPA |
| `/admin`, `/api/admin/flags` | Accounts session plus explicit `ADMIN_LOGINS`; global/per-user feature flag administration only, no factory state |
| `/api/flags` | Effective flags for caller only; query parameters cannot select another user |
| `/api/health` | Coarse D1/KV/health-probe status only; no repo state, credentials or names |
| New data/debug routes | Repo routes inherit shared middleware; global data routes must explicitly authorize |

Source credentials are scoped by canonical repo, with global deployment secrets
available only to the explicitly pinned/previously linked legacy repo. Connecting
or disconnecting one factory does not rewrite a global source-to-repo pointer.
Encrypted storage and credential lifecycle are owned by goal 3 / PR #155; preserve
this access boundary while integrating its installation + repo scope.

Authorization regressions cover two permitted fake users, filtered discovery,
state/jobs/moves/connect denial, websocket upgrade and outbound leaks, foreign
repo messages, uninstallation overriding cached grants, runner capabilities,
GitHub installation mismatch, expired cache values and upstream failure.


## Prompt injection

Issue titles/bodies, PR descriptions, file contents/comments, Sentry errors, PostHog data,
scar reasons, player history and model-generated plans are untrusted evidence. They do
not grant permissions. This protects the Oct 29 local-runner checkpoint.

- `server/src/spark.ts` wraps every user/assistant message with a JSON-escaped
  `UNTRUSTED_DATA_BEGIN` / `UNTRUSTED_DATA_END` envelope. Fake markers, chat role tokens,
  ANSI control characters and bidi controls are neutralized. Evidence is capped at
  64,000 input characters per message, replies at 100,000; planner file observations
  stay at 12,000 and issue observations at 8,000. External districts stay in user data,
  never developer instructions. All decision endpoints use strict Zod output schemas.
- Planner tools are the fixed enum `read_issue`, `read_file`, `assign_job`, `ask_player`.
  Exact candidate paths constrain reads and assignment; unknown fields/actions fail.
  Deck suggestions remain constrained to existing card/option IDs. Model output never
  grants merge permission or bypasses a station.
- `server/src/injection-policy.ts` is the common policy used by the Worker and runner.
  Forbidden paths include Git metadata/workflows, any `.env` filename, dev vars,
  credentials/secrets, private keys, CI/container configuration, package-manager auth,
  and agent instructions/configuration. These are refused even if present in an approved
  file list. Plans reject shell/network/SSH/home-read/credential instructions, are capped
  at 17,000 characters, and contain at most 10 explicit writable paths.
- The runner validates the plan before cloning or launching a harness, then sends it as
  untrusted task data under fixed supervisor restrictions. Codex shell/unified execution,
  web search and multi-agent tools are disabled. The supervisor supplies bounded approved
  file contents as untrusted context, so Codex can still use apply_patch without a shell; Claude gets only Read/Edit/Write/Glob/Grep.
  Subscription authentication remains native to the CLI; no server/provider/push secrets
  are inherited by the coding child. Repository scripts run only in the existing OS
  verification sandbox, with a private home and no network except frozen dependency
  installation without lifecycle scripts.
- Before publication, and again on receipt at the server, scope is capped at 10 files,
  500 changed lines and 200,000 diff characters. Publication still rebuilds approved
  regular-file snapshots in a fresh clone with isolated Git metadata and hooks. The server
  independently reads GitHub's compare patches, requires every patch and its changed-line
  count, rejects missing/truncated/binary evidence and checks the content before a PR
  opens or updates. Hosted dev assembly is also confined to its selected files and the
  same patch policy (its whole-file replacement counts against the line limit).
- New network/process-execution code, credential access, secret-looking additions,
  workflow edits, executable package-manifest changes and recognizable injection overrides fail deterministic security review,
  even if the model would answer pass. Incomplete review evidence also fails. The AI
  reviewer still checks the ordinary semantic correctness of permitted changes.

These are deliberately conservative gates: a legitimate new network integration or
security configuration or package-manifest edit needs a separate human-authored PR. Prompt formatting and
pattern matching are defense in depth, not a proof that a model understands every attack. Quoted injection instructions in security reports also
fail the review station and need human security handling rather than an automatic rework.
Native subscription CLIs retain access to their dedicated authentication home. The runner
OS sandbox from #152 remains in force; these checks do not claim protection against every
obfuscated program. Existing runner installations need the merged code and a restart.
Changes to already-existing executable scripts can still be dangerous, so tests execute
inside the OS boundary and publication never trusts agent-owned metadata.

Validation: `bun test server/test/injection.test.ts` uses a hostile fixture issue with
role spoofing, delimiter escapes, SSH/env exfiltration and workflow-edit instructions.
It proves bounded data framing, fixed tools, scope preservation, forbidden-path/command
rejection and mandatory review findings with scripted model replies. Factory lifecycle
coverage rejects missing evidence and malicious patch contents at the real receipt
boundary before opening a PR, then accepts a normal fix. These deterministic tests do
not claim a live-model red-team evaluation or a fresh native CLI UX test.
