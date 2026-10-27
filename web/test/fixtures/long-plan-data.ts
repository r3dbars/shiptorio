import type { Move } from "@shiptorio/shared";

// Synthetic local review fixture. No live source, credentials, worker or backend requests.
export const longPlan: Move = {
  id: "fixture-approval-170", itemId: "fixture-170", createdAt: 1, kind: "build", stage: "build", attention: "approve",
  title: "Build #170: Keep resolved Sentry issues closed on assignment webhooks",
  why: "Review the complete proposed change before approving this local fixture.",
  url: "https://github.com/example/fixture/issues/170",
  plan: [
    "Files: server/src/sources/sentry.ts, server/test/mines.test.ts",
    "Base commit: a2cebbc5f1b56f11e2fd6e9c95175fb9984a79aa",
    "Fix the local build failure that sent the last attempt back and left the job queued before changing behavior. Keep the change to the two approved files, preserve webhook authentication and storage paths, and verify typecheck, tests and build on the assigned runner branch with a PR, never by pushing main.",
    "When an assignment webhook arrives for an already resolved Sentry issue, update only assignment metadata. Keep the issue resolved and retain its existing resolution timestamp. An assignment event must not reopen work that has already shipped.",
    "For a normal unresolved issue, preserve the current assignment update behavior. Do not broaden issue scope, add another provider integration, or change server authorization and token handling.",
    "Add regression coverage for a resolved issue receiving an assignment event, an unresolved issue receiving the same event, and an explicit reopen event. Include the original state and expected resulting state in each test.",
    "Run the relevant source tests, typecheck and complete build. If any required check fails, report the concrete failure and preserve the patch for review instead of claiming that it shipped.",
    "Final review checkpoint: inspect the diff, verify the approved file scope and base, and open the PR. Human approval and the in-game launch gates still apply. This final paragraph must remain reachable by scrolling the review panel.",
  ],
  options: [
    { id: "approve", label: "Approve plan", recommended: true, actions: [{ tool: "approve_plan", args: { itemId: "fixture-170" }, reason: "Build only this reviewed plan." }] },
    { id: "revise", label: "Revise plan", recommended: false, actions: [] },
  ],
};
