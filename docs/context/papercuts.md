# Overnight paper-cut sweep

Run: Oct 26, 2026, 9:22 PM CT → Oct 27, 8:00 AM CT at latest. In progress.

## Summary

- **1 fixed/merged; 5 logged, not fixed yet** (4 queued cuts, 1 protected-area test issue).
- Merged: browser QA commands work after a clean install, [#302](https://github.com/r3dbars/shiptorio/pull/302). **Deploy blocked before any step by GitHub billing**; no live claim.
- User-visible cuts queued: onboarding blank screen on a hung version probe; docs search remains empty after going back online; denied clipboard access produces an unhandled error; malformed scenario links crash the simulator.
- **Human action required:** resolve GitHub Billing & plans. Deploy [40439556051](https://github.com/r3dbars/shiptorio/actions/runs/40439556051) never started: recent payments failed or spending limit must increase. Public `/api/version` remains `be3a81b`. New code fixes are paused under the requested Deploy gate; read-only hunting/local checks continue. Protected UI and runner install/login remain untouched.

## Top unresolved (up to 10)

1. **Onboarding stays blank indefinitely when `/api/version` hangs.** `web/src/main.tsx` has no timeout; a held Playwright request leaves `#root` empty after 6s. Queued.
2. **Docs search stays empty after reconnecting.** `docs/site/_assets/docs.js` caches the first failed index request as `[]` forever. Offline → online scripted search returns zero links. Queued.
3. **Docs Copy produces an unhandled rejection when clipboard permission is denied.** Same file; scripted rejection produces page error `Clipboard denied`. Queued.
4. **Inherited scenario names crash the simulator.** `web/src/source/index.ts` accepts `constructor`, `toString`, `__proto__` through `in`; simulator then throws an iterable TypeError. Queued.
5. **Logged, not fixed: accessibility harness predates the protected Menu change (#290).** Several existing selectors expect directly visible tools. Initial run also hit 8s screenshot/locator timeouts under contention. Investigate test-only adaptation; do not change the Menu or protected product UI.

## Findings and receipts

### Oct 26, 9:38 PM CT — browser QA imports fixed, #302 merged

- `bun install` then `bun run --filter './web' a11y` failed with `Cannot find module 'playwright'` before opening a browser. `perf-bench`, `shaft-shot` and `next-move-check` had the same import.
- Import Chromium/devices from the declared root `@playwright/test` package. No app behavior changes; screenshots do not apply.
- Rebased check: **790 passed, 2 platform skips, 0 failures**; all workspace typechecks and production/runner build passed. Docs links/anchors/images and player copy: 9 tests passed. Node resolves the declared package from all five script locations.
- Local full stranger journey: all 16 steps passed in 82.1s. CI check, selfhost and stranger passed on head `e180dec`; [#302](https://github.com/r3dbars/shiptorio/pull/302) squash-merged as `b7cd43f`. Deploy [40439556051](https://github.com/r3dbars/shiptorio/actions/runs/40439556051) failed before checkout due to account billing; zero deployment steps executed.
- Accessibility now launches and initially audited eight screens with zero axe violations, before selector/time-budget failures. This is not a complete a11y pass.

### Oct 26, 9:39 PM CT — first browser rotation

- Stable production-build copy served by a local Worker with fake GitHub/Meta providers; real app, auth/session and storage code. No production mutation or real bot/Testing merge.
- **80 page checks:** 1440×900, 390×844, 412×915 and desktop reduced motion. Landing, onboarding/intro, first-run, `/judge`, scenario=judge, quiet-morning, rework-loop, heal, research, orbit, checkin, intro, shaft/iron worlds, attention tray, docs, admin paths and nonexistent path.
- No unexpected app errors or horizontal overflow. `/admin` correctly denies the non-r3dbars fixture (403); nonexistent path returns 404. GPU readback/Canvas2D performance warnings recorded separately from app failures.
- Initial overlapping build/browser runs produced transient missing assets. Reran against a stable dist copy; those 404s did not reproduce and are **not counted as product findings**.
- Docs link-check/copy tests pass. Baseline stranger covers sign-in, installation, plan approval, PR publication, stale/current CI, verify/review and human Launch with fixtures.
- Perf-bench runs after the import fix; its first contended SwiftShader numbers are not real-device performance proof. Five-minute stability and sequential judge/a11y runs remain outstanding.

### Oct 26, 9:40 PM CT — GitHub billing blocks the merge/deploy loop

- GitHub annotation: “The job was not started because recent account payments have failed or your spending limit needs to be increased.” No runner was assigned, no logs/steps, no Cloudflare mutation.
- Report PR #309 is also unable to run its required stranger check for the same reason. The requested main log update is prepared here, but cannot merge under the green-CI rule until billing is repaired.
- This is an external account gate, not a code failure. No manual deployment or billing-setting change attempted. Justin has been notified; pending cuts stay logged while local verification continues.

## Coverage still to complete

- Fresh full judge story; keyboard/a11y with current tool visibility; five-minute perf stability.
- Offline/slow network interactions, reload mid-flow, Back, resize/rotate, detailed keyboard/focus and docs interaction checks.
- Fix/verify queued cuts, merge only green agent PRs, verify Deploy after each code merge; repeat a full rotation until it finds nothing new.

## Boundaries

Protected PRs #290/#295/#296/#299 remain excluded even after merge; no shaft layout/art modules or runner install/login changes. No new features, redesigns, secrets, other Workers or direct main pushes. Browser plugin unavailable; project Playwright used. Screenshots and scratch logs initially live under `/tmp/shiptorio-papercuts`; relevant before/after evidence will accompany visual fixes.
