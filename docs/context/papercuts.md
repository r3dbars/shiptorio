# Overnight paper-cut sweep

Run: Oct 26, 2026, 9:22–10:08 PM CT. Read-only sweep completed a second rotation with no new functional finding. The fix/merge/deploy loop remains blocked by GitHub billing; deadline was Oct 27, 8:00 AM CT.

## Summary

- **1 fixed/merged; 0 verified deployed; 10 logged, not fixed yet** (8 queued product cuts, 2 protected-area/test issues).
- Merged: browser QA commands work after a clean install, [#302](https://github.com/r3dbars/shiptorio/pull/302). **Deploy blocked before any step by GitHub billing**; no live claim.
- **Player-facing fixes deployed: none.** Only the browser-tool repair merged before the billing block; there are not five shipped player-facing fixes to list.
- Highest-impact queued cuts: onboarding blank screen on a hung version probe; docs search remains empty after going back online; denied clipboard access produces an unhandled error; malformed scenario links crash the simulator.
- **Human action required:** resolve GitHub Billing & plans. Deploy [40439556051](https://github.com/r3dbars/shiptorio/actions/runs/40439556051) never started: recent payments failed or spending limit must increase. Public `/api/version` remains `be3a81b`. New code fixes are blocked under the requested Deploy gate; read-only hunting/local checks continue. Protected UI and runner install/login remain untouched.

## Top unresolved (up to 10)

1. **Onboarding stays blank indefinitely when `/api/version` hangs.** `web/src/main.tsx` has no timeout; a held Playwright request leaves `#root` empty after 6s. Queued.
2. **Docs search stays empty after reconnecting.** `docs/site/_assets/docs.js` caches the first failed index request as `[]` forever. Offline → online scripted search returns zero links. Queued.
3. **Docs Copy produces an unhandled rejection when clipboard permission is denied.** Same file; scripted rejection produces page error `Clipboard denied`. Queued.
4. **Inherited scenario names crash the simulator.** `web/src/source/index.ts` accepts `constructor`, `toString`, `__proto__` through `in`; simulator then throws an iterable TypeError. Queued.
5. **Logged, not fixed: accessibility harness predates the protected Menu change (#290).** Several selectors expect directly visible tools; 8s screenshots time out under load. Keyboard harness also repeatedly chooses the map’s “LAUNCH PAD…” label via `/^Launch/i` instead of advancing after the tour rocket. Do not change the Menu or protected product UI to appease these harnesses.
6. **Logged, not fixed: shaft map chip accessible-name mismatch.** Current-build axe audit (with a temporary Menu-aware harness) reports serious `label-content-name-mismatch` on Sentry/GitHub and station chips. Owner: protected #296 / `web/src/map/shaft/hud.ts`; leave the map/chip work untouched.
7. **Docs search reopens after Escape on slow requests.** Hold `/docs/search.json` for 1s, type “gauntlet”, press Escape; results reopen after the response. `docs/site/_assets/docs.js`; queued, blocked by Deploy gate.
8. **Docs search ArrowUp starts one result too early.** From an unselected 8-result list, first ArrowUp selects index 6 rather than the last result (7). Same docs file; scripted keyboard reproduction. Queued, blocked by Deploy gate.

9. **Admin access/quotas page is unstyled.** Authenticated `/admin/signup` renders white browser-default Times/Arial controls, unlike the other Black Iron admin pages. Reproduced at all three sizes; screenshot `admin-iphone-signup.png`. `server/src/signup.ts:147` returns raw HTML instead of the existing utility-page shell. Queued; use the existing theme only, no redesign.
10. **Landing pause target is only 36×36 px.** `web/public/welcome/index.html:82`, `#toggle` has no extended hit area; Playwright confirms its rendered rectangle. Below the style guide’s 44px touch-target minimum. Queued; no change while Deploy is blocked.

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

### Oct 26, 9:52 PM CT — additional read-only verification

- Real `previewAccess` password gate with fake local credentials (dev bypass disabled): desktop, iPhone and Pixel wrong-password 401 + visible error; correct native Enter submission unlocks; no horizontal overflow.
- Current-build vertical judge story passes at all three viewports. Full island/default story also passed at all three on the earlier pinned build. Old-build vertical-query failures were due to missing #301 in that pinned asset copy; rerun against current #302-era assets passed all three. These are fixture simulations, not real provider proof.
- Five-minute phone stability: after warmup, 1,771 geometries / 85 textures / 33 shader programs stayed flat from 150–330s. Post-GC JS heap 76.82→77.27 MiB; DOM 233 throughout. Draw calls oscillated 1,630–2,045 with render passes, without monotonic growth. Zero page errors. SwiftShader/headless timings are not physical-phone FPS.
- Authenticated local admin/flags/signup pages: all 9 size×route reads returned 200, no overflow or page errors; fake session/local SQLite identity only, no production admin writes. Access-denial behavior was checked separately.
- Temporary Menu-aware axe audit reached all 14 screens. Welcome/sign-in/intro passed; map-bearing screens expose the protected accessible-name mismatch above. Actual committed a11y command remains red; no claim of a clean audit.

### Oct 26, 10:02 PM CT — network, keyboard and remaining UI cuts

- Sim on a 150ms / ~1.4Mbps profile: meaningful UI at 10.28s. Menu → Line opened; Escape restored button focus. Resizing to 844×390, 412×915 and 1440×900 produced no document overflow. Back and reload restored the sim; an already-loaded sim remained visible offline. Zero page errors.
- Existing keyboard-only harness remains red: welcome tour and rocket completed; after entering first-run it repeatedly chooses the LAUNCH tool instead of the next tutorial/build action. A temporary narrower label matcher reached first-run but the generic action selection still needs repair. **No complete keyboard first-run pass is claimed**, and this is not sufficient evidence of a product dead end.
- Font probe: default Arial on SVG-only icon buttons is not visible text and is not counted as a typography bug. The unstyled admin page is a separate, screenshot-confirmed theme regression. Existing CSP-driven font-free utility pages were left alone.
- Only one code fix merged before the external gate; it repairs QA tooling rather than player-facing behavior. There are not five shipped player-facing fixes to list. The report names every reproduced queued cut instead.

### Oct 26, 10:08 PM CT — final read-only rotation and touch/audio

- Rebased the report on latest merged code through `402a1b9` (#313); production build passed. Second pinned-build rotation completed **80 additional page checks**, all four viewport/motion profiles, with no new unexpected app errors, HTTP failures or document overflow. Total: **160 page checks**. Known 403/404 access/error responses and browser GPU/Canvas2D advisories remain classified separately.
- Full mobile emulation for iPhone 390×844 and Pixel 412×915 (touch/coarse pointer enabled): Later advanced the check-in to a different card; no page errors or overflow. AudioContext count was zero before a gesture, running after touch, and suspended after mute. This proves activation/mute behavior, not an audible mix or physical-device sound review.
- The committed keyboard harness remains red for the generic Launch-selector loop; no full keyboard first-run pass. Welcome tour plus first rocket was reached with keyboard-only input. All 14 axe screens were inspected via the temporary Menu-aware harness; 11 map-bearing screens share the protected chip-name mismatch, three entry screens pass.
- GitHub billing is still unresolved; report PR #309 cannot pass its required check or update main. Public production remains at the last successful deployed version, rather than claiming #302 or later merges are live.

## Remaining work / resume

1. Human: resolve GitHub Billing & plans; no account settings or spending cap changed by this sweep.
2. Rerun the failed Deploy gate for #302 (or a main deployment containing it), verify green and `/api/version`, then rerun/merge report #309 after its required check is green. No CI/deploy bypass.
3. Fix the eight unprotected product cuts above one tiny PR at a time, each with a failing regression/script and green CI/Deploy. Update this report after every merge. Protected chip/Menu issues stay logged for their owners.
4. Restore the committed a11y/keyboard harnesses with test-only changes once their protected UI owners are clear; retain a separate full keyboard first-run-to-rocket acceptance check. Physical-device rendering, audible sound quality and real provider execution are not proved by these fixture runs.

## Boundaries

Protected PRs #290/#295/#296/#299 remain excluded even after merge; no shaft layout/art modules or runner install/login changes. No new features, redesigns, secrets, other Workers or direct main pushes. Browser plugin unavailable; project Playwright used. Screenshots and scratch logs initially live under `/tmp/shiptorio-papercuts`; relevant before/after evidence will accompany visual fixes.
