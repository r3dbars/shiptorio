# The pixel deck (the game surface)

Justin, 2026-10-29: the 2D pixel deck is the permanent version. It's on by default (`pixelOn()` in
`web/src/flags.ts`; `?px=0` shows the old painted look). Everything below is what an agent needs to work on it.

## Where it lives

- `web/deck.html` → `web/src/deck2d/main.ts`. `contract.ts` holds every shared number (layout, palette,
  sheets, the layer API). Read its header first.
- One owner per folder at a time: `engine/` (camera, sky, clouds, belt, crates, lever), `stations/`, `props/`
  (code hull, clutter, boiler, orb), `shippy/`, `card/`, `story/`, `data/`, `grow/`, `build/`, `launch/`, `juice/`.
- Everything moving is drawn in code. Pictures are only for static things (sky, city, cloud strips).

## Art rules (don't break these)

- **Pixel density is locked.** `ART_PX = 5` world units per art px, whole-number zoom only, no smoothing.
  "I like the pixel density. Don't change that at all."
- **48-color palette** (`PALETTE` in `contract.ts`). Partial alpha only for light layers (halos at 25/50/75%).
- Light comes from the upper right, with 1 px dark outlines.
- Cool dark steel bodies, brass only on rivets, edges and glints, copper rust streaks.
- **Calm:** one thing moves at a time, only the jam pulses, nothing flashes, steam drifts slowly.
- Shippy is the only character. There is no human on the deck.
- The deck floats: clouds stay behind it on their own screen-space layer and never touch or follow it.
- Match the mockups in `/mnt/project-files/uploads/hearth/` (a6837bb2, b6328705, eaaf6b1f, f8a36ce2). Justin
  wants things spaced out, with real care on each item.

## Checking your work

- `bun test` in `web/` (the deck tests are `test/deck*`). `npx tsc --noEmit -p web`.
- Shots: `scripts/shots/deck.mjs` takes stills and clips at phone (390x844) and desktop (1280x720). Look at
  both before you push.
- On Justin's Mac: `curl -fsSL https://raw.githubusercontent.com/r3dbars/shiptorio/dev/scripts/deck-local.sh | bash`.
- Big layout changes: show Justin shots before merging. PRs go to `dev`.
