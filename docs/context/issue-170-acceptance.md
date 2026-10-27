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
