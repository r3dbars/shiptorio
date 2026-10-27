# Request helper CPU work (Task 3)

PR #410. Baseline: `origin/main` at `352d3ec8`. No deployment or environment writes.

## Before and after

- HMAC: an import on every verification becomes a bounded isolate-local cache of 16 exact secret/algorithm entries. Pending imports are shared; failures are evicted. Nonextractable sign-only keys, algorithms, signed messages, comparisons, expiry and configured-secret selection stay unchanged.
- Logs: each trace constructs one environment Redactor. The Sentry hook registers decrypted credentials on that same trace-local instance, so later logs share them. Nested traces remain isolated.
- KV: existing successful runner heartbeat/claim console-only policy stays unchanged. Serialize a retained event once before its existing immutable index fanout. No index, retention, deletion-race or error-handling changes.

## Offline controlled fixture

`bun server/scripts/profile-request-helpers.ts` runs synthetic helper workloads with fixed fixture credentials/body and no fetch, Cloudflare calls, runner jobs, console transport or real KV writes. The tick fixture exercises logging helpers only, not the Factory tick implementation. Counts are explicit synthetic inputs, not an observed request mix. Warm both variants and alternate order across 30 samples of 1,000 iterations.

CPU is local whole-process user + system CPU for a batch divided by iterations. p95 below is the quantile of batch means, **not per-request p95**. Wall time is elapsed local time and is reported separately. Other local processes and GC can affect these small timings. These figures do not establish Worker CPU performance.

Recorded locally with Bun 1.4.4 on 2026-10-27:

| Synthetic helper workload | CPU p50 before / after (ms) | CPU p95 before / after (ms) | Wall p95 before / after (ms) |
| --- | --- | --- | --- |
| webhook helpers | 0.02322 / 0.01963 | 0.03368 / 0.02868 | 0.02415 / 0.01876 |
| tick logging helpers | 0.03014 / 0.02087 | 0.03821 / 0.02416 | 0.02943 / 0.02152 |
| heartbeat helpers | 0.01315 / 0.01235 | 0.01469 / 0.01405 | 0.01148 / 0.01088 |
| claim helpers | 0.01435 / 0.01337 | 0.01662 / 0.01631 | 0.01429 / 0.01389 |

## Hosted acceptance still pending

**The 30% Cloudflare p95 CPU reduction target is UNPROVEN.** Root owns the stage lease, deployment and measurement. Compare frozen baseline/candidate versions under the same controlled webhook/tick/heartbeat/claim fixtures, request counts, warm/cold distribution, and bindings. Capture actual Cloudflare CPU samples separately from request wall latency, errors, KV operation counts and external I/O. Preserve raw receipts in the root run; do not infer CPU from response duration or local workerd/process timings.

Task6 owns verification semantics; Task9 owns log schema/redact-before-truncate/error propagation. Their edits must be composed with this lifecycle/cache change in the tested release batch. In particular, Task9 replaces the existing `.value(redact(...))` with cached-redactor `.diagnostic(...)`; this PR preserves the baseline schema to avoid duplicating that rewrite.
