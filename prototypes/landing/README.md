# Local landing-page workshop

Run `bun prototypes/landing/server.ts`, then open http://localhost:4321.
The top bar switches Quiet, Factory and Story layouts, with shareable `?design=` URLs.
This is real HTML/CSS/JS for direct website iteration, not an image of a website.

Uses the approved plain logo from PR #467 and existing product art/fonts. No new
images, dependencies, production routes or Worker changes. The server listens on
loopback, serves only allowlisted read-only files and does not read credentials.
Play and Connect buttons open accessible local previews; the demo performs no real
repo operations. Docs and Open Shiptorio links are explicitly external.

This exploration targets dev and stays separate from the public homepage.
The polished logo asset is supplied by #467; preserve that dependency when merging.
Choose a direction before moving selected code into the product. The initial visual
concepts informed layout; coded icons and real product art intentionally replace
decorative generated treatments for an honest, editable website prototype.

## Verified locally

At 1440×1050 and 390×844, all three layouts load without horizontal overflow or
console/page errors. The layout switcher updates the heading, styling and URL.
Play completes all five preview states; Connect opens its explicit preview dialog;
Escape closes dialogs. In-app-browser approval-to-build navigation was also checked.
Reviewed screenshot hierarchy, logo proportions, type, plain palette, process rail,
CTA placement and phone stacking. Icons intentionally use editable vectors and the
Factory option uses existing product art. No new image generation is needed to iterate.
