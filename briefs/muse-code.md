# Muse Code lane: demo app and sprites

Read `AGENTS.md` and `PLAN.md` first.

> **Note:** the sprite section predates the 3D pixel-art decision. Machines are now 3D models built in code
> (see `docs/ART.md` and `docs/item-lab.html`), so the sprite part of this lane is optional.

## Demo app (needed Mon 10/26)

A small shop web app in its own repo (`shiptorio/demo-shop`) that the factory works on during the demo.

- Pages: product list, product page, cart, checkout, account.
- Sentry and PostHog wired in from the start.
- A test suite that passes, plus 3 planted bugs, each a small fix:
  1. Checkout button throws on click (shows up in Sentry).
  2. Cart total wrong for quantities over 1 (caught by a test the fix should add).
  3. Dark-mode contrast broken on the account page (caught by the visual inspector).
- Write down each planted bug, its location and the expected fix in `PLANTED_BUGS.md` in this repo, not in the demo app.

## Sprites (needed Tue 10/27)

Original art only: no Factorio sprites. Top-down, grid-aligned, one tile = 32 px.
Machines (splitter, assembler, inspector, visual inspector, cleanup, turret, launch pad, rocket),
belts (straight, corner, splitter), ore patches (Sentry crater, inbox well, issue mine), biters, pollution cloud,
power (steam plant, solar panel, battery).
