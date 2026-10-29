> **Archived 2026-10-29:** Oct 26 Spark accounting proof. Current budgets are in ../costs.md.

# Live factory Spark accounting proof

Verified 2026-10-26 at 20:32 CDT (2026-10-27 01:32 UTC), on shiptorio.com.

## Recovery

- [PR #269](https://github.com/r3dbars/shiptorio/pull/269) fixes run accounting: planning checks capacity; actual worker dispatch consumes one run. Deploy `40432397609` passed at commit `80c3d8d8e08a14cc13373e1705b5556f4ed8e7b9`.
- The owner's existing UTC counter was 20/20. Raised only the build allowance to 21 through `/admin/signup`, preserving all 20 uses, the factory/repository caps and the $5 factory thinking budget.
- During deployment the Worker was newer than the testing factory engine. `/limits` briefly returned `Unknown factory RPC`; no planning was requested until that factory reported the deployed code and `/limits` returned successfully.

## Real factory operation

Authenticated as the owner and sent the normal websocket player action for **Plan #10: Docs: start a changelog** in `r3dbars/testing`: `choose_move`, option `codex`, tool `plan_runner_job`. The probe did not import the Spark client or write usage rows directly.

Spark scoped `CHANGELOG.md`, read the issue and file, and produced a plan. Job `9a6c023e-d60b-47ed-b9b8-529a04e5601a` reached `awaiting_approval` with `needsApproval: true`. No build or merge was approved for this verification.

Five `spark.call` Worker logs returned HTTP 200 under request `d9988069-aa28-4a1a-a432-68bf12ebd5ee`, each attributed to `r3dbars/testing`, item `gh-10`, between 01:32:26 and 01:32:38 UTC. The factory's own How it thinks log recorded successful scope and plan decisions from `muse-spark-1.3`.

## Accounting and rendered proof

| Metric | Before | After |
| --- | ---: | ---: |
| Factory Spark calls | 0 | 5 |
| Input tokens (includes cached) | 0 | 2,795 |
| Cached input tokens | 0 | 369 |
| Output tokens | 0 | 2,231 |
| Estimated USD | 0 | 0.0125696 |
| Unmeasured calls | 0 | 0 |
| Account build runs used / allowance | 20 / 21 | 20 / 21 |

D1 and the authenticated owner endpoint agree with `/admin`. Integer cost check: `(2795 - 369) * 1250 + 369 * 150 + 2231 * 4250 = 12569600` nano-USD. The cached tokens receive the discounted rate.

The rendered live admin row shows `5 / 2795 / 2231 / $0.0126 / $5.00 / 0 unmeasured`. The rendered owner chip shows approximately $0.01, its accessible label shows $0.0126, and the budget panel shows 5 calls, 2,795 input, 2,231 output and $0.0126. Screenshots were captured from the real signed-in site; the owner tab had no captured console warnings/errors.

The verification ended with the plan behind the approval gate. A later read showed `Player declined this plan`, with build usage still 20/21. The run counter did not change during planning or decline. This verifies the production factory → Meta → D1 → admin/HUD path; it does not claim a local code build, fix PR or launch for issue #10.
