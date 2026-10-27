# Overnight paper-cut sweep

Run started Oct 26, 2026, 9:22 PM CT. Stop by Oct 27, 8:00 AM CT.

## Summary (in progress)

- Fixed/merged: 0. Logged, not fixed: 0. In progress: browser QA tools fail after a clean install.
- Scope: existing behavior only; protected PRs #290/#295/#296/#299, shaft layout/art and runner install/login are excluded.
- Browser plugin not available; using project Playwright. Local fixture providers only; no Testing PRs are merged.

## Top unresolved

None confirmed yet outside the active fix.

## Findings and receipts

### Oct 26, 9:25 PM CT — browser QA imports fail after clean install

- Reproduction: `bun install`, then `bun run --filter './web' a11y` exits with `Cannot find module 'playwright'` before opening a browser. `perf-bench`, `shaft-shot` and `next-move-check` have the same import.
- Cause: the workspace declares `@playwright/test`; Bun isolates its transitive `playwright` dependency.
- Fix in progress: import Chromium/devices from the declared package. No app behavior or screenshots change.

## Rotation coverage (in progress)

- Baseline: fetched main, read AGENTS/VISION/IRON-STYLE/ATTENTION/threads/PLAN, reviewed last 40 main commits and open PRs. Main lacks principle 11; #290 owns that pending change.
- Installed dependencies; UI dev server running. Baseline check, stranger journey and accessibility audit started.
