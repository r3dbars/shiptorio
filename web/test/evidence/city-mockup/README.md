# City mockup evidence

Branch: `codex/city-mockup`. No PR, merge, deployment, or server changes.

## Running app

Captured with `scripts/shots/deck.mjs`, `CITY_MOCKUP=1 CLIP=12`, explicit existing conveyor rehearsal `/deck.html?source=conveyor-demo&shot=builder`. Browser plugin unavailable; used the repository's Playwright capture path.

| Folder | CSS viewport | Motion | Captures |
| --- | --- | --- | --- |
| `desktop-1280/` | 1280×720 | normal | `station.png`, `line.png`, `city.png`, `clip.mp4` |
| `phone-390/` | 390×844 | normal | `station.png`, `line.png`, `city.png`, `clip.mp4` |
| `phone-390-reduced/` | 390×844 | reduced | `station.png`, `line.png`, `city.png`, `clip.mp4` |

All three clips are 12.000 seconds. They start at station view, press Zoom out for line, press Zoom out for city and hold the city view. The script also checks Zoom in returns to station.

All three reports: zero runtime/console/request problems, zero horizontal overflow, six labels fit, expected page title and caption, integer pixel zoom, at most 48 canvas colors. The shots were visually inspected at station, line and city on phone and desktop. No framework error overlay. Reduced-motion phone capture included.

`bun run check`: PASS, 2,033 tests, zero failures, typecheck and build passed. No live GitHub actions were exercised. Generated artwork is illustrative and does not imply working external data integrations.

## Generated website concepts

`concepts/` contains separately generated GPT Images website mockups based on the actual line screenshot. These are concept images, not runtime screenshots. See `concepts/README.md` for directions and the lighting refinement prompt.
