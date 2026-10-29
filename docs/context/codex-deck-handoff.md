# Codex handoff: the 2D pixel deck

Justin, 2026-10-29: "I want to use Codex to iterate on the copy you have here." Codex works **directly on the real deck**
(`web/src/deck2d/`, page `web/deck.html`; pixel mode is the default now). There is no separate Codex variant. Read this whole page
before your first commit.

## What the deck is

One floating iron deck in open air, one line left to right: **Repo → Planner → Builder → Checks → Review → Gate →
Launch**. Crates are changes, rockets are releases, Shippy (a small folding robot) is the only character. No humans.
At most one card on screen, ever. The camera parks on the one bottleneck. The line builds out piece by piece as the
story (first run) or the real factory (`?source=live`) moves.

- Dev: `bun install && bun run dev:web`, then http://localhost:5173/deck.html
- Useful params: `?seed=1` deterministic story, `?speed=2` faster time,
  `?source=story|live|demo`.
- Preview pages for single slices: `web/stations.html`, `web/shippy.html`, `web/shippy-sheet.html`, `web/deckbuild.html`,
  `web/deckgrow.html`, `web/launch.html`.

## The contract (`web/src/deck2d/contract.ts`)

It's the one file every slice builds against. **Codex never edits it.** If you need a field, write the exact diff in
your PR description and the hub thread adds it (fields get added, never renamed).

- `DeckView` is everything on screen at one moment: `stops` (all seven, in `STOPS` order), `jam`, `card` (≤1),
  `shippy`, `shipped`, `caption`. Sources (`data/`, `story/`) produce it and the engine draws it.
- `DeckEvent` + `DeckBus`: everything that happens (build-start, station-built, jam, approve, later, launch,
  deck-grow, build-stage, launch-stage, tap…). Juice, sound and effects listen to the bus. They never poll state.
- `DeckLayer` / `CreateLayer`: `grow/`, `build/`, `launch/`, `juice/` and `props/` export `createLayer`, and main.ts
  mounts them. Slots run in this order: `sky-far · deck · line · stations · front`. `replaces` tells the engine what
  the layer owns outright.
- Page hooks: `<body data-deck-ready>` is set after sprites load and the first frame draws. Tests and shots wait on it.

## Art direction (locked 2026-10-28, Justin). Every PR must follow it.

The full rules live in `docs/context/pixel-deck.md` (the hub's doc) and the "pixel canvas" block in contract.ts. In short:

1. **One pixel canvas.** 640×360 art px landscape, 360×640 portrait, blown up at a whole-number scale with smoothing off.
   1 art px = `ART_PX` (5) world units, so use `snap()`.
2. **Whole art px only.** fillRect, no arcs, no anti-aliasing, no rotating or free-scaling sprites. Anything that turns
   gets frames.
3. **Only `PALETTE` (Black Iron 48) colors**, alpha fully on or off. Partial alpha only for halos (glow/steam at 25/50/75%).
   Keep `ART_PX` 5 and whole-number zoom.
4. **Light from the upper right.** Top/right faces use the light end of a ramp, bottom/left the dark end. A 1 art px
   soot outline goes around anything on the deck, and inside lines use the ramp's darkest color.
5. **Color means something.** Jam reds = stuck only. ok greens = done/automatic only. Energy cyan = Shippy's eye, the
   core, power. Iron/steel are cool and dark. **Brass only as rivets, joints and where light catches**, never as fill.
6. **Calm.** One thing moves at a time. Nothing ambient flashes; only the jam beacon breathes. Effects only at focal
   moments, one sound per beat.
7. **Clouds stay behind the deck** in screen space. Shippy is the only character.
8. Sizes in art px: station ~38 tall, Shippy ~16 standing, crate ~8, belt ~7 tall.
9. Player-facing words are plain. No "Spark". Options that are recommended just say "Suggested".

When in doubt, match what's on the canvas today. Don't introduce a new style.

## Who owns what (don't edit files you don't own)

Claude threads are actively painting the deck. Codex takes only the slices its prompt names. Owners as of
2026-10-29:

| Area | Owner | Codex may |
| --- | --- | --- |
| `contract.ts`, `main.ts`, `engine/*`, `deck.css`, `web/deck.html` | Claude hub ("Plan the 2D pixel-art facelift"), widening stop spacing now | read; propose diffs in the PR |
| `stations/*` | Claude stations thread | read only |
| `props/*` (hull, clutter, boiler, orb) | Claude hull thread (#589) | read only |
| `shippy/*` | Claude Shippy thread | read only |
| `card/*` | Claude card thread | read only |
| `grow/*`, `build/*` | Claude threads | read only |
| `web/test/deck*` + new deck tests, perf, layout QA harness | **Codex** | own (prompts #36–#38) |
| `juice/*` (sounds + effects) | **Codex** | own (#39) |
| `story/*` copy (words only) | **Codex** | own the strings (#40) |
| `data/*` (real repo data, `?source=live`) | **Codex** | own (#41) |
| `launch/*` (rocket island) | **Codex** | own (#42) |

This split is from the hub on 2026-10-29 and changes as threads finish. Ask through Justin if it looks stale.

If you're unsure, run `git log --since=6.hours -- <path>`. If a Claude thread touched it recently, don't edit it. Put the
idea in your PR instead.

## Branch flow (docs/context/branches.md)

- Branch from `origin/dev`, open the PR against **`dev`**, never `main`.
- Rebase on `origin/dev` before you start and before every push. The deck gets several merges an hour.
- Small PRs: one slice, one idea. Push early, open a draft PR after the first push, mark it ready when done.
- Merge your own PR to `dev` once check, selfhost and Stranger are green (~3–6 min). Staging (shiptorio.dev) deploys on
  push. `main` only moves on a dev→main promotion Justin asks for.
- Never commit secrets. Never touch the other Cloudflare Workers. Never merge `shiptorio[bot]` factory PRs.
- Add one line to `docs/context/threads.md` per PR.

## Self-review with shots (required for anything visible)

```
node scripts/shots/deck.mjs /tmp/deck-shots                      # starts vite itself
DECK_PATH='/deck.html?px=1&seed=1' node scripts/shots/deck.mjs /tmp/deck-shots
CLIP=12 DECK_PATH='/deck.html?px=1&seed=1' node scripts/shots/deck.mjs /tmp/deck-shots   # + 12s clip
```

It saves `00-first`, `01-settled`, `02-full` and `report.json` per view (desktop-1440, desktop-1280, phone-390, and
phone-390 with reduced motion; `ONLY=desktop-1280` runs one view). It exits 1 on a page error, a blank canvas or a page wider than the phone. Every visible PR needs **before
and after** shots at **390×844 and 1280×720** in its description, and you look at them yourself before marking ready:
check for off-palette colors, smoothing blur, overlap with the card, and anything moving that shouldn't.

Tests: `bun test web/test/deck*` for the deck, and `bun run check` before ready.
