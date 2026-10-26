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

## Item notes

**Locked by Justin on Oct 26:** the Item Lab as of PR #7 is the art baseline for all 12 items.

The Item Lab (`docs/item-lab.html`, live: https://claude.ai/artifact/1LRgfMxAMrZ5gv1r2dkkKy) is the reference for
every item's model, states and animation. Port builders from there.

- **Launch pad** (Oct 26): octagonal two-step concrete pad, a flame trench across it with grates, hazard edges and rusty
  deflector lips, a launch mount with four hold-down clamps (swing back on launch), red gantry with a lift cab and two
  umbilical arms, a horizontal fuel tank on saddles, a blockhouse whose window shows the state (blue idle, blinking amber
  countdown, green launch), and a floodlight mast. Countdown vents vapor from the tank and trench; launch blows plume
  out both trench ends.
- **Solar panel** (Oct 26): three single-axis tracker rows on a gravel pad, frames in the plan's color (Claude clay,
  Codex silver, ...), an inverter cabinet in the plan's color with a 4-bar power meter, and a weather mast with a
  spinning anemometer. Sunny: rows track the sun and a light sweep runs across the cells. Capped: rows stow flat, cells
  go dark, a cloud parks overhead, the meter blinks red.


### Inspection stations (round 2, locked by Justin on Oct 26)

The verification gauntlet from `docs/LOOP.md`, one visible machine per check. Each station has a backed-up state
(a pile of crates at its input, so the bottleneck shows at a glance) and a small shield board with five pips for
"caught this week".

- **CI inspector**: the existing inspector, renamed. Adds a backed-up state.
- **Verify bay**: a glass containment chamber where the original bug runs as a small biter. A scan ring sweeps it.
  Pass: the bug bursts into green pixels. Fail: it survives, rams the glass, the chamber flashes red. A side monitor
  shows the app under test.
- **AI review**: a desk where the diff scrolls between rollers under a scanning eye on a gantry. Yellow flags pop up
  on risky lines. The sign on top lights a green check (approved) or a red X (changes). It's a different model from
  the builder (Claude builds, Codex reviews).
- **Merge gate**: the human check. PR crates wait at a striped barrier next to a booth with a "needs you" sign and a
  little worker at the button. Approve: the boom lifts and the crate rolls on. Reject: the crate goes in the red bin.
- **Rework loop**: a red-railed U-turn belt carrying failed crates back to Spark at the start of the line, each one
  with a scar tag. Clogged: the crates bunch up and the light blinks red.
- **Orbit watch**: after the launch pad. A radar mast and an orbiting satellite watch the deploy for 24 hours,
  shown as a ring of 24 hour pips around the base. A console shows a Sentry sparkline. Alert: the ring flashes red
  and the sparkline spikes.
