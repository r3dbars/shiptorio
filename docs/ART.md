# Shiptorio art direction

Real 3D models rendered as pixel art, in the style of Thariq's (@trq212) game prototype clips:
an orthographic camera at a 45° turn, a low-resolution render upscaled with hard pixel edges, a quantized palette,
and dark outlines. Everything animates. UI is pixel lettering in dark boxes with thin light borders and round
corner buttons.

Live prototype: https://claude.ai/artifact/KGfEwhDLxxu8LMjGkcqNrK (a copy is in `docs/art-prototype.html`)

## Locked settings (chosen by Justin, Oct 26)

```json
{"preset":"SHIPTORIO","px":2,"levels":32,"dither":0,"outline":0.35,"thresh":0.12,"sat":1.05,"contrast":1.05,"shadow":1,"yaw":45,"tilt":30,"lock":true,"night":false}
```

| Setting | Value | Meaning |
|---|---|---|
| `px` | 2 | Render at 1/2 resolution, upscale with nearest-neighbor |
| `levels` | 32 | Colors per channel after quantizing |
| `dither` | 0 | No ordered dithering |
| `outline` | 0.35 | Darken a pixel by 35% when a neighbor is brighter by more than `thresh` |
| `thresh` | 0.12 | Luminance difference that counts as an edge |
| `sat`, `contrast` | 1.05, 1.05 | Slight boost before quantizing |
| `shadow` | 1 | 1024px shadow map, `BasicShadowMap` (hard edges) |
| `yaw`, `tilt` | 45°, 30° | Camera turn and elevation; orthographic |
| `lock` | true | Pixel size shrinks as you zoom out (never below 1px), so zoomed-out views stay sharp |

## Implementation notes

- Three.js for the map (replaces PixiJS in the architecture doc).
- Pipeline: render the scene to a `WebGLRenderTarget` at `ceil(w/px) × ceil(h/px)` with `NearestFilter`,
  then a full-screen pass that does outline → saturation/contrast → quantize. The shader is in the prototype.
- Materials: `MeshPhongMaterial` with `flatShading`, no specular. Small canvas textures with `NearestFilter`
  (stone paving, cliff faces, belts, water).
- Machines are built from boxes, cylinders and cones in code, so they can animate (gears, smoke, rockets, biters).
- Palette: stone `#c9b48a`, cliff slate `#3a4268`, moss `#4f7d3b`, steel `#8a94a3`, amber `#f2a93b`,
  green `#5bd18b`, red `#ff5e52`, blue `#6fb2ff`, void `#1b2448`.
- Fonts: Silkscreen (pixel UI), JetBrains Mono (small text).
