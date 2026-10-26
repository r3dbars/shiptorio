# Black Iron style guide (the whole game)

Justin, Oct 26: the Black Iron look from PR #204 (`/art/black-iron.html`, source `docs/art/black-iron/`) is
**the art style for the whole game**: the logo, the password gate, sign-in, landing, intro, tutorial, every
sheet, card and panel, the HUD, the docs site, and the 3D map. This page is the rulebook. If a surface
doesn't follow it, it's a bug.

Reference build: open `docs/black-iron.html` (needs three r128; in a cloud container route
`**/three.min.js` to a local copy from the `three@0.128.0` npm tarball). Copy its feel, not just its colors.

## 1. The feel in one paragraph

A dark, oily, dirty steampunk foundry, **brightened so it reads on a phone**. Black iron and soot, warm
furnace light from below, brass and copper fittings, rust streaks, teal aether conduits with travelling
pulses, tesla sparks. UI sits on it like **riveted iron plates bolted to the factory**: square corners,
hard 2px borders, pixel lettering, amber caution paint for anything that needs you. Nothing is glassy,
blurred, rounded or pastel. **Work visibly moves**, and every machine is clearly IDLE, WORKING or BLOCKED.

## 2. Color tokens

Canonical values live in `web/src/iron.css` (`--iron-*`). Server-rendered pages (gate, signup) inline the
same hex values. Never invent a new near-duplicate; add a token here first.

| Token | Value | Use |
| --- | --- | --- |
| `--iron-bg` | `#0b0806` | page / void behind everything |
| `--iron-soot` | `#1e1814` | deep fills, wells, inputs |
| `--iron-panel` | `rgba(14,10,8,0.92)` | plates over the map |
| `--iron-panel-solid` | `#140e0a` | plates on flat pages |
| `--iron-plate` | `#2a211b` | raised face (buttons, rows, hover) |
| `--iron-line` | `#5a4434` | the 2px plate border |
| `--iron-line-hi` | `#8a6a4c` | hover / active border |
| `--iron-outline` | `#000` | the 2px outer outline around plates |
| `--iron-ink` | `#f4ead8` | body text (15.9:1 on panel) |
| `--iron-dim` | `#b8a48a` | secondary text (8.3:1, AA at any size) |
| `--iron-amber` | `#ffb020` | primary action, NEEDS YOU, caution paint. Text on it is `#140c02` |
| `--iron-ok` | `#46e07a` | WORKING, pass, shipped |
| `--iron-bad` | `#ff4a32` | failed, rejected, alarm |
| `--iron-idle` | `#8fa2c8` | IDLE, waiting |
| `--iron-focus` | `#6fb2ff` | keyboard focus ring only |
| `--iron-brass` | `#d0a24e` | trim, rivets, headings accents |
| `--iron-copper` | `#c06a3a` | pipes, secondary trim |
| `--iron-rust` | `#8a3a20` | grime, streaks (decor only, never text) |
| `--iron-aether` | `#7af0d8` | the "smart" accent: AI review, planner, power conduits, links on dark |
| `--iron-furnace` | `#ff7a2a` | ember glow, under-lighting (decor; text only at ≥ 18px) |

Source colors for ore: Sentry `#ff4a3a`, GitHub `#ffb040`, Inbox `#5aa8ff` (same as the mine mouths).

Backgrounds behind full-screen pages: a vertical furnace gradient `#1c120c → #7a3a16` (the 3D sky), or the
real map / island rendering. Never the old navy `#1b2448` void.

## 3. Type

| Role | Font | Rules |
| --- | --- | --- |
| Display, titles, labels, buttons, stat numbers | **Silkscreen** 400/700 (`--iron-pixel`) | UPPERCASE, letter-spacing 0.06–0.14em. Min 10px (labels), 11px (buttons), 13px+ for titles. Never for sentences. |
| Body, sentences, details, logs | **JetBrains Mono** 400/600 (`--iron-mono`) | Sentence case. Min 12px in-game, 14–16px on flat pages. |

Both are self-hosted in `web/public/fonts/` (`/fonts/silkscreen-400.woff2`, `-700`, `/fonts/jetbrains-mono.woff2`,
a variable font for 400–700), public past the preview gate. Don't load Google Fonts at runtime. Silkscreen is wide:
budget about 1.4× the width Barlow needed, and let labels wrap or shorten rather than shrink below the minimum.

## 4. Plates (panels, cards, sheets, chips)

```css
background: var(--iron-panel);
border: 2px solid var(--iron-line);
outline: 2px solid var(--iron-outline);   /* the black outer edge, like the pixel pass's ink outline */
border-radius: 0;
box-shadow: inset 0 2px 0 rgba(255,220,170,0.06), inset 0 -3px 0 rgba(0,0,0,0.35);  /* lit top edge, sooty base */
```

- **Square corners everywhere.** No `border-radius`, no `backdrop-filter` glass, no soft drop shadows.
- Optional **rivets**: 4px brass squares (`--iron-brass` with a 1px darker bottom-right) in the plate corners,
  via the `.iron-rivets` helper. Use on big plates (sheets, gate, sign-in), not on small chips.
- Optional **eyebrow** above a title: Silkscreen 9–10px, `--iron-dim`, 0.14em tracking (e.g. `COGWORKS · BLACK IRON`).
- Headers can carry a **caution stripe** (`repeating-linear-gradient(-45deg, amber 0 6px, #140c02 6px 12px)`) only
  when the plate is about something blocked / needing you.
- Dividers: 2px `--iron-line`, or a dotted rivet line. Not hairlines.

## 5. Buttons and inputs

- **Primary**: `--iron-amber` fill, `#140c02` text, 2px `#000` border, Silkscreen 11px, square. Hover lifts to `#ffc24a`.
  Pressed: shift down 1px and drop the bottom shadow.
- **Secondary**: transparent / `--iron-plate` fill, `--iron-ink` text, 2px `--iron-line` border; hover `--iron-line-hi`.
- **Toggle on** (`aria-pressed="true"`): amber fill like the reference's `1X` / `LINE` buttons.
- **Danger**: `--iron-bad` border + text on plate; filled red only for confirm-destroy.
- **Inputs**: `--iron-soot` fill, 2px `--iron-line` inset border, JetBrains Mono 15–16px (16px on phones, no iOS zoom),
  amber caret, focus = 3px `--iron-focus` outline at 2px offset.
- Touch targets ≥ 44px (visible size can be smaller with an invisible hit area, as today).

## 6. State language (the heart of the look)

| State | Color | Dot | Plate | Words |
| --- | --- | --- | --- | --- |
| IDLE | `--iron-idle` | steady | `--iron-line` border | `IDLE` + what it waits for |
| WORKING | `--iron-ok` | blinks 0.9s | border `#2f7a46` | `WORKING` + `#142 · punching cards` |
| BLOCKED / NEEDS YOU | `--iron-amber` text, `--iron-bad` dot | blinks 0.4s | amber border, **ping** ring 1s | `NEEDS YOU` + one action button |

`@keyframes iron-ping` (amber box-shadow ring) and `iron-blink` live in `iron.css`. All of it stops under
`prefers-reduced-motion` (keep the color change, drop the motion).

Work items are named like the reference: `#142` in Silkscreen + title in mono; tags color by kind (pass green,
reject red, held amber, followed blue).

## 7. Icons, images, logo

- Icons are **pixel icons** on an integer grid (SVG with `shape-rendering="crispEdges"`, or PNG with
  `image-rendering: pixelated`), 1–2 colors from the tokens. No line-icon sets, no emoji in chrome.
- Screenshots / hero images come from the **real** renderer (`/art/black-iron.html` or the live map), never a mockup.
- Logo files live in `web/public/brand/` (wordmark, mark, favicons, OG). Use the SVG wordmark for headings that say
  SHIPTORIO; don't re-type the name in Silkscreen next to it.

## 8. Motion and sound cues

- Steps, not eases, for UI chrome (`steps(2)` belt crawl, 1-frame flash on change). Panels slide in ≤ 160ms.
- Ping / blink only on things that need attention. One pulsing thing on screen at a time if possible.
- Respect `prefers-reduced-motion` and the in-game reduced motion setting.

## 9. 3D map (three.js)

The live map moves toward the Black Iron world: oil-black iron, brick, brass, copper, verdigris, furnace light
from under the island, teal aether conduits, rust and soot decals. Albedos lifted ~25–40% over the dark diorama
so it reads at 1x on a phone. Pixel pass finish from the reference (`world.js`):
`{ levels: 52, dither: 0.06, outline: 0.42, thresh: 0.1, ink: '#100806', sat: 1.02, contrast: 1.04, bloom: 0.7,
bloomThresh: 0.64, vignette: 0.2, grade: 0.28, shadow: '#2a1c40', high: '#ffd6a0' }`, sky `#1c120c → #7a3a16`.
Machines keep their IDLE / WORKING / BLOCKED looks (caution post + status lamp, see `CONTRACT.md`).
Perf budgets from #167 (`?perf`, governor, perf-bench) still hold: bake static decor, ration point lights.

## 10. Rules that always apply

- Player text lives in `web/src/copy.ts`. No "Spark" in player copy except the one "powered by Meta Muse Spark" credit.
- axe: 0 violations (PR #201). Text AA 4.5:1 (3:1 for ≥ 18px / bold 14px). Focus always visible.
- Perf budgets (PR #167) pass. Fonts are ~47 KB total; don't add more families.
- Big new UX goes behind a flag first; reskins of existing surfaces can ship directly.
- Self-review with desktop (1440×900) and phone (390×844) screenshots before merging.
