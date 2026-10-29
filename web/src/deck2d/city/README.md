# City visual mockup

Throwaway `codex/city-mockup` branch. No city data or services, no server changes, no PR or deployment.

The optional `createLayer` is discovered by the entry point's existing module loader. Five static districts surround the **same engine-rendered deck**. The camera cycles station → line → city → station. The city uses a discrete 2:1 overview grid and the existing `createPixelCanvas` / `pixelZoom` implementation: integer device pixels, integer origins, nearest-neighbor sampling, no smooth camera transition. `ART_PX` and the station/line renderer remain unchanged.

Dark district assets are GPT Images outputs, loaded as static textures, snapped with nearest-neighbor sampling and posterized to soot / iron[0] at runtime. Only the Errors fissure retains jam[0]/jam[1]. The deterministic code art in `art.ts` is the loading fallback and uses the deck's actual `underside.ts` geometry. Belts reuse `engine/pxdraw.ts`; all sky belts are static. Clouds render in a separate screen-space layer behind rock and belts. The city freezes station, Shippy, power, loose-stone and launch animation, and leaves line cargo/conveyors running. Reduced motion freezes the overview, including cloud drift.

## Capture

```sh
CITY_MOCKUP=1 CLIP=12 ONLY=desktop-1280 DECK_PATH='/deck.html?source=conveyor-demo&shot=builder' node scripts/shots/deck.mjs web/test/evidence/city-mockup
CITY_MOCKUP=1 CLIP=12 ONLY=phone-390 DECK_PATH='/deck.html?source=conveyor-demo&shot=builder' node scripts/shots/deck.mjs web/test/evidence/city-mockup
CITY_MOCKUP=1 ONLY=phone-390-reduced DECK_PATH='/deck.html?source=conveyor-demo&shot=builder' node scripts/shots/deck.mjs web/test/evidence/city-mockup
```

Each folder contains `station.png`, `line.png`, `city.png`, a runtime/overflow `report.json`, and (normal-motion views) `clip.mp4`. The clip shows the two Zoom out presses and holds on the city, then the script checks return to station. This is an explicit existing conveyor rehearsal, not live GitHub activity.

## GPT Images prompts

Generated using the built-in image generation tool with transparency requested. Originals are committed in `assets/`; processing happens in the canvas, with no destructive asset edits.

Shared prompt:

> Use case: stylized-concept. Asset type: single transparent pixel-art game island sprite for Shiptorio, Black Iron industrial floating city. Isolated on genuine transparent background, entire island in frame, no shadow outside island, no clouds, no text, no letters, no watermark, no characters. 3/4 front view, broad horizontal top platform, strong coherent silhouette. Chiselled warm dark basalt boulders taper to a hanging point, riveted iron rim band, copper pillars, tiny cyan shards embedded under rim. Original 16-bit pixel art, crisp large square pixels, one pixel soot outlines, NO smooth gradients, NO blur, NO anti-aliasing, upper-right light. Black Iron palette: soot #0a0604, iron #181211 #291b17 #432f29 #6b5360 #8f6f62, steel #121e2b #273349 #3d4d6a #7d8ea3, copper #713e30 #a04430 #cd4f27 #e28059, brass #422616 #6d370c #a36915 #c98115 #fdc727 #fdec9a, cyan #28545a #0ea0ac #41f3f7. All machinery switched off, no glows. Compact very detailed game sprite; island occupies 80% of image, width about 1.5 times total height.

One separate generation per subject, appending:

- Errors: Errors island: cracked crater with dull dark red fissure (#6a0d0d #c8231b), ONE small seismograph hut with an analog waveform window, ONE unlit lamp. Nothing else.
- Traffic: Traffic island: rail yard with THREE short brass rail tracks, TWO ore carts, ONE signal gantry and ONE unlit lamp.
- Inbox: Inbox island: ONE tall mail tower with a letter slot, THREE copper pneumatic tubes curving into ONE sorting shed, ONE unlit lamp.
- Customers: Customers island: ONE steel vault with round brass door, FOUR small market stalls with copper awnings, ONE round capsule landing pad, ONE unlit lamp. No rocket or capsule.
- Marketing: Marketing island: smaller island, ONE broadcast mast with guy wires and a brass beacon at its top. No lamp or other building.

Generated detail counts are illustrative; the code fallback follows the exact object list. These are static mockup textures, not production sprite sheets.
