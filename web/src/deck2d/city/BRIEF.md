# The city reveal: creative brief

## Justin's direction after round 1 (2026-10-29, evening). This outranks everything below where they differ.

"I think this looks really good." Three changes, then another art pass on all of it so everything matches:

1. **The islands look way too similar.** They all have the same pointy tip at the bottom and the same flat platform on
   top. Each island needs its own silhouette, top and underside, so you can tell them apart at a glance.
2. **Be more descriptive about each island as it is shown.** His words: you can integrate with Sentry to get errors
   from your real product; understand traffic behaviour with a Cloudflare integration; with PostHog you get customer
   information and funnels of where people drop off; customer acquisition, planning and automating marketing; even your
   email inbox or support triage tickets could come in. Name those integrations in the island captions. Stay honest:
   these are coming, not working. The COMING SOON plates and the card say so.
3. **The thing that connects the islands looks like a two-year-old drew it.** Redo it. It has to look like a system
   that would actually connect floating islands, in the pixel-deck style: engineering, not wires.

Still true: the line is the hero, the biggest and brightest island. The art rules below apply in full.

Justin, 2026-10-29: "This is just artwork. It isn't working, it's for show. It needs to match, it needs to animate
like our main island does, in interesting cool ways, so people get that spectacle. I want this to be the wow moment."

Scope rule: GitHub is the only real source. Nothing beyond GitHub gets built. The five other islands are scenery
that says where this goes. Nothing on screen may claim they work.

## What it is

A third zoom level on the 2D deck, and the ending of the intro story. Zoom out once: the line. Zoom out again: the
line is one lit island among six, floating over the sunset clouds, joined by truss sky bridges with belts on them.
At the end of the story the five dark islands light up one at a time with a caption each, hold all lit on
"The factory must grow.", settle back to dark with a brass COMING SOON plate under each label, and the sign-in card
slides up over the city.

Reference images (absolute paths, read them before drawing anything):

- Lit target, end of beat 4: `city-refs/website-six-islands.png`
- Dark target, end of beat 5: `city-refs/website-six-islands-dark.png`
- Bridge structure to steal: the truss in `city-refs/website-two-extra-islands.png`
- The five island paintings (1536x1024, off-palette, white background, three-quarter view): `city-refs/{errors,traffic,inbox,customers,marketing}.png`
- What the first mockup rendered (flat navy sky, thin line bridges, brown cloud blobs: all wrong, fix all three): `city-refs/mockup-desktop-city.png`, `city-refs/mockup-phone-city.png`

`city-refs/` lives in the session scratchpad, not the repo. The workflow prompt gives the absolute path.

## The ring (desktop)

```
                               [MARKETING]  far upper right, smaller, no bridge
   [ERRORS]  ==bridge==>  ┌──────────────────────┐  ····rocket arc····>  [CUSTOMERS]
   upper left             │  THE LINE (real deck) │                        right, landing pad
                          │  Repo … Launch pad    │                             ║
   [TRAFFIC] ==bridge==>  └──────────────────────┘ <====feedback bridge=========╝
   lower left                        ║
                                  [INBOX]  below
```

Errors, Traffic and Inbox each run a bridge into the left end of the line. The launch pad's rocket arc (dotted
brass) lands on the Customers pad. Customers runs a feedback bridge back to Inbox. The ring closes. Marketing hangs
far back with no bridge.

Phone (390x844): the ring stacks vertically, Marketing, Errors, Traffic, the line, Inbox, Customers, bridges running
vertically. No horizontal scroll.

The line in the middle is the real deck drawn one zoom step smaller, crates still moving. Never a picture of it.
Its label is the repo name (story: "your repo"; live: owner/name). Island labels: Errors, Traffic, Inbox,
Customers, Marketing, in the caption font.

## The reveal (end of the story)

Today the story ends: third approve, AUTOMATED, rocket, then the connect card. The reveal goes between the rocket
and the card. One thing moves at a time, always.

| Beat | What happens | Caption | Hold |
| --- | --- | --- | --- |
| 0 | (existing) rocket launches, camera on it | | |
| 1 | Zoom out one step to the whole line | "That's one line." | 1.2s |
| 2 | Zoom out to the city. Sunset sky, far skyline, clouds. Line lit, crates moving. Five dark islands, dark bridges. | "Here's the rest of the factory." | 1.5s |
| 3 | Islands light up one at a time: Errors, Traffic, Inbox, Customers, Marketing. Each ~2.2s. | one line each, below | |
| 4 | All lit. Camera fits the whole ring. Only the line moves. | "The factory must grow." | 2.5s |
| 5 | Islands go dark again in reverse order, 150ms apart; each drops a brass COMING SOON plate under its label; bridges stop. | "For now: one line. Your repo." | 1.5s |
| 6 | Card slides up over the city. Title "Start with your repo." Line "GitHub first. The rest lights up later." Yes "Sign in with GitHub". No "Replay". `setup: true`. | | |

Beat 3, per island, in this order:
1. Runway: the brass lamps along its bridge light from the line outward, 60ms apart; the belt on the bridge starts moving.
2. Island: dark, then a 2x2 checker dither of lit over dark (one step), then lit. 120ms per step. Lamp on. Glow halo on (light layer, 25/50/75% alpha, the one allowed exception).
3. Caption under the island:
   - Errors: "Crashes come in as ore."
   - Traffic: "What people do comes in as ore."
   - Inbox: "What customers say comes in as ore."
   - Customers: "Every rocket lands here." (the arc's dots light from the pad outward, then a capsule sits on the pad with one dust puff)
   - Marketing: "How people find you." (no bridge; the beacon at the mast tip lights)
4. Camera: one calm move to frame the line plus that island on desktop; on phone, pan to that island.

Reduced motion: beats 1 and 2 as cuts, then all five lit at once, hold on "The factory must grow.", dim, card. No runway, no dither.

Yes on the card goes where the connect card goes today (`/`, sign in). Replay restarts the story.

## The zoom button, outside the story

Zoom out cycles station → line → city → station in every source (story, sim, live, replay). The manual city is the
end state of beat 5: line lit, five dark, COMING SOON plates on, no captions. Zoom in returns to the station.

## Art rules (docs/context/pixel-deck.md applies in full)

- `ART_PX = 5`, whole-number zoom, nearest-neighbor, no smoothing, ever.
- Black Iron 48 only (`PALETTE` in `contract.ts`). Partial alpha only for glow halos on a light layer.
- Light from the upper right, 1 px dark outlines.
- Island sprites: the five paintings keyed (white background out), nearest-neighbor downscaled, palette-snapped.
  Target widths in art px: Errors, Traffic, Inbox, Customers about 300; Marketing about 200. The line is about 411.
  Dark variants are precomputed: everything posterized to `soot` and `iron[0]`, except the Errors fissure keeps
  `jam[0]`/`jam[1]`. Lit variants keep full detail. Both as webp in `web/public/deck/art/city/`, plus a json manifest
  with each island's anchor (where its bridge meets it), lamp position, label position, and pad position for Customers.
- Bridges: iron truss segments (steal from the two-island concept), brass lamps every 40 art px, a riveted belt on
  top drawn with the engine's existing belt code. Dark: static, lamps off. Lit: lamps on, belt moving.
- Sky: the existing `sky.webp`, far skyline and `clouds.webp` layers at the far zoom. No flat colors. Clouds drift
  slowly on their own layer behind everything and never touch an island.
- Calm: one thing moves at a time. Nothing flashes. The dim in beat 5 is a step, not a fade.
- Shippy stays on the line's island and never floats. No humans anywhere.
- Original art only. No Factorio assets.
- Sound (juice/): a quiet rising tick per runway lamp, one warm brass tap when an island lights, the existing
  shipped chord an octave down when all are lit, a soft thud per island on dim. Under the music. Mute respects it.

## What done looks like

- `bun run check` green. New unit tests for the city view, the story's reveal phases and the three-step zoom.
- `scripts/shots/deck.mjs` shots at phone and desktop at all three zoom levels, and a 24-second clip of the reveal
  from the rocket to the card, in the PR description. Not committed (never commit videos; evidence PNGs go in the PR
  body, not the tree).
- No file over 200 KB added to the repo. The 1536x1024 paintings never enter the tree.
- Existing story, sim, live and replay behave exactly as before until the player zooms to the city or the story
  reaches the reveal.
- Every control is a real `<button>` whose accessible name contains its visible text. `prefers-reduced-motion`
  respected. Captions stay in the existing `aria-live` caption element.
- Nothing on screen says or implies that Errors, Traffic, Inbox, Customers or Marketing work.
