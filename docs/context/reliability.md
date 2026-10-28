# Loop reliability

## Overnight runner connection (2026-10-27)

Two distinct failures were found. PR #340 fixed renewal persistence: the process could
keep selecting the original environment grant or stale JSON after renewing. The
remaining sleep failure is reproducible on current main: every pairing and renewal
lasted eight hours, and renewal happened only in the job-poll loop during its final
hour. A twelve-hour sleep necessarily missed that window; a long build could miss it
too. The installed helper log also contains repeated 401/re-pair messages, but lacks
timestamps sufficient to attribute each historical failure to sleep rather than the
older storage bug. No evidence of a server sweep deleting valid grants was found.

New grants last up to seven days, capped by the approving account session's expiry.
The heartbeat renews with a full day remaining, independently of a running build.
Transport failures retain the grant and retry with bounded backoff; a backwards clock
correction clears an obsolete retry deadline. A previously expired grant still needs
one re-pair: this does not revive expired tokens or bypass session/repository revocation.
Tests advance twelve hours, inject ten minutes offline, and reconnect using the same
signed grant. This is deterministic outage proof, not a real overnight sleep test.

Checkpoint: Oct 28 inspector/rework loop. Backend only; existing shared protocol and player approval gates.

## Delivery and outbound calls

GitHub delivery IDs and Sentry Request-IDs (body SHA-256 fallback) use the existing D1 delivery ledger with seven-day retention. Pending duplicates may enqueue again to recover a failed handoff; the DO queue coalesces them. Seven-day DO completion tombstones also close the race between a completed handler and a delayed intake enqueue. Both ledgers clean expired completed entries; pending or failed payloads are retained.

Processing retries use exponential backoff and jitter, a persisted next-at timestamp, and five attempts. Exhaustion moves the original payload to `failed:delivery:*` and offers a player card when a map exists. Operator replay requires inspecting the retained payload and clearing its dead letter/completion marker before re-enqueueing. An installation failure before a map exists is retained and logged, not discarded.

`reliability.ts` wraps GitHub REST and Spark completions: three attempts, 250/500ms exponential delays with 0.5–1.5 jitter, immediate failure for permanent HTTP errors. Every fetch attempt has a timeout. GitHub has no general REST idempotency key: comments carry deterministic body markers and search existing comments before posting; PR creation recovers by head/base; branch creation recovers by exact ref/SHA. Comment lookup is capped at 20 pages; exhaustion refuses a new post instead of risking a duplicate. Merge uses the existing checked-head PUT and durable launch-credit transaction. Content-addressed Git objects, labels and target-state updates are replayable. Spark retries can consume additional credits if a response is lost; no provider exactly-once guarantee is assumed.

Exhausted gauntlet calls become rework/scars instead of invoking the model every tick. Other errors are surfaced in logs, saved failure records and attention cards, or the existing source/brain failure state. Removed silent null catches from API/credential reads; only a genuine GitHub 404 means a missing file/branch.

## Stuck watchdog and alarm

Every alarm checks per-state waiting limits: ore 10 minutes; queued, working and inspecting 30 minutes; rejected, passed and on-pad 24 hours. Launched is terminal. A durable clock tracks state/machine changes independently of incidental timestamp updates. One `stuck at <state>` scar and attention card are emitted per stage stay, surviving restart. The card is advisory; it never redispatches a running agent or bypasses proof/approval. Changing stage resets the clock.

A DO restart preserves working items: a local agent can still be alive. It no longer silently requeues them. Alarm sections and individual ore transitions have separate error boundaries. The outer finally schedules a reliability wakeup within one minute, preserving earlier work/orbit deadlines, before refreshing decisions. Persistent storage outages still depend on Cloudflare alarm redelivery; application code cannot guarantee storage availability.

## Reconciliation

After a one-minute warmup, once per minute the factory scans the 100 most recently updated GitHub PRs, recovering unrecorded publications by exact durable runner-job branch. A missing supervisor receipt becomes a rejected verify-stage item requiring player action; discovery alone cannot approve it. It rotates through ten tracked PRs each run, repairing missed merges, closes, changed heads and current-head check results through the existing transition handlers. A failed PR read leaves its state intact and produces an attention card; later PRs still run. Reconciliation never calls merge. The bounded recent-publication scan is not a full historical repository audit.

## Verification

Regression tests cover duplicate intake and DO completion replay; retry delay/exhaustion/permanent errors; a lost comment POST response; all nonterminal SLAs; one watchdog alert across restart; broken tick recovery; dead-letter retention and healthy subsequent work; missed merge/close/head/check reconciliation and single science credit. Existing runner rework, launch-permit and orbit suites remain required.

Run `bun run check` before making the PR ready; then verify PR CI and the main Deploy workflow separately. Mocked external transports prove transition behavior, not an induced production outage.


Permanent runner rejection is distinct from transport failure: the Worker returns explicit
`runner_grant_expired`, `runner_grant_invalid`, `runner_pair_revoked`, or
`runner_access_revoked` codes. The helper persists the rejection only for the exact grant
that failed; late responses cannot stop a new pairing. Watching skips rejected grants after
restart, keeps build/receipt evidence, and refuses publication if a rejection was observed
during local work. Generic 401s keep their existing bounded retry behavior.

Runner status exposes `needsRepair`, `repairReason`, and `repairCommand` without returning
a credential. Revocation clears presence; new pairing clears repair status. Stored grant
expiry also makes an expired offline machine's need to re-pair visible without waiting for
another request. An older expired token cannot overwrite a newer grant's healthy status.


Permission lookup failures remain fail-closed without becoming permanent connection
rejections. The runner opts into `repoAccess` propagating upstream errors; all other
callers keep its existing deny-on-error behavior. A failed/limited GitHub lookup returns
503 with a retry delay, not a revoked-grant code. Known revoked permission or pairing
still denies access. A late renewal cannot clear a persisted rejection, and renewal is
skipped when a grant has already reached its approving browser session's expiry.

## A factory PR falls behind its base

A completed local build is not automatically refreshed when main advances. The factory
checks at most three tracked runner PRs per 30 seconds, rotating the candidates. An
open, same-repository PR behind main gets an “Update to latest main” planning card.
The player reviews a NEW plan naming the exact new base, existing PR/branch and old
head, including explicit branch replacement. The previous build approval is not reused.

The local agent rebuilds only the freshly approved files from the new base. The
supervisor runs checks and new base-failing/head-passing regression proof. Trusted
publication creates one commit whose only parent is that base, then replaces ONLY the
factory branch with an explicit old-head force-with-lease. A changed branch refuses
publication; a lost acknowledgment only recovers the identical deterministic SHA.
PR #351's isolated, immutable source-fetch boundary stays in place; `publication.ts`
needs this narrow lease-aware extension, not an agent Git escape or full-history fetch.

The server rechecks PR identity and current base at approval, claim and completion,
retains its one-commit/approved-path/complete-patch checks, requires fresh proof, and
resets the gauntlet for the new head. If main advances during publication, completion
fails: the scoped publication identity is retained only to offer another NEW plan,
never to pass verify or reuse its proof. Launch remains a separate game action. The
release's authoritative readiness guard must also hold Launch when main advances later.


## 2026-10-27 final staging handoff: requested profile remains unmeasured

**Setup completed; acceptance not established. PR #372 remains draft and must not
join a production release.** The load setup served public `/judge` and
`/api/version`; synthetic test accounts were provisioned through real D1 sessions,
and scoped Cloudflare analytics reads work with the existing local Wrangler OAuth
session. No new account permissions or analytics token were needed. No production
requests, deployments or other Workers were generated by this chat.

### Cohort correction

| Profile | Judge traffic | Authenticated factory sockets | Result |
| --- | --- | --- | --- |
| Requested actual product profile | 200 concurrent virtual HTTP/simulator viewers | 50 | **Not run in isolation; no acceptance verdict** |
| Supplemental stress used in the receipts below | Same 200 virtual HTTP viewers | 50 + 200 extra observers = 250 | Failed both attempted observation windows |

The brief described judge viewers with live sockets, but current `/judge` is a
browser simulation with none. The harness added 200 explicitly supplemental
factory observers. That was a stronger, different experiment; its failure does
**not** establish failure of the requested 50-socket profile. The corrected default
now has 50 sockets. `LOAD_SUPPLEMENTAL_OBSERVERS=200` selects and labels the separate
stress profile. The 500 ms / 0.5% thresholds, ten-minute duration and no-reconnect
rule are unchanged. A correct-profile before/after comparison still needs its own
coordinated staging window; no run was repeated merely to obtain green.

### Supplemental stress receipts (not requested-profile acceptance)

Five synthetic identities/sessions shared one disposable factory. Judge viewers
fetched HTML/direct entry assets and refreshed every 90 seconds; API polling was
approximately every five seconds. Sockets attempted a cold simultaneous burst,
with a 15-second handshake deadline, 30-second heartbeats and one movement probe
per distinct fixture every 30 seconds. HTTP viewers are virtual clients, not 200
rendered WebGL browsers. Probe timing is client send through ingress, auth,
storage, broadcast and recipient receipt—an end-to-end upper bound, not a pure
server-to-client fan-out measurement.

| Measurement | Before stress | Candidate stress |
| --- | --- | --- |
| Code SHA | `0136070464639630ec755355fb15ebcbc4c34f4e` | `ed5b9fd4bd8141c473013d9886aaa5ad5d287dd0` |
| Observation UTC | 2026-10-27T20:21:50.341Z to 2026-10-27T20:31:58.832Z | 2026-10-27T20:39:17.743Z to 2026-10-27T20:49:17.751Z |
| Snapshots established / sockets open at end | 57 / 0 | 0 / 0 |
| API p50 / p95 | 282.2 ms / 395.4 ms | 268.5 ms / 395.7 ms |
| Page/direct-asset p50 / p95 | 185.2 ms / 2,615.0 ms | 130.0 ms / 1,834.7 ms |
| Upgrade p50 / p95 among successful snapshots | 14,550.5 ms / 14,790.6 ms | Unavailable (0 snapshots) |
| Probe-to-recipient p50 / p95 | Unavailable (0 deliveries) | Unavailable (0 deliveries) |
| Failed operations / counted operations | 273 / 8437 | 251 / 7357 |
| Counted error rate | 3.24% | 3.41% |
| Staging DO namespace CPU, full attempted run | 38,646.2 ms | 5,980.2 ms |
| Staging D1 rows read / minute, full attempted run | 3,672.9 | 1,470.2 |
| Staging D1 rows written / minute | 0.0 | 0.0 |

Before observed 131 HTTP 429 upgrades, 62 upgrade transport failures, 57 subsequent
socket closes, 22 missing probe deliveries and one HTTP transport failure.
Candidate observed 250 upgrade transport failures and one HTTP transport failure.
Unrelated incoming frames do not inflate the error denominator. Since no intact
cohort survived, lower namespace CPU or fewer messages is **not a demonstrated
capacity improvement**. Zero writes also does not prove a normal writing factory
workload held up. No socket percentile or target-load success is claimed.

The candidate burst minute had 14,904 D1 read queries for 250 upgrade attempts
(about 60 per attempt), while D1 query-batch p95 was 0.4 ms and DO CPU-limit/fatal
error counters were zero. Repeated authentication/authorization round trips or
admission fan-in are plausible next investigation targets; those observations do
not identify a validated single bottleneck. A separately labeled post-burst socket
received a snapshot in 2,256 ms; that is diagnostic, not concurrent-load proof.

Reports: [before.json](../../tests/load/evidence/before.json),
[after.json](../../tests/load/evidence/after.json),
[before analytics](../../tests/load/evidence/before-analytics.json),
[after analytics](../../tests/load/evidence/after-analytics.json),
[burst diagnostic analytics](../../tests/load/evidence/candidate-burst-diagnostic-analytics.json),
[provenance](../../tests/load/evidence/provenance.json).
Analytics include preflight/cold admission through observation end, filtered to
staging database `82bf6646-ed06-4c4d-94c3-c9b747940a7e` and DO namespace
`187f0a43e43d4e869e501e5192eec961`. CPU includes security-counter objects in that
namespace. Raw one-minute buckets, sample intervals, UTC filters and query text are
retained. Cloudflare CPU microseconds are converted to ms. Separate measurement-only
exports preserve the narrower original window. Quiet-control exports had no rows
and are unavailable, not measured zero. One isolated diagnostic is included in the
namespace totals, further preventing a pure speedup claim.

### Candidate and experiment limitations

The unproven candidate separates the aggregate IP upgrade ceiling (300/minute)
from the existing user ceiling (60/minute), runs independent session checks
concurrently within a broadcast frame, and avoids repeating shared decision
refresh for every new viewer. The six-line `server/src/factory.ts` exception is
outside the originally named fix files: it targets the hypothesized join/broadcast
amplification directly. No protected auth/account/runner/UI files changed. The
actual-Factory regression test verifies concurrent checks, per-session dedup,
frame order and fresh revocation checks on the next frame; it does not replace
hosted requested-profile proof or the coordinator's security review.

The earlier rollback/secret-rotation interruptions and expired-grant 403 attempt
are retained as **invalid/setup failures**, not product results. The before-stress
grant helper stopped on a connection reset after its successful 20:23:36 renewal;
all its clients had already closed by 20:22. That limitation is disclosed rather
than hidden. Candidate setup uses bounded renewal backoff plus source/auth-epoch
and provider-grant health guards. A fresh disposable object was used for the
candidate, and test-only control instrumentation evolved; this is not a clean
same-fixture causal before/after study. GitHub permission grants were synthetic
warm cache entries; no real GitHub/provider capacity or paid model work was tested.

### Cleanup and validation

Staging writes stopped by **20:50:00 UTC (3:50 PM CT)** and the lease was returned.
The grant-renewal process and all clients exited; 20 sessions owned by the five
`staging-load-*` identities were revoked, and the owned `LOAD_SETUP_TOKEN` was
deleted, disabling the setup endpoint. Synthetic identities/inactive factory state
remain for reproducibility; permission fixtures expire by TTL. Shared gate/session
secrets were preserved after the coordinator handoff. See
[cleanup receipt](../../tests/load/evidence/cleanup.json). Only read-only scoped
analytics exports and local documentation continued afterward.

Final local `bun run check`: **953 passed, 2 existing platform skips, 0 failed**,
with typechecks and builds passing. The frozen candidate also passed its own
workspace/test typechecks and 944 tests, and 44 focused auth/factory regressions
passed. Six load/guard tests pass, including deterministic frame-order/revocation
coverage. Hosted check/selfhost and Stranger receipts exist for earlier PR heads;
[manual CI 40574627553](https://github.com/r3dbars/shiptorio/actions/runs/40574627553)
has browser failures and is not a green receipt for the final head. Nothing was
skipped, quarantined, loosened or retried-to-green. PR #372 stays draft: requested
load acceptance, single-bottleneck validation, exact-head hosted checks and
production release remain outstanding.


## 2026-10-28: harness-only readiness on dev

PR #372 is now scoped to the staging harness, its opt-in fixture tooling and the
historical receipts above. The unproven production `factory.ts` / `rate-limit.ts`
changes are withdrawn. Their patch and feature-specific test source remain in
`tests/load/evidence/` as historical artifacts; the parallel-broadcast and raised-IP
policy assertions are removed with those withdrawn features, not disabled to make
an unchanged production feature pass. Existing production authorization/rate-limit
tests remain untouched. No performance change is being released in this PR.

Default load stays 200 judge HTTP/simulator viewers plus 50 signed-in sockets,
with no implicit additional observers. Hosted acceptance remains unmeasured.
Harness readiness/local CI does not establish the requested p95/error budget.
This follow-up performs no hosted load, Cloudflare resource changes or manual deploy.
The workflow in [branches.md](branches.md) now governs integration: quick checks
then merge to `dev`; Staging deployment is verified separately. Production only
moves through a user-requested `dev` → `main` promotion.


Local orchestration initially exposed a transport-mock failure: Bun's built-in
`ws` ignored a preload mock, so a failed cancellation test may have attempted 50
unauthenticated staging handshakes with a fake cookie. Conservative audit window:
**2026-10-28 16:57:12–17:10:53 UTC**; actual request times/outcomes are unknown.
This is not a valid load result or a claim of harmlessness. The bounded incident
receipt is [preserved](../../tests/load/evidence/local-orchestration-incident-2026-10-28.json).
The replacement local test boundary requires numeric loopback before startup,
asserts the explicit socket-adapter identity, and verifies staging/production
origins produce zero client constructions. No further hosted load was run.

Full local `bun run check` on the rebased dev integration: **1,506 passed, two
existing platform skips, zero failures**; typechecks and builds pass. Separate
`bun run typecheck:tests` passes. Focused local harness validation: **13 passed,
0 failed**, including real CLI
preflight, private-error redaction, prompt source-change cancellation and nonlocal
target rejection. Full repository checks and exact-head dev CI are separate gates;
none substitutes for the outstanding ten-minute hosted comparison.

### Existing-map connection work (2026-10-28, PR #515)

Optional Sentry/PostHog credential discovery no longer holds an existing map's connection open. `ensureFactory` loads once, durably requests discovery, and preserves the normal alarm wake-up. The alarm handles discovery after the foreground gauntlet; an unsuccessful attempt retains the marker. Deletion, lifecycle and installation identity are checked before deferred work. A new factory and a factory needing GitHub initialization still await their required initialization. This removes optional work from connection establishment; it is not a receipt that every cold connection meets the three-second target.
