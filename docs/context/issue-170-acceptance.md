# Issue #170 live acceptance

Goal: the real Sentry assignment-status defect in r3dbars/shiptorio passes through
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
