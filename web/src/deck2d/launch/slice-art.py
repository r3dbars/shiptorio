# Cuts Justin's launch stage sheets (ChatGPT, 2172x724, 4 frames left to right on transparent) into
# web/public/deck/art/launch-<name>-<0..3>.webp. Frames in one sheet share one y-range so they stay
# registered (the island really rises inside its frames); each frame's x is its own run of opaque columns.
#   python3 web/src/deck2d/launch/slice-art.py island=<sheet.png> bridge=<sheet.png> tower=<sheet.png>
# Prints each frame's size and its cell-relative offset (the layer anchors on these, see FRAMES in index.ts).
import sys
from pathlib import Path
import numpy as np
from PIL import Image

ART = Path(__file__).resolve().parents[3] / "public" / "deck" / "art"

def runs(mask):
    out, s = [], None
    for x, c in enumerate(mask):
        if c and s is None: s = x
        if not c and s is not None: out.append((s, x)); s = None
    if s is not None: out.append((s, len(mask)))
    return [r for r in out if r[1] - r[0] > 15]

for arg in sys.argv[1:]:
    name, path = arg.split("=", 1)
    im = Image.open(path).convert("RGBA")
    a = np.array(im)[:, :, 3] > 20
    rows = np.where(a.any(1))[0]
    y0, y1 = int(rows[0]), int(rows[-1]) + 1
    for i, (x0, x1) in enumerate(runs(a.any(0))):
        fr = im.crop((x0, y0, x1, y1))
        fr.save(ART / f"launch-{name}-{i}.webp", quality=90, method=6)
        print(name, i, fr.size)
