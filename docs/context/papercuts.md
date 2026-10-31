# Cleanup follow-ups

Reviewed 2026-10-30 against the deck-only app. These are retained candidates, not confirmed dead code.
Do not delete externally reachable routes or persisted state merely because the web bundle does not import them.

## Retained after the submission cleanup

| Candidate | Why it stays | What would justify removal |
| --- | --- | --- |
| `feature` / `previewOn` in `web/src/flags.ts` | Covered by preview-policy tests and still required by contributor policy. | An explicit policy change, not a blind unused-export deletion. |
| `/api/empire`, `/settings`, `/connect/*`, `/art/*` | Still registered or emitted and externally addressable; account and self-host docs use some of them. | Audit external and compatibility consumers before changing route behavior. |
| `server/src/{permits,levels,growth,unlocks}.ts` and server feature flags | Imports, stored state, fixtures or explicit operator opt-ins still reference them. Parked does not mean unreachable. | A separate migration/retirement decision with state compatibility verified. |
| Preview HTML and entrypoints (`stations`, `deckbuild`, `launch`, Shippy sheet) | Vite config or HTML loads them; development entrypoints are real references. | Owner explicitly retires each preview and its validation workflow. |

## Removed with reference evidence

The React-only web flags and their uncalled HTTP loader had no consumers in source, tests, scripts or HTML.
The `Empire` re-export in `web/src/source/schemas.ts` and React/WebGL-only `renderCrashed` callback also had no
consumers after the old app was deleted. Shared schemas, live-message parsing and socket diagnostics stay.

`web/src/deck2d/stations/parts.ts` was an orphaned 91-line drawing helper: no imports, re-exports, script or test
references. The deck's dynamic import patterns do not include it. Current stations use `shade.ts`, `status.ts`
and `px.ts`; those remain. No tests were removed or disabled.

Method: inspect Vite and HTML entrypoints, follow source imports and dynamic module patterns, then search the
whole repository for each candidate and its exported names. A source-only import graph is insufficient for
routes, fixture entrypoints and `import.meta.glob` modules.

## Cleanup pass, 2026-10-30 afternoon (Claude, PRs #758 and #759)

Removed with reference evidence: seven orphan scripts, an unreferenced evidence folder, dead JSX/visual-test/WebGL
config, the CI baseline leftovers, six dead `shared/` exports, a duplicate `dayKey`, 26 React-era `copy.ts` exports,
two dead glob paths, one `console.debug`, and 6.6 MB of public assets nothing serves (old landing hero, old gate loop,
spark frames). Full check green on both.

Found and deliberately left for after the freeze (each is a refactor, not a removal, so pixels or behavior could move):

| Candidate | Where | Why it waits |
| --- | --- | --- |
| Hex-to-RGB (6 copies) and nearest-48 palette snap (3 copies) | `stations/palette`, `city/{connector,draw}`, `engine/{dim,pixel}`, `shippy/sheet` | Snap copies differ by a divisor; consolidating changes pixels unless done with the screenshot tests open. |
| `spark.ts:93` inline Retry-After parsing | duplicates `rate-limit.retryAfterMs` | Small; verify the two agree on seconds vs HTTP-date first. |
| About 260 `export` keywords on symbols only used in their own file | server signals, spark.ts types, deck2d juice/city/engine | Cosmetic. A knip run after the freeze. |
| Test-only exports: `removePairing`, `sparkShare`, `recentLogs`, `funnelDays`, `priorityChoices`, `mergeProgress`, `liveStreak`, achievements `parseEarned`/`mergeEarned`/`markDay`, pricing `PLANS`/`FUEL_PACK`/`planMargin`, protocol `RunnerToServer`/`ServerToRunner` | shared, server, runner | Parked features (progression, pricing, empire) or test seams. Removing them removes their tests; a retirement decision, not cleanup. |
| Routes with only test callers: `review/retry`, `starter-issue`, `runner/jobs`, `limits`, `admin/budget` | `server/src/index.ts` | Externally addressable; audit consumers first (same rule as the table above). |
| `web/deck-ui-review.html` (820 KB) ships in the deck build | `web/vite.deck.config.ts` | A review tool in prod. Drop it from the inputs if nobody reviews there anymore. |
| `/art/*` pages (black-iron, cogworks, dioramas, style-lab, item-lab, art-prototype) and `docs/{loop,onboarding-mockup}.html` | `web/vite.config.ts`, `docs/` | Three.js and island-era art history, still served. Keep as history or retire together. |
| `scripts/art/cut-build.py` still cuts the spark frames | `scripts/art/cut-build.py:95` | Re-running it recreates `fx-spark-*`; drop the spark entry when the script is next touched. |

## Cleanup pass, 2026-10-31 (Claude, thread "Remove redundant code from the repo")

- `web/src/sound/` (old app) and React deleted; `@sentry/react` became `@sentry/browser`.
- One copy each: `server/src/encode.ts` (`escapeHtml` x10, `toHex`/`sha256Hex` x12, `plural` x3) and
  `web/src/deck2d/engine/math.ts` (`clamp01`, `span`, `easeOut`). Signal `clamp`s stay: each rounds differently.
- Browser Sentry is on: `live.ts` calls `startTelemetry()` on connect (idle-deferred, signed-in only, no-op without
  `SHIPTORIO_SENTRY_DSN`). The anonymous tutorial never loads it.
- Still waiting (pixels could move): hex-to-RGB and nearest-48 palette snap copies.
