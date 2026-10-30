# Cold load

Measurement work started 2026-10-30. This is a local fixture measurement, not a
production speed claim. No performance optimization has been made in this PR.

## Reproduce

```sh
bun install --frozen-lockfile
bun run build
COLD_LOAD_OUT=/tmp/shiptorio-cold-load node web/scripts/cold-load.mjs
```

Requires the repository's Playwright Chromium and Node 22+. Runs one uncounted
warm-up per path, then five timed rounds with a new browser context each time.
Profile: iPhone 13 (390 × 844, DPR 3), Chromium, 9 Mbps each direction,
150 ms network latency, 4× CPU slowdown, browser cache disabled, service workers
blocked. These are sampled emulation timings, not physical iPhone measurements.

- Stranger: `/deck?fresh=1`, including the logout request and second navigation.
- Live: `/deck?source=live&repo=test-fixture/test-newbie`. The repository's private
  tester provisions the D1 session and installs its fake GitHub repo, then pairs
  its existing fixture runner. Real application auth and repository checks run.
  `/api/me` uses that same signed test session through a local-only adapter; it
  does not widen the production delegation allowlist. Native provider egress fails.
- Static build files and JSON are gzip-compressed before network throttling. This
  models edge compression; it does not assert the deployed edge's current headers.
- First frame and card insertion have separate marks. `shiptorio:playable` waits
  until the card is on screen at full opacity with visible text. The live mark
  additionally requires the displayed card ID to belong to the accepted factory
  state. A loading scene or connection card cannot satisfy the live measurement.
- `results.json`, per-round HARs, Chrome traces and screenshots stay in the chosen
  output directory. They contain fixture data only. Never publish a real-session
  HAR, trace, cookie or storage-state file without reviewing it for secrets.
- After the browser runs, the server-only probe restarts local workerd with its
  persisted D1/KV/DO state, then measures one restart and five warm snapshots.
  The first is an entire runtime restart, not a claim about Cloudflare eviction.

## Baseline status

The preliminary five-round run at `edd30325` plus instrumentation measured median
3,079.3 ms stranger playable and 2,162.4 ms live playable. Final phase instrumentation,
pixel comparison and exact-head validation are in progress. The reported historical
9–10 s hosted cold handshake is not reproduced by these local fixtures. Local D1,
KV and fake providers do not model remote service latency or a production factory's
size, so subtracting this result from that historical number would be invalid.

`/api/me` and the websocket are separate requests. They must each validate the
session; the request-local cache cannot safely turn into a shared authority cache.
Current repository access grants last five minutes, not the 60 seconds in the task's
historical notes. No auth/cache policy is changed here.

## PR ledger

| Change | Before | After | Saving |
| --- | --- | --- | --- |
| Measurement harness | No comparable end-to-end fixture measurement | Baseline in progress | None claimed |

The CI budget and Justin's real signed-in shiptorio.dev confirmation follow this
measurement-only PR. Do not report the task complete until both are recorded.
