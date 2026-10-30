# Cleanup follow-ups

Reviewed 2026-10-30 against the deck-only app. These are retained candidates, not confirmed dead code.
Do not delete externally reachable routes or persisted state merely because the web bundle does not import them.

## Retained after the submission cleanup

| Candidate | Why it stays | What would justify removal |
| --- | --- | --- |
| `web/src/sound/` | The deck has its own sound directory, but legacy sound modules still have tests, and sound has a separate owner. | Owner confirms the shared tests and music references can migrate without losing coverage. |
| `web/src/telemetry.ts:initTelemetry` and `@sentry/react` | The initializer has no current caller, while the live socket still imports `socketDisconnected` from the module. Removing the whole module would change that live path. | Decide whether to initialize telemetry on the deck or retire the old initialization/SDK deliberately; retain redaction. |
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
