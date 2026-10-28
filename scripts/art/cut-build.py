"""Cut Justin's ChatGPT construction sheets into /deck/art/build-*.webp (thread "Animate a station getting built").
usage: python3 -I scripts/art/cut-build.py <sheets dir> <out dir>
Sheets (transparent PNGs) are named by env vars: PLOT CRANE BUILDER BURST FX TARP.
"""
import sys, os
import numpy as np
from PIL import Image

src, out = sys.argv[1], sys.argv[2]
SHEETS = dict(  # name -> file (set by the caller's env, or the upload names from 2026-10-28)
    plot=os.environ.get("PLOT"), crane=os.environ.get("CRANE"), builder=os.environ.get("BUILDER"), burst=os.environ.get("BURST"), fx=os.environ.get("FX"), tarp=os.environ.get("TARP"))

def load(name):
    return Image.open(os.path.join(src, SHEETS[name])).convert("RGBA")

def bbox(im, x0, x1, th=8):
    a = np.array(im)[:, x0:x1, 3] > th
    ys, xs = np.where(a)
    return x0 + xs.min(), ys.min(), x0 + xs.max() + 1, ys.max() + 1

def crop(im, x0, x1, th=8):
    return im.crop(bbox(im, x0, x1, th))

def anchor(fr):
    """x of the feet: centre of the opaque pixels in the bottom 12% of the frame."""
    a = np.array(fr)[:, :, 3] > 128
    h = a.shape[0]
    xs = np.where(a[int(h * 0.88):])[1]
    return (xs.min() + xs.max()) / 2

def strip(frames, height):
    """Pad frames to one size, feet bottom-aligned on a shared anchor, then scale to height."""
    ax = [anchor(f) for f in frames]
    left = max(a for a in ax); right = max(f.width - a for f, a in zip(frames, ax))
    H = max(f.height for f in frames)
    W = int(np.ceil(left + right))
    outs = []
    for f, a in zip(frames, ax):
        c = Image.new("RGBA", (W, H))
        c.paste(f, (int(round(left - a)), H - f.height))
        outs.append(c)
    s = height / H
    return [c.resize((max(1, round(W * s)), height), Image.LANCZOS) for c in outs]

def save(im, name):
    im.save(os.path.join(out, name + ".webp"), "WEBP", quality=88, method=6)
    print(name, im.size)

# build plot: dim + glowing gold
p = load("plot")
for name, (a, b) in zip(["build-plot-dim", "build-plot-glow"], [(0, 840), (840, p.width)]):
    f = crop(p, a, b); s = 300 / f.height
    save(f.resize((round(f.width * s), 300), Image.LANCZOS), name)

# scaffold platform + crane in three swing positions (left, up, right)
c = load("crane")
cuts = [(0, 560), (560, 1130), (1130, 1630), (1630, c.width)]
scaf = crop(c, *cuts[0]); s = 360 / scaf.height
save(scaf.resize((round(scaf.width * s), 360), Image.LANCZOS), "build-scaffold")
for name, fr in zip(["build-crane-left", "build-crane-up", "build-crane-right"], strip([crop(c, *x) for x in cuts[1:]], 480)):
    save(fr, name)

# builder built in four stages: frame, panels + sparks, top lowering, done + dust
b = load("builder")
bc = [(0, 520), (520, 1040), (1040, 1534), (1534, b.width)]
for i, fr in enumerate(strip([crop(b, *x) for x in bc], 512)):
    save(fr, f"builder-build-{i + 1}")

# burst ring (4 frames, centred) and the green check (3 frames: small, overshoot, settle)
u = load("burst")
bursts = [(0, 200), (200, 505), (505, 912), (912, 1320)]
checks = [(1320, 1525), (1525, 1786), (1786, u.width)]
def centred(frames, size):
    S = max(max(f.size) for f in frames)
    outs = []
    for f in frames:
        cv = Image.new("RGBA", (S, S)); cv.paste(f, ((S - f.width) // 2, (S - f.height) // 2)); outs.append(cv.resize((size, size), Image.LANCZOS))
    return outs
for i, fr in enumerate(centred([crop(u, *x, th=4) for x in bursts], 384)):
    save(fr, f"build-burst-{i + 1}")
for i, fr in enumerate(centred([crop(u, *x) for x in checks], 160)):
    save(fr, f"build-check-{i + 1}")

def defringe(im, keep_orange):
    """ChatGPT left pure red / yellow halos round the cut-outs: drop them."""
    px = np.array(im).astype(np.int32)
    r, g, b, a = px[..., 0], px[..., 1], px[..., 2], px[..., 3]
    red = (r > 140) & (g < r * (0.3 if keep_orange else 0.5)) & (b < r * 0.45)
    yellow = (r > 180) & (g > 170) & (b < 90) & ~np.array([keep_orange])
    px[..., 3] = np.where(red | yellow, 0, a)
    return Image.fromarray(px.astype(np.uint8), "RGBA")

# spark burst (4 frames) and dust puff (4 frames), shared with the juice thread
x = load("fx")
for kind, cuts, keep in [("spark", [(0, 200), (200, 490), (490, 800), (800, 1060)], True),
                         ("dust", [(1060, 1280), (1280, 1570), (1570, 1900), (1900, x.width)], False)]:
    frames = [crop(defringe(x.crop((a, 0, b, x.height)), keep), 0, b - a) for a, b in cuts]
    for i, fr in enumerate(centred(frames, 192)):
        save(fr, f"fx-{kind}-{i + 1}")

# the locked plot (tarp + padlock) and the blank brass plate the label is written on
t = load("tarp")
tarp = crop(t, 0, 1170); s = 360 / tarp.height
save(tarp.resize((round(tarp.width * s), 360), Image.LANCZOS), "build-tarp")
plate = crop(t, 1170, t.width); s = 120 / plate.height
save(plate.resize((round(plate.width * s), 120), Image.LANCZOS), "build-plate")
