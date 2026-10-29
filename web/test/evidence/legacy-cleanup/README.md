# Legacy frontend cleanup (#70)

The 2D deck remains the product. The older UI is still used by `/judge`, `?px=0`, and retained art/rehearsal pages, so it cannot be deleted wholesale.

## Reachability audit

Started from every HTML module script (including inline imports), followed relative static and dynamic imports, and explicitly included Vite's `deck2d/*/index.ts` and `map/shaft/modules/*.js` discovery. `.d.ts` resolutions were paired with the actual `.js` implementation. All runtime modules in the assigned old-UI directories remain reachable. In particular:

- `deck.html` uses the live/sim source and shared store; it still needs the link-opening helper from `ui`.
- `index.html` loads `App`, including the `?px=0` renderer, panels, progression and sound.
- `/judge` loads `Judge` through the index entry, the simulator, map, captions and sound.
- Retained `/lab`, `/shaft`, construction and artwork pages use the map builders.
- The shaft's glob loads all its art modules; their flags and dynamic registration do not make them dead code.

Removed only symbols with no runtime imports, calls or namespace consumers anywhere in the repository: `XpPop`, `PressureGauge` (and its private dimensions), `Mark`, `SlowSpotLine`, and `MINE_OF_ORE`. Removed their exclusive XP-toast, gauge and slow-spot CSS, plus the unused slow-spot plate selector. Kept soundtrack audition exports used by the documented art workflow. No active feature flags, route handlers, simulator states or art assets were removed.

## Visual proof

Before is the parent commit; after is the cleanup. The expected result is no visible change. Both 1280×720 and 390×844 are captured for the deck, the old `?px=0` UI, and the judge welcome/running views. Deck/px0 use `scripts/shots/deck.mjs`; the judge capture additionally clicks its existing Play button before waiting for its canvas. Browser reports are beside the screenshots. These local fixtures make no live jobs or writes.

Same-base builds (parent `e21ad197`) reduce emitted CSS from 182,268 to 179,503 bytes (41,029 to 40,620 gzip). Emitted JS falls by 12 bytes; the removed widgets were already tree-shaken, so initial JS remains 767,450 gzip bytes. Full check: 1,891 pass, 2 existing platform skips, 0 fail. No new tests were needed for unreachable code removal; the existing route, simulator and UI tests remain green.
