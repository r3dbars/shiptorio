# Security

## Pre-hackathon security pass (2026-10-26)

Reviewed every file under `server/src` at baseline
`44942fdfa2431a3903de94f82e5db61dcbafbc86` (63 files), including every Hono
route and the Factory websocket/runner boundaries. The subsequently added
`runner-health.ts` display helper was also reviewed. This is source review plus
deterministic regressions, not a production penetration test.

### Confirmed findings

Each finding has its own fix PR and regression test. PR links are the authority
for merge and CI status; the summary below describes the final behavior.

| Severity | Finding and impact | Fix and regression |
| --- | --- | --- |
| High | Read/triage collaborators inherited mutation authority and could pair a runner that receives a repository write token. | [#270](https://github.com/r3dbars/shiptorio/pull/270): require write/maintain/admin on repo HTTP mutations, all connector pages, every runner request and browser socket commands. `write-authority.test.ts` covers roles, old read-cache isolation, expired grants, provider failure and permission downgrades. |
| Medium | Empire summaries trusted stale sign-in inventory and could disclose a formerly accessible factory. | [#267](https://github.com/r3dbars/shiptorio/pull/267): resolve a revocable session and reauthorize each repo before resolving or querying its Factory. `empire.test.ts` proves denied repos never reach the DO. |
| Medium | Inspection read only the first 100 PR files, allowing unsafe files beyond that page to escape review. | [#271](https://github.com/r3dbars/shiptorio/pull/271): check a second page and fail closed above the supported 100-file limit. `inspection-pagination.test.ts` covers a hidden workflow file, exactly 100 files and upstream failure. |
| Medium | Automatic launch could reuse a docs permit after the current PR changed to another lane. | [#273](https://github.com/r3dbars/shiptorio/pull/273): clear/recompute lane on new heads and recheck files, permit and stable head immediately before automatic merge. `merge-freshness.test.ts` covers changed lane, a head change during file retrieval and a valid docs launch. |

### Requested boundaries checked

- **Routes and ownership:** public auth/waitlist/legal/static routes have deliberate
  public behavior; account data uses the caller's revocable session; repo reads
  require membership, mutations require writer authority, and repo export also
  checks owner identity. Device initiation/polling use an expiring random secret;
  browser approval separately checks write permission. Admin signup, diagnostics
  and flags have explicit operator controls, not arbitrary signed-in access.
- **Factory isolation:** canonical repo lookup uses immutable repository identity;
  HTTP authorization precedes DO access, socket attachments bind repo and session,
  incoming commands and outgoing broadcasts reauthorize, runner capabilities bind
  one repo/user/session, and connector credentials and webhook dedupe are scoped.
- **GitHub and Sentry:** raw-body HMAC verification precedes parsing/dispatch.
  Strict signature syntax and fixed 32-byte comparisons reject malformed input.
  Sentry selects the target repo's credential; legacy delivery is explicitly
  pinned. Signed issue/incident text remains untrusted evidence.
- **Prompt injection:** Spark's planner schema permits only `read_issue`,
  `read_file`, `assign_job`, and `ask_player`. Reads require exact approved paths;
  independent path/plan/diff checks reject secret paths and forbidden changes.
  There is no environment, shell, arbitrary HTTP or secret-reading tool. Prompt
  delimiters alone are not the defense. Existing `injection.test.ts` exercises
  hostile instructions and rejected tool/path requests. Hosted assembly also
  validates paths before publication. Native runner confinement is a separate
  boundary and was not re-audited here.
- **Secrets in logs:** reviewed console, telemetry, model observations, persisted
  activity and socket output paths. Redaction includes configured secrets and
  scoped credentials; support bearer URLs are scrubbed. No additional confirmed
  secret leak was found. Production secret values were not read or probed.

### Validation and limits

Each fix passed `bun run check` (workspace typechecks, tests, web build and runner
bundle) locally. Each source PR must also have successful CI and Stranger E2E
before merging. Browser/load jobs conditionally skipped by CI are not described
as executed. The Stranger suite uses provider/runner fixtures; it is not a live
Spark prompt-injection exercise or a real production runner-to-PR proof.

Positive GitHub grants have a bounded 60-second cache, separately keyed for read
and write authority; processed D1/session revocations override cached grants.
Actual GitHub branch protections, production IAM/secrets and provider behavior
were not independently verified. Installation tokens are repository-scoped, not
branch-scoped, so external branch protection remains important. PRs exceeding
100 changed files now require splitting before Shiptorio can inspect them.

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

Positive grants are cached under installation + repo + user + authority in KV for 60 seconds. Read grants cannot satisfy writer checks.
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

Runner pairing requires a permitted browser user with write, maintain or admin permission. The resulting expiring bearer
capability includes that user, their session expiry, one repo and a pairing id.
Claim, finish, renew and heartbeat verify writer access as that user; older unbound tokens
are refused and must be paired again. A token cannot target a different repo, or
survive user expiry, allowlist removal or processed repo uninstall.

### Entry-point inventory

| Entry point | Access boundary |
| --- | --- |
| `GET /api/repos` | Signed-in user; results filtered by installation and per-repo permission |
| `/api/repos/:owner/:repo/*` | Shared authorization middleware before any DO RPC, including jobs, runner pairing, factory websocket and future repo endpoints |
| `GET /api/repos/:owner/:repo/export` | Common repo authorization plus repository-owner check; export excludes runner leases/pairing credentials |
| Factory websocket upgrade | Worker check plus independent DO session/preview/Origin/repo/membership check |
| Factory websocket moves/broadcasts | Authenticated repo attachment; moves require current writer authority, broadcasts require membership; foreign repo messages close the socket |
| `POST /api/runner/:owner/:repo/{claim,finish,renew,heartbeat}` | Signed repo capability, pairing user's access and session expiry; no preview-cookie bypass for other paths |
| `GET/POST /connect/{sentry,posthog}?repo=...` | Explicit repo and current writer access before status, credential lookup, save or mine activation; save also checks Origin |
| `GET /api/sources?repo=...` | Explicit authorized repo; scoped source readiness |
| `GET /api/setup/status?repo=...` | Explicit authorized repo; no anonymous global connector status |
| `GET /api/me` | Only the caller's own session login/allowlist status |
| `GET /api/version` | Public immutable build SHA only |
| `/auth/{login,callback,logout}` | Existing OAuth state/session flows; account persistence belongs to accounts lane |
| `/setup`, `/setup/callback` | Disabled once App configured; before configuration also require a signed-in permitted user |
| `POST /webhooks/github` | No user cookie; GitHub HMAC verified before dispatch, delivery dedupe; target DO selected from signed repo, lifecycle events update installation inventory |
| `POST /webhooks/sentry/:owner/:repo` (also `?repo=...`) | No user cookie; installed target repo and its own Sentry signature secret; target query cannot select another tenant's secret |
| Legacy `/webhooks/sentry` | Only the deployment's pinned/previously linked legacy repo; never first-reader assignment |
| Static assets/SPA | Preview gate; static shell contains no live repo state. Unknown `/api/*` and `/connect/*` return 404 rather than the SPA |
| `/admin/flags`, `/api/admin/flags` | Accounts session plus explicit `ADMIN_LOGINS`; global/per-user feature flag administration only, no factory state |
| `/api/flags` | Effective flags for caller only; query parameters cannot select another user |
| `/api/health` | Coarse D1/KV/health-probe status only; no repo state, credentials or names |
| `GET /api/empire` | Revocable session and per-repo authorization before each Factory summary |
| `/api/me/{prefs,progress}`, `/settings`, `/api/account/*` | Caller session only; account export, signout and deletion never accept another user identity |
| `/api/runner-device/{start,poll}`, `/runner/pair` | Rate-limited random expiring device capability; signed-in browser with current writer permission approves a repo |
| `/connect/support`, `/webhooks/support/:owner/:repo/:token` | Connector requires writer authority; intake requires the target repo's bearer token |
| `/webhooks/intercom/:owner/:repo` | Target repo's configured signing secret verifies raw payload before intake |
| `/auth/owner-session` | Timestamp-bound proof of SESSION_SECRET plus an existing allowed account; creates a revocable owner-script session |
| `/admin/signup`, `POST /admin`, diagnostics `/admin/*` | Explicit operator authorization; diagnostics use the configured code-level operator policy, distinct from flag `ADMIN_LOGINS` |
| `/api/telemetry/config` | Public client telemetry configuration; ingestion DSN is not a management credential |
| `/waitlist`, `/privacy`, `/terms`, judge/docs/static routes, `/github/installed` | Public signup/content or redirect only; no factory data |
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


## Threat model

Security hardening checkpoint, 2026-10-26. Covers the browser/Worker boundary,
GitHub and Sentry intake, authenticated API actions, and browser rendering. This
is a focused audit, not a claim that every dependency or local harness is safe.

## Assets, actors and entry points

| Asset | Actors and boundary | Enforcement |
| --- | --- | --- |
| Preview access and account sessions | Anonymous Internet clients → `/access`, `/auth/*` | Preview password, signed Secure/HttpOnly cookies, SameSite=Lax (OAuth callback compatibility), Strict form-proof cookie, revocable D1 account sessions |
| Private repo data and player actions | Signed-in browser → repo APIs and Factory websocket | Account repo membership, exact Origin on mutations/upgrades, authenticated socket attachments; tenant-isolation work owns continuing membership/revocation enforcement |
| Authentic signal intake | GitHub/Sentry → webhook POST → D1 delivery record → repo Factory | HMAC-SHA256 before parsing/persistence, fixed 32-byte comparison, strict 64-hex signature syntax, GitHub `sha256=` prefix; deduplicated delivery IDs |
| Integration secrets | Allowed repo member → `/connect/:kind` → scoped KV credential | Account and repo guard, exact Origin, escaped server HTML; secret never returned in snapshots. Environment bindings override KV where supported |
| Browser execution | Issue/PR/Sentry/Spark content → React views or map DOM | React text escaping, `textContent`, CSP, no HTML/Markdown execution of source text |
| Model spending and factory integrity | Allowed player → websocket decisions → Spark/runner/merge | Validated commands, stored card/option IDs, existing approvals and gauntlet; per-IP and per-user action budgets |
| Runner/installation capabilities | Worker → paired outbound local supervisor | Repo-bound bearer token and lease; supervisor-only short-lived GitHub token, separately sandboxed verification and trusted publication. Native coding harness confinement remains a distinct boundary |
| Deployment authority | Maintainer/Actions → Shiptorio Worker and existing D1 | Green checks, `main` deployment workflow, scoped deployment credentials. This change adds no bindings, migrations or other Cloudflare resources |

An issue reporter can influence text inside a correctly signed GitHub envelope;
an application user can influence incident text inside a signed Sentry envelope.
A valid provider signature authenticates delivery, not the trustworthiness of the
text. Spark output is also untrusted. These actors do not start with account,
preview, runner, provider-signing or deployment credentials.

## Findings and mitigations

| Finding | Initial disposition | Mitigation / evidence |
| --- | --- | --- |
| Unlimited preview-password guesses (CWE-307, medium) | Confirmed: a direct client can supply Origin and distinguish 401/303 without throttling | Durable IP auth budget before password comparison; 429 + Retry-After regression. A successful preview login still needs a separate GitHub account session for repo actions |
| Missing global browser response policy | Defense-in-depth gap | Worker policy covers HTML, assets, API, redirects, 401/403/429 and errors; strict script CSP, HSTS on HTTPS, nosniff, no-referrer, denied framing and unused browser capabilities |
| Browser CSRF controls were route-specific | Existing routes had checks; new routes could omit them | Central exact-Origin check for POST/PUT/PATCH/DELETE. Foreign/opaque/missing Origin is refused, including future endpoints. `/access` retains its signed form-proof/privacy-browser fallback |
| Auth/connect/move request abuse | No shared inbound budgets | Durable per-IP and authenticated account budgets, including encoded aliases and commands over multiple sockets |
| Untrusted display text / XSS | No executable source-to-sink path found | Render regressions use hostile issue/incident/PR/Spark strings in NextMove, CheckIn and ActivityTray; HTML is escaped and JavaScript URLs are blocked by installed React |
| Dependency vulnerabilities | `bun audit`: no vulnerabilities in 194 packages | No dependency changes were necessary; rerun when the lockfile changes |

`server/src/security.ts` owns CSP and browser mutation policy;
`server/src/rate-limit.ts` owns budgets; `Factory.securityLimit` persists counters.
`server/test/security.test.ts` exercises the Worker and counter boundary, while
`web/test/security.test.tsx` renders actual components. Existing intake, account,
socket, runner and simulator tests remain required.

## Request budgets

| Class | Per IP / authenticated user per minute | Entry points |
| --- | --- | --- |
| Auth | 20 | `/access` POST, `/auth/*`, `/setup*` |
| Connect | 30 | `/connect/*` GET and POST |
| Socket | 60 | Factory websocket connection attempts |
| Move | 120 | Repo mutation HTTP requests and non-ping browser socket commands |

The Worker uses Hono's decoded routing path, avoiding percent-encoded-prefix
bypasses. IP identity comes only from Cloudflare's overwritten `CF-Connecting-IP`,
never X-Forwarded-For. Account identity comes from the verified server-side
session; sockets retain its account ID and trusted ingress IP. Old sockets use
their authenticated login as a fallback until reconnect. A socket that exceeds
its budget closes with code 1008 before loading factory state or dispatching an
action. Runner bearer-authenticated polling is a separate machine transport.

Counters use dedicated `security:<SHA256(identity)>` objects in the **existing**
Factory namespace, shared across routes, repos and connections. One transactional,
bounded record per subject survives reloads; idle objects run no alarms or Spark
work. Fixed one-minute windows permit bursts near a window boundary. NAT users
share an IP budget. Missing edge IPs share a fail-closed fallback. A distributed
botnet is not stopped by per-IP limits; broader signup/spend quotas are separate
work. Infrastructure errors fail closed with a generic 500, not an allow bypass.

## CSP and rendering compatibility

- Application scripts come from the same origin; no `unsafe-eval` or executable
  inline scripts. Inline event handlers, objects, base URL overrides and framing
  are denied.
- Styles allow inline CSS because React positions map elements through style
  attributes and the server forms contain CSS. Google Fonts styles and font
  binaries are explicitly allowed. Image/media/worker blob sources support Three
  and local browser resources; websocket access is same-origin. Localhost adds
  local websocket ports for development only.
- `/art/prototype` and `/art/item-lab` (including `.html` aliases and trailing
  slashes) are original trusted static prototypes. HTMLRewriter gives their script
  elements a fresh per-response nonce, and only those responses permit the exact
  existing cdnjs Three.js r128 script. Application/API policy stays strict. The
  GitHub setup page alone permits its manifest form to submit to GitHub.
- No `dangerouslySetInnerHTML`, HTML parsing, markdown-to-HTML or dynamic-code
  sink was found in `web/src`. Map pings/labels/popups use `textContent`; canvas
  textures do not interpret text as HTML. Do not pre-escape React strings, which
  would double-encode legitimate text.
- PR links are populated from GitHub API responses. Spark supplies classification,
  plans, rankings and display text, not link destinations. React blocks JavaScript
  hrefs; any future direct `window.open` or new external URL source must validate
  its scheme and intended destination before use.

## Assumptions and remaining boundaries

Production runs only behind Cloudflare with its trusted client-IP header and
HTTPS. This audit does not establish live secret strength or external GitHub
rulesets. A repository-scoped contents-write token has broader GitHub authority
than one branch; supervisor policy is not token-level branch isolation. The
concurrently merged runner hardening confines coding harnesses with an OS sandbox
and dedicated authentication home; verification uses a separate private home.
This web hardening does not independently prove native runner confinement. Dedicated tenant,
runner isolation, credential-encryption and prompt-injection tasks own those
boundaries; this patch preserves their guards rather than replacing them.

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
