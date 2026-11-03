# Deck front door (#72)

Before/after the same signed-out `/deck.html?source=live` at 390×844 and 1280×720.
The temporary Vite fixture returns the normal guest `/api/me` response; it has no GitHub access or secrets.

| Before | After |
| --- | --- |
| Sign-in card on first load | Story plays first; the existing sign-in card follows its three decisions |
| Repo inbox / Codex engine during story and watch | Chips only for a signed-in live repo |
| See all | Zoom out (same zoom behavior) |

Captured with `BASE_URL=http://localhost:5211 DECK_PATH='/deck.html?source=live' ONLY=phone-390 node scripts/shots/deck.mjs web/test/evidence/deck-front-door/{before,after}`, then `ONLY=desktop-1280`.
Both final captures passed blank-canvas, overflow and console checks. A discarded proxy-only attempt failed Vite HMR; direct Vite middleware fixed the test harness without changing product behavior.
Browser plugin skill absent; used the repository's explicitly requested Playwright screenshot script.

- _Phone before (screenshot moved out of the repo: project files `shiptorio/evidence/web/test/evidence/deck-front-door/before/phone-390/01-settled.png`)_ / _after (screenshot moved out of the repo: project files `shiptorio/evidence/web/test/evidence/deck-front-door/after/phone-390/01-settled.png`)_
- _Desktop before (screenshot moved out of the repo: project files `shiptorio/evidence/web/test/evidence/deck-front-door/before/desktop-1280/01-settled.png`)_ / _after (screenshot moved out of the repo: project files `shiptorio/evidence/web/test/evidence/deck-front-door/after/desktop-1280/01-settled.png`)_

The real Chromium interaction check also completed `story-call-1`, `story-call-2`, and `story-call-3` at both viewport sizes, then found the existing Sign in card. Story/watch/signed-out-repo chips remained absent. Closing the sign-in card replays the story with new decision IDs. A stale click from the previous playthrough cannot answer the replay. No console or page errors. Extra screenshots wait for card-entry animations to finish:

- _Phone first decision (screenshot moved out of the repo: project files `shiptorio/evidence/web/test/evidence/deck-front-door/after/phone-390/story-first-card.png`)_ / _final sign-in (screenshot moved out of the repo: project files `shiptorio/evidence/web/test/evidence/deck-front-door/after/phone-390/story-sign-in.png`)_
- _Desktop first decision (screenshot moved out of the repo: project files `shiptorio/evidence/web/test/evidence/deck-front-door/after/desktop-1280/story-first-card.png`)_ / _final sign-in (screenshot moved out of the repo: project files `shiptorio/evidence/web/test/evidence/deck-front-door/after/desktop-1280/story-sign-in.png`)_
- [Interaction receipt](browser-proof.json)
