# Deck keyboard and screen-reader basics (#62)

A named card gets focus. Tab reaches Later and the main action in their existing order. Enter accepts; Escape chooses Later. A merge still requires the existing held press. The canvas has a short image label and the caption is an atomic polite status.

| View | Before | After | Keyboard focus | After keyboard loop |
| --- | --- | --- | --- | --- |
| 1280×720 | _before (screenshot moved out of the repo: project files `shiptorio/evidence/web/test/evidence/deck-keyboard/before/desktop-1280/01-settled.png`)_ | _after (screenshot moved out of the repo: project files `shiptorio/evidence/web/test/evidence/deck-keyboard/after/desktop-1280/01-settled.png`)_ | _focus (screenshot moved out of the repo: project files `shiptorio/evidence/web/test/evidence/deck-keyboard/desktop-1280-focus.png`)_ | _complete (screenshot moved out of the repo: project files `shiptorio/evidence/web/test/evidence/deck-keyboard/desktop-1280-complete.png`)_ |
| 390×844 | _before (screenshot moved out of the repo: project files `shiptorio/evidence/web/test/evidence/deck-keyboard/before/phone-390/01-settled.png`)_ | _after (screenshot moved out of the repo: project files `shiptorio/evidence/web/test/evidence/deck-keyboard/after/phone-390/01-settled.png`)_ | _focus (screenshot moved out of the repo: project files `shiptorio/evidence/web/test/evidence/deck-keyboard/phone-390-focus.png`)_ | _complete (screenshot moved out of the repo: project files `shiptorio/evidence/web/test/evidence/deck-keyboard/phone-390-complete.png`)_ |
| 390×844 reduced motion | — | — | _focus (screenshot moved out of the repo: project files `shiptorio/evidence/web/test/evidence/deck-keyboard/phone-390-reduced-focus.png`)_ | _complete (screenshot moved out of the repo: project files `shiptorio/evidence/web/test/evidence/deck-keyboard/phone-390-reduced-complete.png`)_ |

Before/after uses `ONLY=phone-390` / `ONLY=desktop-1280`, `BASE_URL=http://127.0.0.1:5258`, `DECK_PATH='/deck.html?source=attention-demo'`, and `node scripts/shots/deck.mjs <output>`. These are explicit sample issues, not live work. Phone generic shots use DPR 2 (780×1688 bitmap); keyboard proof uses DPR 1 at the same CSS size.

The keyboard-only browser run uses Tab → Tab → Enter → wait for Review → Escape → next issue → Escape → canvas. Both normal sizes and reduced-motion phone pass with zero axe WCAG violations and zero page errors: [report](keyboard-axe.json). No mouse click, API write or real job is used. Browser recordings are retained outside git in project files to keep clones small.

A separate browser fixture also checked the actual card component with the new wiring: a short Enter press cannot merge; Escape cancels a held press; holding Enter crosses the existing threshold once. The Bun role/keyboard tests verify the same cases in CI. Physical assistive-technology use remains a manual acceptance check.
