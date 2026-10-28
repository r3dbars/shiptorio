# Hosted staging burst test

`run.ts` remains the local Wrangler regression/CPU-sampling benchmark. It does not
prove hosted performance. `hosted.ts` only accepts exactly `https://shiptorio.dev`,
does not follow HTTP/WS redirects, and never seeds with local auth bypasses.

```sh
bun tests/load/hosted.ts --preflight
LOAD_FIXTURES_FILE=/private/path/staging-load.json LOAD_REPORT=test-results/before.json bun tests/load/hosted.ts
# Deploy the single measured bottleneck fix with Staging, then:
LOAD_FIXTURES_FILE=/private/path/staging-load.json LOAD_REPORT=test-results/after.json bun tests/load/hosted.ts
```

The private fixture file is an array of **50** objects:

```json
[{"repo":"r3dbars/shiptorio-load-crowd","cookie":"<staging-only Cookie header>","machineId":"load-probe-1"}]
```

Repeat entries to model sockets viewing the same factory, or use independent repos.
Provision fixtures through the staging GitHub App with no runners, pending work,
real external integrations, or paid model credentials. Each named `load-probe-*`
machine must exist and be idle. The harness moves these machines to remote vacant
coordinates every 30 seconds; use disposable factories. It does not create repos,
users, credentials, machines, or Cloudflare resources. Keep fixture files outside Git.
A repo naming restriction reduces accidents but does not itself prove isolation;
operators must verify the staging App/fixtures cannot trigger production jobs.

The default cold connection burst opens the 50 configured signed-in sockets.
Set `LOAD_SUPPLEMENTAL_OBSERVERS=200` only for the separately labeled beyond-target
stress profile, which adds 200 authenticated live observers. The existing before/after
receipts used that 250-socket stress profile; they do not measure the isolated
requested product profile of 200 judge HTTP viewers plus 50 factory sockets. No forged source-IP headers,
security exemptions, reconnects, or retries are used. One source IP or account
exceeding the 60 upgrades/min budget will fail this scenario; measure that failure
before deciding whether to change policy. For a geographically distributed audience,
use genuinely separate load-generator source IPs (not currently orchestrated here).

After all connection attempts settle, the fixed 600-second observation begins.
A failed admission still observes the surviving cohort without reconnecting it:

- 200 concurrent virtual HTTP viewers load `/judge` plus direct hashed JS/CSS entries,
  refreshing every 90 seconds. This is HTTP load, not 200 rendered WebGL browsers.
- `/api/repos` is polled every 5 seconds using a fixture's signed-in session.
- Every distinct fixture probe moves once per 30 seconds. All sockets send the
  application's plain-text `ping` heartbeat at that cadence.
- Each matching patch delivery is timed from the move send using the same monotonic
  client clock: ingress + auth/storage + broadcast + egress, with no server clock skew.
  An absent delivery fails rather than silently disappearing from the histogram.
- Error denominator: HTTP requests, upgrade attempts, probe sends, expected probe
  deliveries, and explicit unexpected socket failure events. Unrelated incoming
  frames do not inflate the success count. Reports retain grouped failure reasons.

`/judge` is simulation-only on current main. It does **not** create a live socket.
The extra 200 live observers deliberately stress fan-out separately; describing them
as real judge sockets would misrepresent the product. The public judge preflight
uses no cookie, because the real route is supposed to work without signing in.

Reports include p50/p95 API, page/asset, upgrade and probe-to-recipient latency,
expected workload, actual connected snapshots, UTC window, build receipt and error
rate. A successful client budget requires the selected 50 or 250 sockets held for ten minutes, at least
1,000 or 5,000 measured probe deliveries respectively, p95 <500ms and errors <0.5%.

DO CPU and D1 rows are **not available from client timing**. Export staging-only
Cloudflare metrics for each run's exact UTC window, with account/script/database
scope, query, aggregation interval and units saved alongside the report. Record DO
CPU distribution and D1 rows read/written in one-minute buckets; also retain a quiet
baseline to identify background usage. Without these exports the full acceptance
remains incomplete even when `passedClientBudgets` is true. Do not substitute local
CDP samples, DO storage operations, or estimated query counts for billed CPU/D1 rows.

## Provisioning the hosted synthetic staging workload

`staging-setup.ts` generates an explicit `shiptorio-staging` config under the ignored
`.test-runtime/staging-load/` folder. It pins the `shiptorio.dev` route, staging D1
and KV IDs, and the existing staging Factory class/namespace. It does not inherit
production bindings. It generates only a private ephemeral setup token. Existing staging preview/session
secrets must already be configured and are never copied or rotated by this helper. `staging-worker.ts` delegates ordinary requests to
the real application and adds a bearer-protected, expiring `/__load/*` control plane.
The Worker refuses every host other than shiptorio.dev. Production never imports it.

Five synthetic accounts back 50 signed-in socket fixtures. Supplemental observers
are spread evenly over those fixtures (10 sockets per account in the requested profile, or 50 in the stress profile,
below the normal 60/minute user ceiling). Every socket uses a real D1 session, allowlist membership,
installation relationship and signed cookie. No provider keys, runners, issues,
paid model calls or real GitHub repositories are provisioned. A no-work factory
contains one idle `load-probe-1` machine. GitHub permission-cache entries are seeded
and renewed every minute (the original helper used two minutes); all ordinary D1 session/membership/revocation reads
still run. This isolates hosted Worker/DO/D1 fan-out with **warm synthetic provider
permissions**; it does not prove real GitHub authorization/refresh capacity. Renewal
KV writes and control-plane invocations are included in the staging environment's
metrics. No test request supplies a fabricated IP header.

After reviewing the generated config, run only the explicit configuration:

```sh
bun tests/load/staging-setup.ts
bun run build
# From server/; --env '' prevents an implicit environment selection.
bunx wrangler d1 migrations apply DB --remote --config ../.test-runtime/staging-load/wrangler.json --env ''
bunx wrangler deploy --config ../.test-runtime/staging-load/wrangler.json --env '' --var BUILD_SHA:$(git rev-parse HEAD)
bunx wrangler secret bulk ../.test-runtime/staging-load/secrets.json --config ../.test-runtime/staging-load/wrangler.json --env ''
# Back at repository root:
bun tests/load/staging-control.ts seed
bun tests/load/staging-control.ts keep-warm
```

Run the harness in another terminal. A baseline with rejected upgrades still
observes the full ten-minute window with its surviving sockets and HTTP viewers;
refused sockets are never retried. Its final result fails the full-cohort criterion.

`cf-analytics.ts` reads the existing local Wrangler OAuth credential in memory and
uses it only at Cloudflare's GraphQL API. `export-analytics.ts <report-path>` filters
to the pinned staging D1 ID and staging DO namespace ID, and saves the exact query,
UTC window, minute buckets and sampling metadata. Exports include cold admission as well as the ten-minute observation;
measurement-only exports are retained separately. CPU is reported by Cloudflare in
microseconds and converted to milliseconds. Allow for analytics ingestion lag;
refreshing an incomplete metrics export does not rerun the load test. No production
namespace, database, route or Worker is queried.

After testing, restore the standard staging entrypoint with the regular
`server/wrangler.jsonc --env staging` deployment, remove the `LOAD_SETUP_TOKEN`
secret, stop the keep-warm process, and revoke synthetic D1 sessions. The setup
endpoint is also time-limited to four hours, independent of cleanup.

The runtime guard checks source SHA, authentication epoch and synthetic grant health.
Grant renewal retries only transient setup transport failures with bounded backoff;
the actual load workload never retries or reconnects failed clients. A 15-second
handshake timeout is part of the currently measured cold-burst scenario. An isolated
post-burst connection is diagnostic only, not a substitute for concurrent-load proof.

Cleanup in this run stopped the renewal process, revoked owned fixture sessions
with `revoke-sessions.sql`, and deleted the owned `LOAD_SETUP_TOKEN` secret. Shared
preview/session secrets were preserved after coordination handoff. At handback the instrumented staging
entrypoint remained installed, with its setup endpoint disabled by token removal.
The coordinator owns subsequent staging restoration. Inactive synthetic states remain; grants expire by TTL.
