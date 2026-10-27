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
