# Cost and rate-limit guards

Goal 10, 2026-10-26. Advances the Oct 30 power/resource guard checkpoint.

## Defaults

| Worker variable | Default | Meaning |
| --- | --- | --- |
| `SPARK_DAILY_CALLS` | `200` | Outbound Meta calls per player per UTC day |
| `SPARK_DAILY_TOKENS` | `500000` | Input + output tokens, including in-flight reservations |
| `SPARK_MAX_OUTPUT_TOKENS` | `2048` | `max_completion_tokens` per request; hard ceiling 16384 |
| `FACTORY_CONCURRENT_JOBS` | `1` | Planning/awaiting approval/ready/running runner jobs plus hosted jobs per factory |
| `SPARK_DISABLED` | unset | Set `1` to stop all outbound Spark requests and new job admission/claims |
| `ADMIN_LOGINS` | `r3dbars` | Comma-separated operator logins allowed to read `/admin` |

Set overrides in `server/wrangler.jsonc` vars and deploy through the normal reviewed CI path.
For local development use ignored `server/.dev.vars`. These are non-secret controls; never put API
keys in source. Zero calls, tokens or concurrent jobs stops that resource. Invalid/negative values
use defaults. Lowering a cap immediately blocks further reservations if existing usage exceeds it.
The kill switch does not cancel an already-running provider request or local process; existing
receipts can finish. It stops new spending/admission. Never change unrelated Workers.

## One ledger across factories

`server/src/budget.ts` uses the existing D1 database. The migration adds `spark_usage`,
`factory_budget_owners` and `api_limits`; no new Cloudflare resources or DO classes are needed.
A repo's first budget lookup binds it to one currently authorized player from `user_repos`
(deterministic lowest GitHub user id for existing shared repos). This binding is persisted: another
collaborator signing in, re-pairing a runner, renaming a login, or connecting more repos cannot reset
that player's daily cap. Keys use stable GitHub user ids, not login names. All factories billed to
the same player share `user:<id>` usage. Unclaimed repos pause Spark until a player signs in/connects.
Billing-owner transfer is an explicit operator/database change, not a browser parameter.

Every individual chat completion, including planner repeat reads, reserves one call plus a conservative
input allowance (UTF-8 message bytes + framing) and the full maximum output before fetch. A single atomic
conditional SQL upsert enforces both caps across racing factories. Successful responses with valid
`usage.total_tokens` settle the reservation; failed, timed-out or unmeasured calls keep the full reservation.
Calls are never refunded. Existing in-flight reservations remain on their original UTC day at midnight.
This is a safety ceiling, not a dollar-price estimate. Provider billing remains authoritative.

Missing ledger, missing owner, kill switch, or exhausted cap fails closed: no paid fallback model is
called. Existing fixed rules continue where permitted, or the station waits for player input. The
existing honest `brain.fallbacks` counter records the denial and its specific reason once. Triage no
longer records the same failed Spark call twice. Successful thoughts append a small `Budget: calls/cap,
tokens/cap today (UTC)` line in **how it thinks**, using the existing thought payload; no protocol/UI
contract change. `/admin` shows current-day usage and limits (`?format=json` for machine-readable data),
and requires a live operator session. The accounts goal landed before this work; its admin dashboard
has not landed, so this is a minimal server-rendered budget view for it to incorporate.

Standalone `bun run spark:check` uses a separate persistent SQLite ledger at
`~/.cache/shiptorio/spark-check.sqlite`, with the same defaults and shell variable overrides. It never
bypasses reservation checks and does not share the deployed D1 ledger. No credentials are stored there.

## Upstream protection

- GitHub requests through `gh()` serialize by installation, App or player credential scope. At most eight
  requests queue in an isolate. D1 reserves request slots at one per second for registered credentials,
  including App token issuance and signed-in player installation discovery. Installation tokens are
  cached for 45 minutes per App/installation/permission scope rather than reissued per poll.
- A successful response with `X-RateLimit-Remaining: 0` defers subsequent requests until
  `X-RateLimit-Reset`. Primary exhaustion and secondary 403/429 honor `Retry-After`, with exponential
  secondary cooldown starting at one minute. Cooldowns persist across Worker restarts and token rotation.
  Short pacing waits are at most five seconds; longer cooldowns throw a typed retry error so existing
  durable queues/alarms can retry. Requests are not blindly replayed, especially mutations. File/ref
  reads propagate rate limits rather than pretending a file/branch is absent. Ordinary permission 403s
  are not treated as secondary limits.
- GET responses with ETags are revalidated with `If-None-Match`; 304 returns a credential-isolated cached
  body. Cache is bounded to 500 entries, 64 KiB per body, five-minute retention. ETag eviction/restarts
  result in an ordinary fresh GET, not stale data. Cooldowns remain in D1.
- PostHog: initial poll, successful intervals and retries add 0–20% positive jitter to the five-minute
  interval. Failures back off exponentially to one hour plus jitter. 429 respects seconds or HTTP-date
  `Retry-After`, even if longer than an hour. Requests time out after 20 seconds. Poll schedule is durable
  per factory, so many factories avoid synchronized retries.
- Sentry currently uses signed inbound webhooks, not an outbound poller. There is no Sentry polling API
  spend or outbound 429 loop to protect. Durable webhook retries already back off. Any future Sentry
  poller must use `retryAfterMs`/`pollDelay` and persist its schedule like PostHog.

References: [GitHub rate limits](https://docs.github.com/en/rest/using-the-rest-api/rate-limits-for-the-rest-api),
[GitHub conditional requests](https://docs.github.com/en/rest/using-the-rest-api/best-practices-for-using-the-rest-api),
[PostHog API](https://posthog.com/docs/api).

## Verification

`bun run check`: workspace typechecks (including server tests), full tests, web production build.
Cost tests execute real production SQL with SQLite, including racing reservations, shared user/repo
identity, token settlement, UTC rollover, zero caps, kill switch and failure retention. HTTP tests cover
GitHub primary/secondary limits, persisted cooldown on replacement credentials, ETag/304, and PostHog
429 with both Retry-After formats and positive jitter. Factory tests cover job admission and exactly one
honest fallback on cap denial. Admin tests deny non-operators and revoked sessions.
