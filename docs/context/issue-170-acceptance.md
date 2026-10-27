# Issue #170 live acceptance — partial evidence record

Status: **historical checkpoint recorded; end-to-end acceptance incomplete**.

Read-only recheck at **2026-10-27 11:53 UTC**: [issue #170](https://github.com/r3dbars/shiptorio/issues/170)
is still open. The successful [Deploy run 40498676438](https://github.com/r3dbars/shiptorio/actions/runs/40498676438)
and `https://shiptorio.com/api/version` both identify `61ef296c44ca4a4b22ac1e0a4a92513eff521b92`.
Actions now runs on the public repository; the billing/startup block described below is historical.
This release receipt does not establish a successful #170 build, PR, Launch or rocket.

The sections below are chronological field notes from the earlier attempts. Their process/session IDs,
quota readings, pending-job states and runtime observations describe those checkpoints, not current
operating instructions. No live runner or factory mutation was made for this documentation recheck.

Acceptance target: the real Sentry assignment-status defect in r3dbars/shiptorio passes through
Spark planning, Justin's in-game approval, local Codex, a real PR, the gauntlet and
explicit Launch. Do not implement the issue outside that runner path.

## Initial checkpoint (2026-10-26)

- Main synchronized through docs receipt #242; production code release 678c8f2.
- Issue #170 remains open and unfixed. Writable scope: server/src/sources/sentry.ts
  and server/test/mines.test.ts only. Regression tests must fail on base and pass
  on head; the runner must supply the proof receipt.
- Two historical planning attempts failed with "Issue changed; request a fresh
  plan." No runner job for this issue has completed or opened a PR.
- Existing launchd helper watches Testing. An isolated current-source runner for
  Shiptorio uses the existing dedicated Codex sign-in, with a new repo pairing
  through the existing operator endpoint. Testing's service/config is unchanged.
- Dedicated Codex doctor passes; Claude needs a dedicated sign-in and is not
  offered for this run. No credentials are included in this receipt.
- Plan approval and Launch are still pending. Setup or a passing doctor does not
  establish a successful real build, PR, merge, deployment or rocket.

## Fresh plan prepared

- The actual browser selected "Plan with Codex" for #170, starting job
  555799a7-3ae2-49a4-8e35-c85e668c2253. Spark selected the intended two files and
  produced the in-game "Build #170" approval card at base
  4e8a15b47887e14c8c22af8f19b564f382da2815.
- The plan explicitly requires tests that fail on base and pass on head, followed
  by typecheck, tests and build. The approval card is expanded for Justin to
  inspect and tap; no agent approval or manual implementation substitutes for it.
- Independent current-main reproduction returned `assignedResolved: upsert`,
  confirming the defect remains real before the runner build.

## Runtime blocker before execution

- With the fresh plan awaiting human approval, the isolated runner began receiving
  500/503 from claim, and authenticated read-only runner/status also failed.
  Stopped only this temporary watcher; Testing's launchd helper is unchanged.
- Filtered Worker tail confirmed top-level `exceededCpu` outcomes at 10 ms CPU
  (~330 ms wall time), not evidence of a rejected approval or failed Codex build.
  The Cloudflare dashboard shows Free allowances; read-only script settings show
  no explicit CPU limit. Paid checkout offers 30 s/request, $5/month minimum plus
  usage overages at account scope. No billing/terms acceptance was submitted.
- Independent redactor profiling found quadratic scans on long untrusted tokens.
  PR #247 adds token-start boundaries and an original-fails/fixed-passes watchdog
  regression, without weakening secret redaction. This is a confirmed code-side
  issue, not proof it alone caused every live CPU-limit failure.
- PR #246's linear JSON repair is separately deployed. Recheck runner endpoints
  after the redactor release before claiming the live-loop blocker resolved.
  Human approval, local build, real PR, gauntlet, Launch and rocket remain pending.

## Bounded recovery check after #247

- PR #247 merged as 147802b54b6622a77f3f22a85f25c22547d2ffb7. Deploy
  https://github.com/r3dbars/shiptorio/actions/runs/40426191464 is green and
  `/api/version` returned that exact code SHA.
- Authenticated runner/status, runner/jobs and a fresh factory snapshot now
  succeed. The fresh #170 job remains `awaiting_approval`.
- A current-source isolated runner single-pass claim succeeded with "no approved
  Spark job is ready"; no build or approval occurred. This proves bounded request
  recovery after both performance fixes, not sustained load or a shipped issue.
- No Cloudflare billing change was made. Defer any paid upgrade decision while
  checking this recovery; extra CPU headroom is separate from code correctness.

## Paid runtime headroom approved

- Repeated watching after the bounded recovery still returned 503/403 and request
  timeouts. The redactor fix did not establish sustained Free-tier operation;
  stopped only the isolated watcher again.
- Justin explicitly approved the Workers Paid charges. Cloudflare checkout now
  confirms purchase complete and subscription active: $5/month minimum plus
  usage overages, at account scope. No other Worker code or configuration changed.
- PR #249 separately preserves the password/origin/rate-limit checks on an access
  fast path; it does not substitute for adequate runner runtime headroom.
- After the upgrade, ten consecutive authenticated runner/status requests all
  returned 200, preserving the same awaiting-approval job. Restarted only the
  isolated current-source Shiptorio watcher; no claim errors observed during the
  initial follow-up. The exact approval button is visible in the real game.
- PR #249 deployed green as 40f65897c3b9291afa4c0da6e510bb4468e2483e;
  Deploy https://github.com/r3dbars/shiptorio/actions/runs/40427939355 succeeded
  and the live version matched. No issue #170 build or Launch has happened yet.

## First actual build attempt

- Justin reported approving #170. The server still showed awaiting_approval;
  Root reconnected the real browser and retried that same authorized approval
  through Activity → Build #170 → Approve and build with Codex.
- The game then logged "Plan approved" and "Local codex took the plan", and
  job555799a7-3ae2-49a4-8e35-c85e668c2253 entered running. This establishes
  the actual game-to-runner transition; it does not prove the original tap landed.
- Codex authenticated and attempted the two approved file edits, but its file-edit
  tool failed. It exited zero with no changes; the supervisor rejected the empty
  patch and opened no PR. The model's final message correctly reported no checks.
- Disposable one-file probes reproduce the same edit failure in Documents and
  the system temporary directory. The outer sandbox can write a canary, and the
  same Codex binary's direct apply-patch helper writes successfully under that
  boundary. Explicit checkout directory flags do not fix Codex exec's edit path.
  Diagnosing that path while preserving isolation and the exact issue scope.
- Separately, PR #262 has deterministic regressions for a selected-card approval
  race. The race is proven; it is not established as the cause of Justin's tap.

## Secure Codex interoperability fix

- A direct nested `codex sandbox` probe reproduced `sandbox_apply: Operation not
  permitted` (exit71). The same Codex workspace-write edit succeeds without the
  outer wrapper. Resolving the executable symlink, explicit checkout flags and
  the streaming patch feature did not fix the nested case.
- An externally sandboxed Codex fixture can edit successfully, but removing the
  inner policy would broaden effective dedicated-home/job-root/network access.
  That shortcut is not the production fix.
- PR #272 instead keeps both OS isolation and Codex read-only mode: Codex emits a
  strict edit proposal; the supervisor closes the agent boundary, validates the
  proposal, and applies unique exact replacements only in the approved scope.
  Existing scope/secret/frozen-content/check/proof/publication guards remain.
- Actual production-export compatibility probe passed: real Codex accepted the
  Zod-generated schema, returned edits without changing the tracked fixture, then
  `parseCodexEdits` and `applyCodexEdits` applied answer1 → answer2 in the separate
  verification sandbox. No #170 implementation was written outside the game.
- Independent bounded security review found no material blocker. #272 passed
  the full check and current-head CI, and merged at 436bc65.
- Deploy exposed missing Linux sandbox setup in its test job. #278 guarded one
  unavailable fixture; #282 fixed the shared cause by installing the same bwrap
  and AppArmor boundary required by CI before Deploy tests. Deploy40434908855
  passed at 06b355a, including tests, deployment and live smoke.
- The approval race fix (#262) and bounded runner-card reservation (#276) are
  also deployed in that verified descendant.
- Fresh job72953e55-b71c-4a05-963f-28f1feb66086 is awaiting approval for
  the same two-file Sentry fix. The game reports the owner build quota exhausted
  at 21/21; coordinating recovery with the owner-quota lane. No issue #170 PR
  or Launch exists yet. The watcher subsequently reported heartbeat500 and the
  reloaded game stalled loading: this is under live diagnosis, not acceptance.

## Owner quota recovered; lock timeout isolated

- Owner-quota PR #281 merged at 5a91693; Deploy40435894561 passed. The real
  game no longer shows the exhausted21/21 banner. This preserves the separate
  Meta daily spend limit.
- The same #170 approval card is visible in Activity. Retrying it did not yet
  advance the stored job from awaiting_approval, so no successful handoff is
  claimed.
- Scoped live Worker tail confirmed both Shiptorio and Testing heartbeat500s
  coincide with a Durable Object blockConcurrencyWhile30-second timeout/reset.
  Independent static trace found claimRunner -> patch -> awaited browser
  broadcast -> serialized fresh GitHub authorization can retain that lock while
  waiting on network I/O. A bounded fix and regression are in progress.
- Paused only the idle isolated source watcher during this recovery, reducing
  failing requests. The user's installed Testing service and credentials remain
  untouched. No factory PR or Launch exists yet.

## Lock-timeout fix merged

- PR #294 changes patch delivery to queue the existing ordered, freshly
  authorized browser broadcast without awaiting it inside runner state mutation.
  State save and approval/lease checks remain awaited and atomic.
- Regression holds browser authorization unresolved during two concurrent real
  claims: exactly one job/lease persists and heartbeat completes, with no frame
  before authorization. Revoking the session before releasing the wait sends no
  frame. Restoring the old await fails the test deterministically.
- Independent bounded review found no material blocker. Current-head full CI
  40437123211 and Stranger40437121642 passed at cd57759; merged e05776b.
  Deploy40437854040 is still running. This is not yet live recovery proof.

## Live claim recovery and second actual build

- Deploy40437854040 passed and live version matched e05776b. Restarted only
  the owned source watcher as session45945. Post-deploy tail observed13 successful
  heartbeats for each of Shiptorio and Testing without the earlier lock reset.
  Slow initial websocket upgrade remains separately tracked in PR #305.
- The old729 plan correctly failed its revision guard. Through the actual game,
  requested a fresh plan, reviewed the same exact two-file scope and approved
  jobcaeb4542-d0c3-494c-8180-48bb2f51c8df. The UI logged Plan approved and
  Local codex took the plan; the isolated runner executed real Codex.
- Codex emitted a proposal, but the supervisor rejected added authentication
  fixture configuration under the existing secret-content policy. No provider-key
  or private-key signature was found; no PR or push occurred. The policy stays
  intact. The failed job and retained private proposal establish this boundary.
- Added retry feedback at issuecomment-6432354463: plain payload normalizer
  regressions only, reuse existing imports, leave authentication setup/tests
  unchanged; preserve fail-on-base/pass-on-head and all checks. Requested a new
  Spark plan through the game. Acceptance remains incomplete.

## Merge queue and external Actions blocker

- Smaller retry1a81c386-111d-4445-af52-dffd5e8c6267 passed the patch policy
  and reached supervised typecheck, which failed with exit2. Its stderr summary
  omitted stdout diagnostics; an exact-base disposable replay is collecting the
  actual failure without modifying the live job or issue patch. No #170 PR yet.
- On Justin's request to merge PRs, reviewed-ready #305 and #308 merged with all
  actual current-head gates green; #307 merged by its owner after green checks.
  #287 closed as a duplicate of the already deployed #282 workflow fix.
- New GitHub Actions jobs now fail before any steps due to account billing.
  The authenticated Budgets page explicitly shows Actions budget0 and Usage
  blocked. Asked Justin for a monthly Actions cap; no billing settings changed.
- Deploy40440046398 (#305) and40440013675 (#308) failed before execution;
  no Cloudflare deployment or rollback occurred. Live remains be3a81bc.
  Pending/red/draft PRs remain unmerged. This is not an all-green release.

## Compiler feedback and runtime test failure

- Exact-base replay identified TS2769 in the prior proposal: it expected an
  Item.state named closed, which does not exist. Recorded precise feedback in
  issuecomment-6432497144; no manual issue implementation or type widening.
- Spark produced a new exact-two-file plan asserting only Signal.action.
  Approved it through the actual game; jobf3391af8-9d27-4c04-9124-b6f4f77cb22d
  ran real Codex and passed the security policy and supervised typecheck.
- Its full sandboxed test process exited133 with SIGTRAP: Bun1.4.4 on macOS27
  reported an internal crash after roughly68seconds, around progression tests.
  This is not a passing suite or a published PR. A disposable unchanged-source
  control is investigating the runtime separately, preserving the OS boundary.
- #170 still has no PR and no Launch. GitHub Actions budget approval is pending,
  so required CI and production Deploy cannot complete even after local recovery.

## Bounded runtime controls: no certified replacement

- Unchanged shared/test/progression.test.ts reproduces the Bun1.4.4/macOS27
  trap inside the unchanged verification boundary; outside it all12 tests pass.
  Bun1.4.3 also traps and1.4.2 exits137. TZ=UTC does not resolve1.4.4.
- Disposable Bun1.3.10 passes the focused12 tests/53 assertions inside the same
  boundary, but cannot parse lockfileVersion2 for frozen dependency installation.
  With dependencies prepared frozen by1.4.4, its one full unchanged-base suite
  reports756 passed,35 failed,3 skipped without a panic. The failures involve
  trusted harness fixtures requiring explicit /tmp paths, a local server or
  other resources intentionally unavailable inside the untrusted-job boundary.
- This does not certify1.3.10 as a runner replacement. No sandbox widening,
  lockfile rewrite, global runtime/service change, test-assertion relaxation or
  crash-report upload occurred. The live job/pairing were untouched. A safe
  verification-recipe/runtime solution remains required before a real #170 PR.
- At that checkpoint the PR monitor had no eligible current-head green PRs and
  Actions billing was blocked. Live402a1b94 was released by the branding owner, whose
  separate smoke evidence does not turn the failed Deploy workflow green.

## Acceptance still to prove

1. Reconcile the current issue and runner state, obtain a fresh Spark plan for the approved two-file scope,
   and approve it through the actual game.
2. Observe real local Codex execution and supervised checks, including tests that fail on the base commit
   and pass on the proposed head, without weakening the scope, secret or OS-boundary policies.
3. Verify a real #170 PR and its current-head CI, verify-bay proof and AI review receipts.
4. Use the in-game Launch card, then verify the merge, issue closure, factory rocket and deployed result.

The historical runtime experiments above are evidence of failed or bounded attempts, not approval to
replace the runtime, widen the sandbox or resume a process using an old PID/session handle.

## Reviewed runner release deployed; startup recovery still pending

- [Release batch #362](https://github.com/r3dbars/shiptorio/pull/362) merged as
  `3615a53df7d17db3c7323960a3be43fd4fc1a95d`. Its exact candidate passed
  [full browser/load CI](https://github.com/r3dbars/shiptorio/actions/runs/40581595915),
  [PR CI](https://github.com/r3dbars/shiptorio/actions/runs/40581602302), and
  [Stranger E2E](https://github.com/r3dbars/shiptorio/actions/runs/40581602158).
- [Deploy](https://github.com/r3dbars/shiptorio/actions/runs/40583445850) passed.
  The public version endpoint returned that exact main SHA; anonymous `/api/me`
  returned 401, preserving the password gate.
- The installed runner was verified against that release's HTTPS manifest,
  SHA-256 `44d68bb6e14401b89ef98156beadbf850ca272eaf55acb6653e29045ddf5212e`,
  and Bun 1.4.4. Pairing files were unchanged. No ready/running job existed
  before starting the owned launchd service.
- Startup failed when the dedicated Claude Keychain rejected its saved password.
  The service was stopped to prevent repeated crashes. A disposable Keychain
  confirmed the same stdin quoting works with spaces; dedicated Codex sign-in
  separately remains valid. No real Keychain was reset or recreated.
- This is deployment and installation evidence only. No new #170 build,
  supervised regression receipt, factory PR or Launch has been established.
