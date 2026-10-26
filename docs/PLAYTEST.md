# Repeatable game playtests

Run `bun run playtest --check`. Every registered simulator scenario gets a seeded
180-tick game journey and an early-disconnect journey. The driver uses the real
simulator, shared schemas and frontend patch reducer; it chooses suggested moves,
tries duplicate/stale choices, and checks item/machine/PR and wire invariants.
JSON traces and a concise Markdown papercut report go to ignored `playtest-results/`.
Use `--seed 71`, `--scenario heal`, or `--out /absolute/output/path` to reproduce.
`--check` fails on P1 findings; P2s remain visible in the report. Unit tests also
require zero disconnect findings, protecting the queued-event regression.

Rendered checks are separate. In the Codex CUA browser runtime, bind a tab and run:

```js
var qa = await import('/absolute/path/to/shiptorio/playtest/browser.mjs');
await qa.smoke({ tab, baseUrl: 'http://localhost:5173',
  fs: await import('node:fs/promises'), outputDir: '/absolute/path/to/outputs/browser-qa' });
```

This browser driver uses the existing CUA handle, visits explicit simulator URLs,
checks meaningful content/error overlays, clicks a visible suggested action, records
console errors, and saves screenshots plus the resulting accessibility state. It
never visits the live factory or creates real issues/PRs. Screenshots need human or
agent visual inspection; passing protocol checks do not prove layout correctness.
Desktop and phone layouts must be checked separately using supported browser sizing
or a physical phone. A desktop screenshot is not phone proof.

For each change, preserve the reproduction seed, expected/actual result, owner and
severity in the generated findings. P1 means the flow cannot proceed, corrupts state,
or acts without proof; P2 means a confusing, delayed or stale interaction. The first
run found callbacks delivered after disconnect; the fix guards queued emissions and
tracks all delayed deals, and every scenario now protects that lifecycle boundary.

The actual GitHub → approved plan → local agent → CI/proof/review → merge/rocket path
is an additional acceptance check, not a simulated claim. Its regression suite is
`server/test/runner-rework.test.ts`, plus the real temporary-Git base/head proof test
in `runner/test/verify.test.ts`. Production verification requires a green Deploy and
matching `/api/version`, followed by a live-mode browser check. The test report must
say which of these layers actually ran.
