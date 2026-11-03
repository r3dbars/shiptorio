#!/usr/bin/env python3
"""Snap any image (a ChatGPT render, a sketch, an old deck sprite) onto the Shiptorio pixel contract.

What it does, in order:
  1. Removes the background: pure green #00FF00 chroma key, or the corner color, or keeps existing alpha.
  2. Maps every source pixel to the nearest Black Iron 48 color (in OKLab, so it matches what the eye sees).
  3. Shrinks to art size by taking the most common palette color in each block (no blending, no new colors).
  4. Cleans up: drops lone stray pixels, makes alpha hard (0 or 255), optional 1px soot outline.
  5. For a strip of animation frames: splits it, crops every frame to one shared box, feet on one baseline,
     and writes a sprite sheet + JSON (Aseprite's "json-array" shape, so the engine reads both the same way).

Usage:
  python3 scripts/pixel/pixelize.py in.png out.png --height 48           # one sprite, 48 art px tall
  python3 scripts/pixel/pixelize.py in.png out.png --cell 4               # source already has 4px "pixels"
  python3 scripts/pixel/pixelize.py strip.png out.png --height 48 --frames 4 --name builder-working --fps 8
  python3 scripts/pixel/pixelize.py key.png sheet.png --more f2.png f3.png f4.png --height 96 --lock 0.08 --name builder-working
  python3 scripts/pixel/pixelize.py any.png --check                       # is it on-contract? exit 1 if not
  add --preview 6 to also write out.preview.png scaled 6x for eyeballing, --outline for a soot outline,
  --key green|corner|alpha to pick background removal (default: green if the image has lots of #00FF00, else alpha,
  else corner).

Needs Python 3 + Pillow + numpy. Palette: art/palette/black-iron-48.hex (index order is the contract).
"""
import argparse, json, sys
from pathlib import Path

import numpy as np
from PIL import Image

ROOT = Path(__file__).resolve().parents[2]
PALETTE_FILE = ROOT / "art" / "palette" / "black-iron-48.hex"


def load_palette(path=PALETTE_FILE):
    hexes = [h.strip() for h in Path(path).read_text().split() if h.strip()]
    return np.array([[int(h[i:i + 2], 16) for i in (0, 2, 4)] for h in hexes], dtype=np.uint8)


def oklab(rgb):
    c = rgb.astype(np.float64) / 255.0
    c = np.where(c <= 0.04045, c / 12.92, ((c + 0.055) / 1.055) ** 2.4)
    l = 0.4122214708 * c[..., 0] + 0.5363325363 * c[..., 1] + 0.0514459929 * c[..., 2]
    m = 0.2119034982 * c[..., 0] + 0.6806995451 * c[..., 1] + 0.1073969566 * c[..., 2]
    s = 0.0883024619 * c[..., 0] + 0.2817188376 * c[..., 1] + 0.6299787005 * c[..., 2]
    l, m, s = np.cbrt(l), np.cbrt(m), np.cbrt(s)
    return np.stack([
        0.2104542553 * l + 0.7936177850 * m - 0.0040720468 * s,
        1.9779984951 * l - 2.4285922050 * m + 0.4505937099 * s,
        0.0259040371 * l + 0.7827717662 * m - 0.8086757660 * s,
    ], -1)


def nearest(rgb, pal):
    """Palette index for every pixel of an (h, w, 3) array."""
    lab, plab = oklab(rgb.reshape(-1, 3)), oklab(pal)
    out = np.empty(len(lab), dtype=np.int16)
    for i in range(0, len(lab), 200_000):  # chunks keep memory flat on big renders
        d = ((lab[i:i + 200_000, None, :] - plab[None, :, :]) ** 2).sum(-1)
        out[i:i + 200_000] = d.argmin(1)
    return out.reshape(rgb.shape[:2])


def background_mask(img, key):
    """True where the pixel is part of the sprite."""
    rgba = np.asarray(img.convert("RGBA"))
    rgb, a = rgba[..., :3].astype(int), rgba[..., 3]
    green = (rgb[..., 1] > 180) & (rgb[..., 0] < 110) & (rgb[..., 2] < 110)
    if key == "auto":
        key = "green" if green.mean() > 0.05 else "alpha" if (a < 250).mean() > 0.01 else "corner"
    if key == "green":
        return ~green & (a > 127)
    if key == "alpha":
        return a > 127
    corners = np.array([rgb[0, 0], rgb[0, -1], rgb[-1, 0], rgb[-1, -1]])
    bg = np.median(corners, 0)
    return (np.abs(rgb - bg).sum(-1) > 60) & (a > 127)


def block_mean(rgb, mask, pal, cell_w, cell_h, out_w, out_h):
    """Shrink by averaging each block in OKLab (sprite pixels only), then snap the average to the palette.
    Keeps highlights and mid-tones that a majority vote throws away; still never invents a color."""
    lab = oklab(rgb)
    plab = oklab(pal)
    res = np.full((out_h, out_w), -1, dtype=np.int16)
    H, W = mask.shape
    for y in range(out_h):
        y0, y1 = int(y * cell_h), max(int(y * cell_h) + 1, int((y + 1) * cell_h))
        for x in range(out_w):
            x0, x1 = int(x * cell_w), max(int(x * cell_w) + 1, int((x + 1) * cell_w))
            m = mask[y0:min(y1, H), x0:min(x1, W)]
            if m.mean() < 0.5:
                continue
            v = lab[y0:min(y1, H), x0:min(x1, W)][m].mean(0)
            res[y, x] = ((plab - v) ** 2).sum(-1).argmin()
    return res


def block_mode(idx, mask, cell_w, cell_h, out_w, out_h):
    """Shrink by majority vote per block: the most common palette index wins. Best when the source is already
    blocky pixel art (an AI render with fat pixels); muddy on painted detail."""
    res = np.full((out_h, out_w), -1, dtype=np.int16)
    H, W = idx.shape
    for y in range(out_h):
        y0, y1 = int(y * cell_h), max(int(y * cell_h) + 1, int((y + 1) * cell_h))
        for x in range(out_w):
            x0, x1 = int(x * cell_w), max(int(x * cell_w) + 1, int((x + 1) * cell_w))
            m = mask[y0:min(y1, H), x0:min(x1, W)]
            if m.mean() < 0.5:
                continue
            v = idx[y0:min(y1, H), x0:min(x1, W)][m]
            res[y, x] = np.bincount(v).argmax()
    return res


def despeckle(res):
    """A single pixel whose 4 neighbours all agree on another color takes that color (AI noise, not detail)."""
    out = res.copy()
    h, w = res.shape
    for y in range(1, h - 1):
        for x in range(1, w - 1):
            n = [res[y - 1, x], res[y + 1, x], res[y, x - 1], res[y, x + 1]]
            if n[0] == n[1] == n[2] == n[3] and n[0] != res[y, x] and n[0] >= 0:
                out[y, x] = n[0]
    return out


def add_outline(res, soot=0):
    pad = np.pad(res, 1, constant_values=-1)
    filled = pad >= 0
    near = np.zeros_like(filled)
    for dy, dx in ((-1, 0), (1, 0), (0, -1), (0, 1)):
        near |= np.roll(np.roll(filled, dy, 0), dx, 1)
    pad[(~filled) & near] = soot
    return pad


def to_image(res, pal):
    h, w = res.shape
    rgba = np.zeros((h, w, 4), dtype=np.uint8)
    on = res >= 0
    rgba[on, :3] = pal[res[on]]
    rgba[on, 3] = 255
    return Image.fromarray(rgba, "RGBA")


def pixelize_set(imgs, pal, height=None, cell=None, key="auto", outline=False, method="mean", lock=0.0):
    """Pixelize frames that belong together. All frames share one crop box and one grid, so nothing jitters.
    lock > 0: any pixel whose color is within `lock` (OKLab distance) of frame 1's pixel takes frame 1's color.
    That kills AI flicker: only the parts that really moved (the gear, the arm) change between frames."""
    masks = [background_mask(im, key) for im in imgs]
    if any(m.shape != masks[0].shape for m in masks):
        raise SystemExit("frames must be the same size (generate every frame on the same canvas)")
    union = np.logical_or.reduce(masks)
    ys, xs = np.nonzero(union)
    if len(ys) == 0:
        raise SystemExit("nothing left after background removal; try --key corner or --key alpha")
    y0, y1, x0, x1 = ys.min(), ys.max() + 1, xs.min(), xs.max() + 1
    H, W = y1 - y0, x1 - x0
    cw = ch = float(cell) if cell else H / (height - (2 if outline else 0))
    out_w, out_h = max(1, round(W / cw)), max(1, round(H / ch))
    plab = oklab(pal)
    out = []
    for im, mask in zip(imgs, masks):
        rgb, m = np.asarray(im.convert("RGB"))[y0:y1, x0:x1], mask[y0:y1, x0:x1]
        if method == "mode":
            res = block_mode(nearest(rgb, pal), m, W / out_w, H / out_h, out_w, out_h)
        else:
            res = block_mean(rgb, m, pal, W / out_w, H / out_h, out_w, out_h)
        res = despeckle(res)
        if lock and out:
            base = out[0]
            both = (res >= 0) & (base >= 0)
            d = np.sqrt(((plab[np.clip(res, 0, None)] - plab[np.clip(base, 0, None)]) ** 2).sum(-1))
            res = np.where(both & (d < lock), base, res)
        out.append(res)
    if outline:
        out = [add_outline(r) for r in out]
    return out


def check(path, pal):
    rgba = np.asarray(Image.open(path).convert("RGBA"))
    a = rgba[..., 3]
    bad_alpha = int(((a > 0) & (a < 255)).sum())
    cols = {tuple(c) for c in rgba[a == 255][:, :3]}
    allowed = {tuple(c) for c in pal}
    off = cols - allowed
    ok = not off and not bad_alpha
    print(f"{path}: {'OK' if ok else 'OFF-CONTRACT'}  colors={len(cols)}  off-palette={len(off)}  soft-alpha px={bad_alpha}")
    return ok


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("src")
    ap.add_argument("out", nargs="?")
    ap.add_argument("--more", nargs="*", default=[], help="more frame images (same canvas size as src): src is frame 1")
    ap.add_argument("--lock", type=float, default=0.0,
                    help="lock unchanged pixels to frame 1 (try 0.08). Kills flicker between AI-generated frames")
    ap.add_argument("--height", type=int, help="art-pixel height of the sprite (or of each frame)")
    ap.add_argument("--cell", type=float, help="source pixels per art pixel, instead of --height")
    ap.add_argument("--frames", type=int, default=1, help="split a horizontal strip into N frames")
    ap.add_argument("--name", help="sprite name for the sheet JSON (default: output file stem)")
    ap.add_argument("--fps", type=int, default=8)
    ap.add_argument("--key", default="auto", choices=["auto", "green", "corner", "alpha"])
    ap.add_argument("--method", default="mean", choices=["mean", "mode"],
                    help="mean (default): average then snap, keeps detail; mode: majority vote, for already-blocky sources")
    ap.add_argument("--outline", action="store_true", help="1px soot outline around the silhouette")
    ap.add_argument("--preview", type=int, default=0, help="also write a scaled-up preview (e.g. 6)")
    ap.add_argument("--palette", default=str(PALETTE_FILE))
    ap.add_argument("--check", action="store_true", help="only report whether src is on-contract")
    a = ap.parse_args()
    pal = load_palette(a.palette)

    if a.check:
        sys.exit(0 if check(a.src, pal) else 1)
    if not a.out or not (a.height or a.cell):
        ap.error("need an output path and --height or --cell")

    srcs = [a.src] + a.more
    if len(srcs) == 1 and a.frames > 1:  # one strip image: cut it into equal frames
        img = Image.open(a.src)
        fw = img.width / a.frames
        imgs = [img.crop((round(i * fw), 0, round((i + 1) * fw), img.height)) for i in range(a.frames)]
    else:
        imgs = [Image.open(f) for f in srcs]
    parts = pixelize_set(imgs, pal, a.height, a.cell, a.key, a.outline, a.method, a.lock)
    h, w = parts[0].shape
    sheet = Image.new("RGBA", (w * len(parts), h))
    for i, p in enumerate(parts):
        sheet.alpha_composite(to_image(p, pal), (i * w, 0))
    frames = None if len(parts) == 1 else [
        {"filename": f"{i}", "frame": {"x": i * w, "y": 0, "w": w, "h": h}, "duration": round(1000 / a.fps)} for i in range(len(parts))]
    out = Path(a.out)
    out.parent.mkdir(parents=True, exist_ok=True)
    sheet.save(out)
    if frames:
        name = a.name or out.stem
        meta = {"frames": frames, "meta": {"image": out.name, "size": {"w": sheet.width, "h": sheet.height},
                                            "frameTags": [{"name": name, "from": 0, "to": len(frames) - 1, "direction": "forward"}],
                                            "anchor": "bottom-center"}}
        out.with_suffix(".json").write_text(json.dumps(meta, indent=1) + "\n")
    if a.preview:
        sheet.resize((sheet.width * a.preview, sheet.height * a.preview), Image.NEAREST).save(out.with_suffix(".preview.png"))
    print(f"{out}: {sheet.width}x{sheet.height} art px, {len(frames or [0])} frame(s)")
    check(out, pal)


if __name__ == "__main__":
    main()
