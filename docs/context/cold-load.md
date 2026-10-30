# Cold load

Measurement work started 2026-10-30. This is a local fixture measurement, not a
production speed claim. No performance optimization has been made in this PR.

## Reproduce

```sh
bun install --frozen-lockfile
bun run build
COLD_LOAD_OUT=/tmp/shiptorio-cold-load node web/scripts/cold-load.mjs --budget
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

## Baseline: no optimization

Measured `60965fa0` (2026-10-30). All durations below are milliseconds. The final
local run is `/tmp/cold-load-baseline-complete/results.json`; every phase below is
also present in that round's Chrome trace or HAR. [CI evidence](https://github.com/r3dbars/shiptorio/actions/runs/41086375873)
contains the same artifacts from Ubuntu. Timings are sampled, not production.

| Profile, median of 5 | First deck frame | First real/guest card inserted | Visible playable card | Budget |
| --- | ---: | ---: | ---: | ---: |
| Local stranger | 2,835.5 | 2,835.5 | **3,094.8** | 4,000 |
| Local signed-in fixture | 1,753.5 | 1,894.0 | **2,150.4** | 5,000 |
| CI stranger | 3,198.8 | 3,199.5 | **3,496.4** | 4,000 |
| CI signed-in fixture | 2,302.1 | 2,609.7 | **2,914.0** | 5,000 |

The historical 9–10 s hosted handshake is **not reproduced**. These local fixtures
use local D1/KV and fake providers, not remote service latency or Justin's factory
size. Subtracting these results from the historical number would be invalid.
No runtime optimization or measured saving is claimed.

### Ordered browser breakdown

Representative median-playable samples are `stranger-2` and `live-2`. These are
observed intervals between milestones, **not exclusive CPU or network attribution**.
Concurrent downloads overlap them; they must not be added again.

| Stranger interval | Duration | End since first navigation |
| --- | ---: | ---: |
| Navigation → first entry execution | 645.1 | 645.1 |
| Entry → fresh-start replacement navigation (includes logout) | 470.5 | 1,115.6 |
| Replacement navigation → second entry execution | 641.4 | 1,757.0 |
| Second entry → `/api/me` response observed | 471.9 | 2,228.9 |
| Response → required imports/sign-in await completes | 0.1 | 2,229.0 |
| Imports → awaited art ready | 341.2 | 2,570.2 |
| Art ready → first deck/card insertion | 265.3 | 2,835.5 |
| Insertion → visible text/card entrance | 259.3 | **3,094.8** |

| Signed-in interval | Duration | End since navigation |
| --- | ---: | ---: |
| Navigation → entry execution | 649.6 | 649.6 |
| Entry → `/api/me` response observed | 465.5 | 1,115.1 |
| Response → required imports/sign-in await completes | 0.8 | 1,115.9 |
| Imports → websocket constructed | 194.5 | 1,310.4 |
| Websocket constructed → open callback | 445.1 | 1,755.5 |
| Open callback → first validated snapshot | 53.8 | 1,809.3 |
| Snapshot → first frame with matching real card | 84.7 | 1,894.0 |
| Card insertion → visible playable card | 256.4 | **2,150.4** |

Live art-ready was 1,459.6 and the loading deck frame 1,746.3. Neither counts as a
real factory frame. The same round's server upgrade/snapshot took **20.1 ms**:
445.1 ms from websocket construction to the browser's open callback is not a
445.1 ms server-auth claim.

### Server-only and authorization phases

After restarting workerd with persisted state: **71.8 ms** to first snapshot;
five subsequent warm snapshots: **14.2 ms median**. Restart snapshot: 8,198 bytes;
the representative browser snapshot: 8,100 bytes. Local workerd's clock quantizes
many phases to whole milliseconds; 0.0 means below its measurement resolution.

These fixed-name `Server-Timing` phases are inclusive/nested. In headers, DO phases
come first, then App phases; identical subphase names belong to those distinct
scopes. Do not sum nested parent and child timings.

| Restart phase | Observed ms |
| --- | ---: |
| Fixture verification / entry / session / preview / runner | 0 / 2 / 6 / 0 / 1 |
| App current-session D1 queries (3 calls) | 1 |
| App repo session / admission / relationship D1 | 0 / 0 / 1 |
| App repo membership KV | 0 |
| App ensure RPC (includes DO wake/initial storage load) | 12 |
| App socket fetch, inclusive | 11 |
| DO current-session D1 query | 1 |
| DO repo session / admission / relationship D1 | 1 / 0 / 0 |
| DO membership KV | 0 |
| DO load calls after ensure (2) | 0 |
| DO runner jobs/presence reads | 1 |
| DO snapshot projection/clone/redaction | 5 |
| DO frame sequence read + JSON serialization | 0 |
| DO synchronous send | 0 |

There was no `repo_github` phase: the positive KV grant covered repository access,
including after restart. Native outbound requests are forbidden by the harness.
The fixture provider supplies GitHub/Meta responses during setup, not real APIs.
The restart's 12 ms ensure RPC is **not separately resolved into scheduler wake,
state storage reads and initialization** by the existing probe; the subsequent
`do_load` phase is already warm. That finer split and the historical hosted 9–10 s
attribution remain unproven, rather than guessed.

### Suspects checked

- First-frame image preloads and the modulepreload plugin apply to both URLs.
  `deck2d-first-paint.test.ts` still checks the exact image list and baked sky hashes.
- Entry bundle: 94,791 raw / 36,671 gzip bytes before instrumentation; 95,196 /
  36,843 after. Startup graph: 59,570 → 59,738 gzip, below the 61,650-byte budget.
  No zod removal or chunk-size improvement is claimed. The live validator remains
  lazy and fully validates every accepted snapshot. This checkout has no
  `test:chunks` package script; `bun run build` runs the actual bundle budget.
- `/api/me` starts at 653.9 ms and socket construction at 1,310.4 ms in live sample 2.
  Sign-in is awaited before creating the live source. Initial art starts in parallel.
- Silkscreen starts at 169.2 ms; Pixelify Sans at 1,134.6 ms. Font requests do not
  appear as an awaited `document.fonts.ready` on the first-frame path.
- City images start around 1,405 ms; station idle pictures at 1,460 ms, before the
  1,746.3 ms first live loading frame. Current code therefore does **not** defer
  all optional pictures past the first frame. This is an optimization candidate,
  not a measured saving; changing scheduling must preserve reveal/build pixels.
- `/api/me` and websocket are separate requests. Each must validate its session;
  a request-local cache cannot become a cross-request authority cache. Current
  repository grants last five minutes, not the historical 60 s in the prompt.
- No snapshot contract, auth policy, deadline, Spark routing or UI changed. Neither
  local nor CI baseline needs a speculative optimization to meet the two budgets.

## Validation and PR ledger

`bun run check` on the final harness head: 2,124 passed, two existing platform skips, zero failures. Focused
session revocation/failure and timing tests pass. Before/after deterministic
390×844 and 1280×720 full screenshots **and canvas buffers are byte-identical**;
both screenshots were inspected. The existing deck pixel/unit suites passed.
The repo no longer has an active deck `toHaveScreenshot` assertion, so the extra
exact comparison was used rather than claiming an absent screenshot test ran.

| PR | Before | After | Measured saving |
| --- | --- | --- | --- |
| [#739 measurement harness](https://github.com/r3dbars/shiptorio/pull/739), merged | No comparable end-to-end fixture timing | Baseline above | None; instrumentation only |
| [#745 CI budget](https://github.com/r3dbars/shiptorio/pull/745) | Same measured runtime | Enforce 4,000 / 5,000 ms and five samples | None; guard only |

The `Cold load` CI workflow now runs `--budget`: it fails above **4,000 ms stranger**
or **5,000 ms live**, using unrounded median playable times. One warm-up and exactly
five distinct timed rounds per path are mandatory; missing/non-finite milestones
fail. Evidence is written before evaluating the budget, including on failure.
These are sampled CI timings, not production. No cause has been demonstrated to account for a ≥200 ms saving yet; no optimization PR is bundled.

An anonymous staging confirmation on 2026-10-30 used the same throttle profile
and a cold browser context: first deck/card insertion **2,238.8 ms**, visible
playable card **2,498.6 ms**, with no page errors. This is one sample, not a median
or a signed-in result. Hashed assets returned `Content-Encoding: zstd` and
`Cache-Control: private, max-age=31536000, immutable`.
The check exposed delayed PerformanceObserver delivery to the Node binding;
both scripts now read current-document marks directly before saving timings,
retaining marks from the earlier fresh-path navigation.

## Justin's real-session confirmation (pending)

Justin chose to run this himself. After the instrumentation is deployed:

```sh
node web/scripts/cold-load-live.mjs
```

The script opens headed Chromium. Sign in manually, select an already-connected
repo with an online paired runner and a real top card, then press Enter in the
terminal. `r3dbars/Testing` is excluded. It closes the warm tab and samples one
cold-context signed-in visit and one stranger visit on the same profile. It stores
only numeric milestones in `cold-load-live.json`; cookies remain in memory and
no HAR, trace, factory payload or screenshot is saved. It does not approve a card.
A missing real card fails the check rather than accepting the loading deck.

Record that JSON's two playable times here after Justin runs it. This is still
pending; local/CI success is not a claim of under-five-second live staging.
