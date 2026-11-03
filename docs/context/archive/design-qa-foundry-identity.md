# Foundry identity implementation QA

Source: third displayed S-rocket refinement, `exec-0f8d8ade-d1c7-40e9-9aa7-97cc27f228c7.png`, selected by Justin.
Implementation: local app on :5184; password page rendered through the unchanged access middleware on :5185.

## Scope and visual comparison

Compared source and generated vector wordmark together in `/tmp/shiptorio-brand-comparison.png`; inspected browser renders of the actual title screen, waitlist and simulator. The reference is a brand presentation, not a complete app screen. Its separate large icon specimen is intentionally not added to the production title screen. The user explicitly requested code artwork and extending the design into the existing overlay.

- Typography: custom chamfered outlined title geometry, local Teko section headings and Rajdhani labels. Body/data retains JetBrains Mono; tagline is Georgia. Removed nearest-neighbor scaling from vector brand images. Code artwork translates the selected form/materials rather than embedding the mockup's painted lighting.
- Spacing: title above factory artwork; compact password form below. Phone form and slogan fit the first viewport at 390×844 with no horizontal overflow. Overlay header leaves room for Menu; station panels retain existing responsive/scroll behavior.
- Colors: warm brass/ivory over dark petrol enamel; green/red/amber status meanings retained. Focus outlines remain visible.
- Image quality: vector wordmark, full seal and simplified small mark; generated PNG icons and social image. Existing factory artwork/video retained. No screenshot used as UI.
- Copy: exact approved tagline, “A little play. A lot shipped.” Removed Private preview from the title screen. Native form labels and error text retained.

## Checks and interactions

- Desktop (1440×960 CSS) and phone (390×844 CSS): app identity, meaningful content, no framework error overlay, no horizontal overflow.
- Password page: invalid password renders error; valid local fixture reports acceptance and follows existing cookie redirect. This tests a local fixture, not production credentials.
- Simulator: Menu expands; merge-gate station opens, focuses its title and exposes receipts/actions; phone Menu remains accessible.
- Computed styles confirm local Rajdhani controls, Teko panel headings, smooth vector images and near-opaque dark panel surface.
- Type checks, test type checks, 790 passing tests (two platform skips), 26 simulated playtest cases / 332 decisions, production build passed.
- Existing simulator emits repeated duplicate React keys (`m15-*`) in development. No reconciliation/key code is changed by this branding patch. This is recorded as a separate existing runtime concern, not claimed fixed.

## Iteration

1. Replaced the first generic rounded outline letters with original chamfered geometry to match the chosen industrial type.
2. Removed the old inline pixel splash icon, corrected image aspect ratios, replaced pixel scaling for vectors, and retained a simpler favicon.
3. Rechecked desktop/phone entry and overlay interactions after these corrections. No outstanding P0/P1/P2 visual defects in this scope. Small fasteners and highlights are deliberately simplified compared with the painted mockup.

Screenshots are local review artifacts under `/tmp/shiptorio-title-{desktop,mobile}.png`, `/tmp/shiptorio-panel-desktop.png`, `/tmp/shiptorio-overlay-mobile.png`.

final result: passed
