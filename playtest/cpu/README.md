# Private CPU comparison adapter (not deployed)

This optional entry is `playtest/cpu/worker.ts`. Production and the existing practice
configuration do not import it. **No deployment, configuration, logging, resource or
secret changes are included. Root must approve an exact bundle and lease.**

`CpuProbe.probe()` is a private service RPC. It takes only bounded operation/sample
labels, an opaque run UUID and expiry; it has no HTTP authentication header. The
normal private practice fetch entry remains available for installation, but HTTP
requests to the CPU control path are denied. A caller must use a private service
binding. No public measurement route or gateway permission change is added here.

## Fixed scope and real paths

Only the existing reserved fixture is usable: `test-newbie` / user `-9001`, repository
`test-fixture/test-newbie` / ID `999001`, installation `18001`. It must already be
installed through the normal private practice setup. `prepare` validates its live
session/repository and pairs the fixture through normal Factory methods, then stores
its credentials only inside the private provider DO. Grants expire within 35 minutes.
Advisor autonomy, no launch permits, no active runner jobs and no active gauntlet items are required. Use the same initial advisor snapshot
and provider/ledger state for each comparison block; setup/reset is outside measurement.

`sample` with sequential IDs 0–299 constructs the real internal application request:

| Operation | Real request/work | Required result |
| --- | --- | --- |
| webhook | `POST /webhooks/github`, actual raw-body fixture HMAC, unique delivery, fixed trusted `issues/opened` issue #101 | 202 accepted, no duplicate shortcut |
| heartbeat | Normal paired runner token, cookies, writer checks; `{"harnesses":["codex"]}` | 200 |
| claim | Same normal runner authentication, empty job queue | 200, `job: null` |
| tick | Schedule the native Factory alarm; run the real superclass alarm/tick | Alarm receipt advances tick |

The tick sample schedules real work; its RPC scheduling CPU is **not** tick CPU. Query
only the Factory object's native `alarm` invocations. Following triage/warmup, the
steady-state fixture is **waiting for player approval**. This is not an active build,
a successful dispatch, or an arbitrary log-heavy synthetic tick. Queue and state
evolution must match between A/B, and the manifest must record the actual phase.
The adapter holds automatic Factory alarms between requested ticks and pauses only
this persona's fixture provider poller while its grant exists. It never runs a CLI,
approves a plan or sends a runner finish/PR/merge action. `end` revokes its pairing.

The private Worker RPC metric includes fixed adapter dispatch and the real app route.
Provider signing/setup uses separate DO RPCs. Adapter signing uses raw `importKey`,
not the candidate helper. Apply these exact files byte-for-byte to both sources.
Do not label this pure HTTP route CPU, gateway CPU, total request-chain CPU or production
performance. Compare actual Worker RPC CPU and separate native Factory alarm CPU.
No p95s are added together.

## Local checks

```
bun x tsc -p playtest/cpu/tsconfig.json
bun test playtest/cpu/manifest.test.ts
node playtest/cpu/check.mjs
bun run check
```

The workerd check builds a temporary local-only driver with a private service binding,
creates isolated local D1/KV/DO fixtures, installs via signed delegation, runs real
webhook/heartbeat/empty-claim/alarm paths, denies replay/unbounded/unknown controls,
checks credential-free result shapes, and asserts zero native provider requests.
It performs no Cloudflare deployment. A matching check is required on both sources.

## Read-only metric contract

The existing load-owner GraphQL helper is reused, never copied with credentials:

```
SHIPTORIO_LOAD_ANALYTICS_HELPER=/absolute/path/tests/load/cf-analytics.ts \
  bun playtest/cpu/read-metrics.ts /absolute/path/cohort.json --read-only
```

A cohort manifest contains `operation`, exact Cloudflare `version`, UTC `start`/`end`,
`expected` invocation count, and for tick the Factory `objectId`. Queries pin
`shiptorio-fixture` + version + exact exclusive operation window. Native tick additionally
pins object ID + `type: alarm`. Worker schema lacks a route/event-type dimension;
**therefore any concurrent private-worker/control traffic invalidates a Worker cohort.**
Polling/status/setup/cleanup must be outside Worker metric windows. Tick status polls
are excluded from DO CPU by the native alarm/object filter. Headerless safe-argument
RPC is the measured outer invocation; internal app requests are never sent to a public
address. Do not enable full invocation logs or change logging permissions/config.

CPU and wall quantiles are microseconds in the verified schema and converted separately
to milliseconds. The projection accepts one successful aggregate group, exact invocation
count, `sampleInterval: 1`, matching source/version/object, finite nonzero CPU p95.
Unknown fields, mixed statuses, sampling, zero-resolution CPU, missing data or count
mismatch yield **unproven**; no raw API records/errors are printed or persisted.
Canary tests cover nested credential fields. No namespace CPU totals or wall-duration
substitutes are accepted. GraphQL quantiles are aggregates; per-request bootstrap
confidence cannot be reconstructed from them.

Proposed sampling: ABBA, each block 50 excluded warmups + 250 measured invocations per
operation (500 measured/operation/source). GraphQL quantiles must be taken over each
complete contiguous cohort, never averaged across smaller quantiles. Report each
block separately, and only pool raw invocation samples if those exist; this adapter
has no raw invocation-log access. Initial warmup is post-deploy warmup, **not proven
cold-isolate classification**. With aggregate quantiles only, report ABBA block values
and spread rather than manufacturing a pooled p95 or confidence interval.

**30% hosted CPU reduction remains UNPROVEN.** The local helper benchmark is unrelated
to hosted acceptance. Root reviews source/config/metric completeness and assigns the
finite exclusive lease before any remote fixture action. GraphQL read capability was
verified read-only for existing private practice telemetry; no A/B run has occurred.
