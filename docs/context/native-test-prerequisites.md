# Native test prerequisites (Task10)

The runner's production sandbox policy is unchanged. Tests share
`runner/test/native-prerequisite.ts` for prerequisite handling:

- Local Linux without git or bubblewrap prints `LOCAL PREREQUISITE SKIP` and
  explicitly says real boundary coverage was NOT executed. The native installer,
  subscription-login, Codex-edit and Linux isolation fixtures skip together.
- Linux CI without either prerequisite fails during fixture import, even with
  `SHIPTORIO_CHECK_SANDBOX=1`. Existing CI installation of bubblewrap and real
  Linux isolation tests remain mandatory. Presence alone is no proof: installed
  but broken bubblewrap still reaches the real boundary and fails.
- macOS continues to exercise real Seatbelt tests. Nested verification retains
  its existing recursion guard; unsupported-platform rejection coverage remains.

Use `bun run test:parallel` for the same two isolated Bun workers introduced by
PR #370. Each file gets an isolated global/module registry; tests are not concurrent
inside a file, so global fetch mocks and env fixtures retain their isolation.
No workflow scheduling, retry, timeout, production policy or test assertion was
weakened. No flake was reproduced in this task's successful runs; none was
quarantined or disabled.

## Local observations

macOS, Bun 1.4.4, base `352d3ec861049131fe617dd6782362c5721180ec`.
Single observations on a shared machine with many concurrent task chats. These
are wall times, not CPU savings or controlled performance acceptance.

| Run | Cases | Pass / skip / fail | Wall |
| --- | ---: | --- | ---: |
| Before, serial | 949 | 947 / 2 / 0 | 97.52s |
| Before, two workers | 949 | 947 / 2 / 0 | 53.63s |
| After, two workers | 951 | 949 / 2 / 0 | 53.03s |

The baseline JUnit test-name/class/skip multisets are identical. The after run
retains every original case and adds only the two prerequisite regressions.
53.63s versus 53.03s at the same worker count is treated as unchanged, not an
additional speedup. The serial-to-parallel difference comes from #370's existing
isolated-worker mode, now exposed as a local command.
Full `bun run check` after the change passed 949 tests, two platform skips and
zero failures, plus all workspace typechecks and build (103.18s combined).

The pure gate matrix and subprocess initialization checks cover missing local
and CI prerequisites, including the nested flag. Those fixture simulations do
not prove real Linux isolation. Root's frozen release CI must execute the real
bubblewrap suite before merge. This task does not independently dispatch a
browser/load/Stranger suite, merge, deploy or modify Cloudflare resources.
