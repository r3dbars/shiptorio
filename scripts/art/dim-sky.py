#!/usr/bin/env python3
"""Bake the dimmed sky and cloud sea (web/public/deck/art/<name>-dim.webp) so the deck's first frame doesn't do it.

The engine dims these two background pictures the pixel-art way (web/src/deck2d/engine/dim.ts: snap each pixel to its
nearest palette color, then step darker on that color's ramp). On a phone that loop took ~1.5s of the first frame.
This is the same math, run once here; engine.ts uses <name>-dim when it's on disk and dims at runtime otherwise.

Re-run after changing sky.webp, clouds.webp, the palette or DIM:  python3 scripts/art/dim-sky.py
web/test/deck2d-dim-baked.test.ts fails while a baked file is older than its source.
"""
import hashlib, json, pathlib, re
from PIL import Image

ROOT = pathlib.Path(__file__).resolve().parents[2]
ART = ROOT / "web/public/deck/art"
NAMES = ["sky", "clouds"]

contract = (ROOT / "web/src/deck2d/contract.ts").read_text()
block = re.search(r"export const PALETTE = \{(.*?)\} as const;", contract, re.S).group(1)
ramps = [(name, [tuple(int(h[i:i + 2], 16) for i in (1, 3, 5)) for h in re.findall(r'"(#[0-9a-fA-F]{6})"', body)])
         for name, body in re.findall(r"(\w+):\s*\[([^\]]*)\]", block)]
DIM = int(re.search(r"const DIM = (\d+);", next(f.read_text() for f in (ROOT / "web/src/deck2d/engine/dim.ts", ROOT / "web/src/deck2d/engine/engine.ts") if f.exists() and "const DIM =" in f.read_text())).group(1))

# Flat palette in search order (ramp by ramp, light to dark); first nearest match wins, exactly like dim.ts.
flat = []
for name, ramp in ramps:
    for n, rgb in enumerate(ramp):
        flat.append((rgb, ramp[max(0, n - DIM - (1 if name == "sun" else 0))]))

cache = {}
def dim(rgb):
    hit = cache.get(rgb)
    if hit is None:
        r, g, b = rgb
        best, hit = None, None
        for (pr, pg, pb), to in flat:
            e = (pr - r) ** 2 + (pg - g) ** 2 + (pb - b) ** 2
            if best is None or e < best: best, hit = e, to
        cache[rgb] = hit
    return hit

sums = {}
for name in NAMES:
    src = ART / f"{name}.webp"
    im = Image.open(src).convert("RGBA")
    px = [(*dim((r, g, b)), a) if a else (r, g, b, a) for r, g, b, a in getattr(im, "get_flattened_data", im.getdata)()]
    out = Image.new("RGBA", im.size); out.putdata(px)
    out.save(ART / f"{name}-dim.webp", lossless=True, quality=100, method=6, exact=True)
    sums[name] = hashlib.sha256(src.read_bytes()).hexdigest()
    print(f"{name}-dim.webp {im.size[0]}x{im.size[1]} {(ART / f'{name}-dim.webp').stat().st_size // 1024} KB")

(ART / "dim-sources.json").write_text(json.dumps({"dim": DIM, "palette": hashlib.sha256(block.encode()).hexdigest(), "sources": sums}, indent=2) + "\n")
