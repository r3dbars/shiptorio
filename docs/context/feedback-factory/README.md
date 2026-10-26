# Feedback Factory canvas (layout reference only)

Raw artboards from Justin's "Feedback Factory" Design canvas
(https://claude.ai/artifact/HtWP6pHDcYn9TSByR6UJcn), copied 2026-10-26.

**Use these for layout and flow only.** The locked Shiptorio style is pixel 3D,
slate/amber palette, Silkscreen font (see `docs/ART.md` and AGENTS.md). Ignore the
canvas's colors and fonts.

These are `.dc.html` component files for the Design canvas runtime. They won't render
standalone (they load `./support.js`), so read them as markup.

| File | What's useful |
| --- | --- |
| `Belts.dc.html` | Factorio-style floor: belts, machines, "Review chest" = PRs waiting on you, "Load into rocket" = merge, research bar |
| `Main.dc.html` | Four lanes: Incoming → Sorted by Claude → Machines → Shipping |
| `Stack.dc.html` | Verifier lanes, escalations, morning review |
| `Chunk.dc.html` | Detail view of one cluster: quotes, the brief a machine gets, "send to" machine picker |
| `Play.dc.html`, `Base.dc.html`, `Farm.dc.html`, `Kitchen.dc.html`, `Folded.dc.html` | Earlier alternate themes and layouts |
| `canvas.json` | Canvas arrangement of the artboards |
