# Task 64: cold private snapshot

The paired local workerd measurement is in `workerd-timing.json`. It runs the real private entry, D1, and Factory/Provider Durable Objects with isolated fixture providers and no external calls. The committed harness is `server/test/cold-snapshot-benchmark.ts`.

| Measurement | Before | After |
| --- | ---: | ---: |
| First socket snapshot | 43 ms | 37 ms |
| Median of ten warm socket snapshots | 26.5 ms | 20.5 ms |

These are local socket-upgrade-to-snapshot measurements, not page asset timings or proof that the reported staging 9–10 seconds is now below five seconds. A separate repeat under concurrent local tests varied substantially; use paired runs on a quiet host. Every Server-Timing phase is retained for inspection. No authorization result is cached.

The phone (390×844 CSS pixels) and desktop (1280×720) before/after shots use the same injected live-protocol fixture on the unchanged renderer. They verify the presentation is unaffected; they do not measure authentication or establish live backend readiness. Captured with `scripts/shots/deck.mjs` and visually inspected.
