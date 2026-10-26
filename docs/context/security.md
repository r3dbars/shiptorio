# Threat model

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
than one branch; supervisor policy is not token-level branch isolation. Coding
harnesses use native restrictions with the operator's HOME, while verification
uses a separate OS sandbox. Do not claim those are equivalent or that this web
hardening proves native harness filesystem-read confinement. Dedicated tenant,
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
