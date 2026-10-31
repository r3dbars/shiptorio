# Bakes the launch pictures for the pixel deck (?px=1): Justin's island + tower frames (launch-*.webp, cut by
# slice-art.py) shrunk to art size (1 art px = ART_PX world units, at the scale index.ts draws them), alpha cut
# at 50%, every pixel snapped to the Black Iron 48 (PALETTE in contract.ts).
#   python3 web/src/deck2d/launch/bake-px.py
import re
from pathlib import Path
from PIL import Image

ROOT = Path(__file__).resolve().parents[3]
ART, OUT = ROOT / "public/deck/art", ROOT / "public/deck/px/launch"
OUT.mkdir(parents=True, exist_ok=True)
contract = (ROOT / "src/deck2d/contract.ts").read_text()
block = contract[contract.index("export const PALETTE = {"):]
block = block[: block.index("} as const")]
PAL = [tuple(int(h[i:i + 2], 16) for i in (0, 2, 4)) for h in re.findall(r'"#([0-9a-f]{6})"', block)]
ART_PX = 5
sun = block[block.index("sun:"):]; sun = sun[: sun.index("]")]
cop = block[block.index("copper:"):]; cop = cop[: cop.index("]")]
COPPER = {tuple(int(h[i:i + 2], 16) for i in (0, 2, 4)) for h in re.findall(r'"#([0-9a-f]{6})"', cop)}
CLOUD = {tuple(int(h[i:i + 2], 16) for i in (0, 2, 4)) for h in re.findall(r'"#([0-9a-f]{6})"', sun)}
# name -> world scale the layer draws it at (index.ts ISLAND.s / TOWER.s)
JOBS = {"island-2": 1, "island-3": 1, "tower-0": 0.66, "tower-1": 0.66, "tower-2": 0.66}

def near(c):
    return min(PAL, key=lambda p: (p[0] - c[0]) ** 2 * 3 + (p[1] - c[1]) ** 2 * 4 + (p[2] - c[2]) ** 2 * 2)

def drop_wisps(im):
    """The sheet's island sits in orange cloud; remove the cloud bits hanging off its edges (orange runs that touch
    the outside, below the rim or at the far sides), keep the rim's own glow."""
    w, h = im.size
    p = im.load()
    warm = CLOUD | COPPER
    cand = lambda x, y: p[x, y][3] and p[x, y][:3] in warm and y > h * 0.4 and (y > h * 0.64 or x < w * 0.12 or x > w * 0.88)
    out = lambda x, y: not (0 <= x < w and 0 <= y < h) or not p[x, y][3]
    seen, stack = set(), [(x, y) for y in range(h) for x in range(w) if cand(x, y) and any(out(x + dx, y + dy) for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1)))]
    while stack:
        x, y = stack.pop()
        if (x, y) in seen: continue
        seen.add((x, y))
        for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1)):
            nx, ny = x + dx, y + dy
            if 0 <= nx < w and 0 <= ny < h and (nx, ny) not in seen and cand(nx, ny): stack.append((nx, ny))
    for x, y in seen: p[x, y] = (0, 0, 0, 0)

# Art direction (PIXEL-CANVAS.md): iron is dark and cool, brass is jewelry. The tower frames are painted warm
# brown/brass, so their body colors move onto the steel ramp by brightness; brass-3 and up stays as trim and glints,
# sun (lamps), copper (rust) and soot stay as they are.
H = lambda h: tuple(int(h[i:i + 2], 16) for i in (1, 3, 5))
STEEL = ["#121e2b", "#273349", "#3d4d6a", "#7d8ea3"]
COOL = {H(a): H(STEEL[b]) for a, b in [
    ("#181211", 0), ("#291b17", 0), ("#351705", 0), ("#422616", 1), ("#5a3521", 1), ("#432f29", 1),
    ("#6d370c", 1), ("#834621", 2), ("#a36915", 2), ("#6b5360", 2), ("#ae6237", 3), ("#b48254", 3), ("#8f6f62", 3),
]}

for name, s in JOBS.items():
    im = Image.open(ART / f"launch-{name}.webp").convert("RGBA")
    w, h = round(im.width * s / ART_PX), round(im.height * s / ART_PX)
    # premultiplied box downscale so transparent edges don't bleed black into the colors
    small = im.resize((w, h), Image.BOX, reducing_gap=None)
    out = Image.new("RGBA", (w, h))
    sp, op = small.load(), out.load()
    cache = {}
    for y in range(h):
        for x in range(w):
            r, g, b, a = sp[x, y]
            if a < 128: continue
            k = (r, g, b)
            if k not in cache: cache[k] = near(k)
            c = cache[k]
            if name.startswith("tower"): c = COOL.get(c, c)
            op[x, y] = (*c, 255)
    if name.startswith("island"): drop_wisps(out)
    out.save(OUT / f"{name}.png", optimize=True)
    print(name, out.size)
