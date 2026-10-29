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

- [Phone before](before/phone-390/01-settled.png) / [after](after/phone-390/01-settled.png)
- [Desktop before](before/desktop-1280/01-settled.png) / [after](after/desktop-1280/01-settled.png)
