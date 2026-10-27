# Exact-head gauntlet hardening (Task 5)

PR #406 stays **draft / held** until root resolves the policy-read compatibility below.
No production/staging requests, real merges, runner jobs or App permission changes were made by this task.

## Compatible invariants

- CI, verify, AI and human station entries must each occur exactly once. Every machine station and researched check must pass before pad readiness.
- Missing proof and failed researched checks stop downstream review.
- A station result belongs to the inspection object that started it, even when a CI rerun replaces the inspection on the same head.
- GitHub head and base are bracketed around CI evidence reads. Station evidence is refreshed after asynchronous work; merge submits the expected head SHA.
- Reconciliation without an event SHA compares the actual current PR head, discards previous stamps and returns the item to inspecting.
- Launch rechecks complete receipts and fences against replacement of the live inspection during refresh. Human overrule behavior remains as before.

The three new Factory race regressions fail against the original Factory implementation: same-head inspection replacement, force push during file read, and changed-head reconciliation without an event SHA. They pass with the guard changes. Existing old-head AI review, pending/failed rerun and expected-SHA merge tests remain enabled.

## Held authoritative CI policy

A green check with an arbitrary name or a same-name check from another App does not establish required CI coverage. The held change combines classic branch protection (`checks[].context` / `app_id`) and active rulesets (`required_status_checks[].context` / `integration_id`). It requires the configured checks from the configured App on the current head. A legacy commit status cannot impersonate an App-pinned check. An explicit any-App policy continues to allow its configured sources.

Missing checks, skipped required checks, inaccessible classic policy (403/404), empty expected policy and incomplete rules remain pending. The change deliberately does not infer expected checks from whichever checks happen to report first, or hardcode Shiptorio's check names for other repositories.

**Compatibility blocker:** [GitHub's classic status-check protection endpoint](https://docs.github.com/en/rest/branches/branch-protection#get-status-checks-protection) requires Administration read permission. The current App manifest (`server/src/auth.ts`) and permission contract (`server/src/github-lifecycle.ts`) request contents/pull requests/issues write and checks/statuses/metadata read, with no Administration read. [Active branch rules](https://docs.github.com/en/rest/repos/rules#get-rules-for-a-branch) need metadata read, but an empty ruleset result does not describe classic protection.

Root independently reported the current Shiptorio classic policy requires `check`, `selfhost`, and `stranger` from GitHub Actions App 15368. That is a coordination receipt, not an App-token permission test by this task. No broad permission grant or owner-only fallback is implemented here. Root must approve an authoritative readable policy source before the policy commit can be released. Unprotected repositories without an explicit expected check policy also remain held.

## Verification boundaries

All external actions in the focused tests use GitHub/Spark stubs and local Durable Object fixtures. These tests do not prove a production App token can read classic policy, browser Launch rendering, CI enforcement after a final GitHub race, or the separate real #170 acceptance run. GitHub's server-side branch protection remains the final authority when the expected-head merge is submitted.
