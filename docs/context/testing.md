# Regression testing

Goal 15, day-one verification checkpoint. All commands run from the repo root.
Requires Bun and Node 22+; Wrangler must run under **Node**, because Bun's fetch does
not support Miniflare's dispatcher. `bun install --frozen-lockfile` installs the
pinned browser/test/runtime dependencies. No production credentials are needed.

| Suite | Command | What fails the run |
| --- | --- | --- |
| Fast (PR CI) | `bun run test:fast` | Workspace and test-driver types, unit/contract regressions, P1 simulator findings |
| Contract only | `bun test tests/contract` | Schema variant/required-field drift, missing web branches or Patch fields, callback behavior |
| Existing #85 playtest | `bun run playtest --check` | Seeded journeys across every registered scenario, including guided intro and disconnects |
| E2E + visual | `bun run test:e2e` | User journey, invalid wire messages, app exceptions, screenshot differences |
| Load | `bun run test:load` | Socket failures, missing deliveries, p95 message >3 s or tick RPC >5 s |

## Browser journey and visual smoke

First run `bun x playwright install chromium` (Linux: add `--with-deps`).
`bun run test:e2e --project=desktop` narrows a run; omit the project for desktop,
iPhone 14 and Pixel 7. These are Chromium device-emulation projects, **not** physical
phones or Safari/WebKit coverage. Phone viewports retain their device dimensions,
touch and mobile behavior, with DPR 1 to keep software WebGL affordable.

Playwright starts `tests/e2e/start.ts`: builds web assets, generates an ephemeral RSA
key, applies all real D1 migrations locally, then runs a separate Wrangler config on
`http://localhost:8799` (inspector `9249`). `.test-runtime/` is ignored and its local
state is reset on every run. Do not run browser and load suites simultaneously on
the same checkout/ports. Existing dev servers and `.dev.vars` are not reused.

The test-only entry imports the production Hono app and Factory. GitHub and Meta
outbound calls get deterministic fake responses; every unrecognized request fails
closed. The fake GitHub authorization page redirects to the real OAuth callback,
which checks state, exchanges the fake code, persists an account/session in D1 and
loads installed repos. The suite opens the intro, advances one beat, skips the rest,
signs in, picks a repo, ingests a signed GitHub issue webhook into ore, requests and approves Spark's plan, submits a
fake runner receipt, opens a fake PR, passes CI/verify/AI review, clicks Launch and
asserts both the launched wire state and the UI rocket event/celebration. It also
opens a real sim scenario and interacts with the Line panel. Every browser frame is
validated with `ServerToWeb`; console errors and page exceptions fail (only the
expected pre-login repo discovery/intro-preference 401s are exempted, only before sign-in).

Only external boundaries and runner execution are substituted. No coding CLI runs,
no real code is pushed and no actual GitHub merge occurs. The receipt and regression
proof are fixtures; real-runner proof remains covered by `runner/test/verify.test.ts`
and separate live acceptance. The browser intentionally uses test-controlled alarm
pacing (same production alarm body) to avoid time-dependent card replacement.

Visual baselines cover sign-in, plan approval and Launch cards on all three layouts.
They compare real rendered pixels with a 1.5% differing-pixel allowance and 0.25
per-pixel threshold. CSS animations are disabled during capture; a screenshot-only
stylesheet removes the moving canvas's influence on card backgrounds. Cropped card
baselines protect text/layout/controls, not the animated 3D scene. Baselines are
platform-specific (`tests/e2e/baselines/{darwin,linux}/{project}/`). To intentionally
update them, run `bun run test:visual:update`, inspect every changed image, then
commit the approved PNGs. Never update baselines automatically on PRs.

Traces, screenshots on failure, wire traces and the Playwright report are ignored
under `test-results/` and `playwright-report/`. `bun x playwright show-report` opens
the local report. `bun x playwright show-trace <trace.zip>` opens a failure trace.

## Contract coverage

`tests/contract/wire.test.ts` enumerates every shared server→web zod variant, validates
wire fixtures and rejects omission of every required field. TypeScript AST checks
compare all production emitter variants and web handler branches to that union,
and all `Patch` fields to the actual web reducer. Workspace typechecking protects
payload shapes at `broadcast(msg: ServerToWeb)` call sites. A callback execution test
extracts and transpiles the actual checked-in `useFactory` message callback, supplies
React-compatible setters and executes every message variant, checking state, deck
resolution, unlocks and log retention. It does not maintain a second reducer.

The existing #85 harness runs all simulator scenarios against the same schemas and
actual `applyPatch`; browser E2E validates the real Worker-emitted messages. These
layers catch shape drift plus state/handler behavior. `assertWire` recursively fails
on undeclared emitted fields even if zod would strip them. Production parsing retains
its intended stripping behavior; the tests do not change the shared contract.

## Load methodology and CPU limits

`bun run test:load` starts the isolated Worker, seeds one busy factory plus 50 other
factories, opens 200 WebSockets on the first and one on each of the others (250 total),
uses five fixture player/IP cohorts (50 sockets each, below the real per-user and per-IP upgrade budgets, with explicit 51-factory signup allocations), ramps handshakes in batches of 25, then requests 20 concurrent rounds of the real alarm body across all 51 DOs. Each
client must receive the round's tick before the next round starts. It measures
request-start → client patch receipt and tick RPC wall time, fails on disconnects or
invalid messages and requires all 5,000 expected tick deliveries. This is a fan-out
and tick-contention test with fixture ore, not a production API/provider soak test.
Set `LOAD_ROUNDS=40` to lengthen it (allowed range 5–100).

The workerd inspector's V8 CPU profiler records a `.cpuprofile`. The report sums
sample time for active JS and the subset with Factory alarm/message/decision stacks.
The subset is an **estimate/lower bound**: sampling and async stack breaks can miss
Factory work, and native storage/network CPU is outside it. This is local isolate CPU,
not Cloudflare billed DO CPU or a production capacity guarantee. No cloud resources
are created, queried or changed. Repeat on the same hardware before comparing runs.

The suite caught a tenant-authorization fan-out regression: upgrades reached 26 s
and the 200-client ramp timed out because each frame re-ran identical D1 checks for
every socket. Factory broadcasts now share one check per session **within that
frame only**. A regression test verifies separate sessions remain separate, all 200
sockets receive a frame, and revoking access prevents the next frame reaching any
of them. There is no new access TTL or cross-frame authorization cache.

Reference macOS arm64 local measurement with tenant/session/signup guards enabled:
5,000/5,000 deliveries, zero failures; message p50 62.51 ms, p95 787.37 ms,
max 902.32 ms; tick RPC p95 1,651.66 ms; sampled active isolate CPU 18,797.08 ms,
Factory stacks 6,312.04 ms (6.19 ms per requested tick), 24.89 s measured window.
Hardware/runner results differ; compare equivalent environments and revisions.

Outputs: `test-results/load.json` (latency, RPC, sampled CPU and failures),
`load.cpuprofile` (inspect in DevTools) and `load-worker.log` (startup/errors).

The PR records the final Linux Actions run/revision and its latency/CPU numbers;
raw JSON and CPU profiles are available from that run's artifacts.

## CI and evidence

PR CI runs the fast suite plus the web build (drafts retain the repo's existing skip
policy). Heavy browser/visual and load jobs run **only** on manual CI dispatch:

```sh
gh workflow run ci.yml --ref <branch> -f update_baselines=false
```

The manual run uploads `browser-evidence` and `load-evidence` for seven days. For a
reviewed Linux baseline refresh, dispatch with `update_baselines=true`, download
`browser-evidence`, inspect the `tests/e2e/baselines/linux/` images, commit them, then
run again with `false` to prove comparisons pass. Baseline generation alone is not
visual regression proof. PR CI and manual runs use separate concurrency groups;
new runs cancel obsolete runs of the same event/branch. No scheduled heavy runs.

The `/__test/*` endpoints, provider stubs and controlled alarm wrapper exist only in
`tests/e2e/worker.ts`; production `server/wrangler.jsonc` still imports
`server/src/index.ts`. Test config/keys are generated locally and never committed.
