#!/usr/bin/env python3
"""The city reveal's island sprites: five painting crops on five drawn bases in, ten palette-only webps and a manifest out.

    python3 -I scripts/city-art.py --refs <dir with errors|traffic|inbox|customers|marketing.png> \
        --out web/public/deck/art/city [--sheet <contact-sheet.png>] [--check] [--self-test]

web/src/deck2d/city/DIRECTION.md section A is the spec (it wins over SPEC.md section 4), with two art passes on top.
Marketing stands on one round boulder (a U, flat underneath, never a point) with its foot plate set into the crown, lamps
along the plate and pips on the guy-wire lugs and collar; Errors' underside is basalt columns 3 to 6 px wide stepping down
like organ pipes, each end cut at 45 degrees with a lit tip, one or two staggered joints each, and its crack is lava, hot
to cool from core to rock; Inbox's window is an envelope and its plinth a deep platform the spans land on; Traffic's legs
are K-braced with iron members and planted on flat-bottomed boulders; the dark pass is three iron tones. What it does:

  1. Key. The paintings ship transparent-backed, so alpha >= 128 is the island (`--key auto`). A painting with no
     transparency is keyed from its white background instead: a flood fill from the image border with a tolerance, so
     near-white highlights inside the island survive.
  2. Crop and downscale. Only the buildings and the deck they stand on survive, one box per painting (CROP). Every crop
     is sampled at one PAINT_SCALE = 7.5 painting px per city px, nearest neighbour: each city px is the painting px
     under the centre of its cell. No filter, no averaging, nothing smoothed. One scale for all five, so a door or a lamp
     is the same size on every island.
  3. Snap. Every opaque px becomes the nearest PALETTE colour in CIELAB (the list below is copied from
     web/src/deck2d/contract.ts; --check compares them). Alpha is on or off, never partial. The crops may not use jam
     red (stuck), ok green (done) or energy cyan (power): those mean something on this deck, so only the bases draw
     them (Errors' crack, the crystals, the thrusters). Errors' crop may not use sun[3], sun[5] or sun[6] either: those
     are its lava (sun[6] turns into sun[5] at the cap), and the dark pass keeps the lava by colour.
  4. Base. FORMS[island] draws a new island in palette indices (deck outline, rim and underside, a different form for
     each island) and composites the snapped crop on top. Rock is shaded with a port of rocks() in
     web/src/deck2d/props/underside.ts at half its size, as the line shows at city zoom: big stones BIG = 9, facets
     FACET = 4 city px, lit on their upper right, soot crevices, ramp soot, iron[0], iron[1], brass[0], iron[2],
     plate[1], plate[2], plate[3]. A crevice's soft edge sits one step lighter than the line's (iron[1], not iron[0]):
     at city zoom the line's soft edge mostly falls between px, and a full one here doubles every crevice.
  5. Warm. steel[0..3] -> iron[0], iron[1], plate[2], plate[4]; the energy cyans stay.
  6. Outline. 1 px soot round the silhouette and round every hole in it (4-neighbour).
  7. Cap, so the line stays the brightest thing on screen: white[0] -> haze[3], brass[5] -> brass[4], sun[6] -> sun[5],
     energy[3] -> energy[2], except within 2 px of the lamp, pad and beacon points; then at most 16 px of white[0] plus
     brass[5] per lit sprite (the farthest from those points go first).
  8. Sun rim. An opaque, non-outline px whose upper or right neighbour is the outline (or off the sprite) becomes
     plate[3]: light from the upper right. The lamp, pad and beacon keep their own light within 2 px, and a thin iron
     member (Traffic's braces and tie) keeps its iron: every px of it touches the outline, so it would turn all rim. That
     is the lit sprite. (Marketing's guy wires go in with the outline: 1 px of soot each.)
  9. Dark, from the lit sprite before its sun rim, by the CIELAB L of each lit colour: L < 20 iron[0], L < 40 iron[1],
     otherwise iron[2]; soot is the outline only (and the outline round a hole), never a tone. Then a copper[0] rim light,
     the last of the sunset, on the same edge px as the sun rim. Errors keeps its lava as embers: lit sun[5] (the crack's
     core) -> jam[1], lit sun[3] and jam[1] (its edges, the crater's rim) -> jam[0]. Same silhouette as lit, so the city
     can dither one over the other. A dark island keeps its relief: at most 40% soot, at least 25% iron[1] plus iron[2],
     and no tone but the crack's reds brighter than L* 36, under iron[3] (--check holds every file to that).
 10. Write lossless webps (VP8L), then manifest.json: size, form, anchors, lamp, label, pad, beacon, lights, opaque, plus
     the audits (the colours each file uses, its byte size). --sheet writes a contact sheet of every sprite at 1x on the
     dimmed sunset sky and a second one at 2x with the manifest's points marked. --check re-opens every file and asserts
     the lot. --self-test exercises the pieces on synthetic images.

Pillow only. `python3 -I` ignores the user site, where `pip3 install --user pillow` puts it, so the import below falls
back to it (appended last, so nothing in there can shadow the standard library).

The points (sprite px from the top-left, y down)
------------------------------------------------
The bases are drawn here, so most points are design numbers from DIRECTION.md section A (DESIGN below), and --check
holds the file to them within 2 px: the anchors are foot points (where a pylon, lift or span end stands) on an opaque px
of the rim or deck top; the label is the top-centre of the DOM label (x by design, y = the lowest opaque row + 4, so it
hangs just under the island); the beacon is the centre of Marketing's ball; the lights are where the runtime puts a
steady light once the island is lit (signal, pad, thruster, window, crack). Two points come from the paintings: lamp, the
glass of the island's own lamp post (the brightest px within 2 px of the painting spot in LAMP, mapped through the crop),
and Customers' pad, the centre of the painting's landing ring. Inbox's lamp is a lantern drawn here; Marketing has none.
"""
from __future__ import annotations

import argparse
import json
import math
import os
import re
import sys
from fractions import Fraction

# ---------------------------------------------------------------------------------------------------------------
# Pillow (python3 -I skips the user site-packages, where it usually lives)
# ---------------------------------------------------------------------------------------------------------------


def _import_pillow():
    try:
        import PIL  # noqa: F401
    except ImportError:
        import site

        user = site.getusersitepackages()
        if os.path.isdir(user) and user not in sys.path:
            sys.path.append(user)
        try:
            import PIL  # noqa: F401,F811
        except ImportError:
            sys.exit("city-art.py needs Pillow: pip3 install --user pillow")
    from PIL import Image, ImageDraw, ImageFont

    return Image, ImageDraw, ImageFont


Image, ImageDraw, ImageFont = _import_pillow()

HERE = os.path.dirname(os.path.abspath(__file__))
REPO = os.path.dirname(HERE)
CONTRACT = os.path.join(REPO, "web/src/deck2d/contract.ts")
DEFAULT_OUT = os.path.join(REPO, "web/public/deck/art/city")
SKY = os.path.join(REPO, "web/public/deck/art/sky.webp")

# ---------------------------------------------------------------------------------------------------------------
# The 48 colors: PALETTE in web/src/deck2d/contract.ts, each ramp dark -> light
# ---------------------------------------------------------------------------------------------------------------

PALETTE = {
    "soot": ["#0a0604"],
    "iron": ["#181211", "#291b17", "#432f29", "#6b5360", "#8f6f62"],
    "steel": ["#121e2b", "#273349", "#3d4d6a", "#7d8ea3"],
    "copper": ["#713e30", "#a04430", "#cd4f27", "#e28059", "#f2b48c"],
    "brass": ["#422616", "#6d370c", "#a36915", "#c98115", "#fdc727", "#fdec9a"],
    "plate": ["#351705", "#5a3521", "#834621", "#ae6237", "#b48254"],
    "sun": ["#652203", "#bc3c0b", "#e44e1b", "#f6601f", "#fc8717", "#fdad1e", "#f9c47a"],
    "haze": ["#623a3a", "#82525a", "#c0988e", "#eed3c5"],
    "white": ["#fdfaec"],
    "energy": ["#28545a", "#0ea0ac", "#41f3f7", "#bcf6f6"],
    "ok": ["#1c450f", "#1ab004", "#81f381"],
    "jam": ["#6a0d0d", "#c8231b", "#ff5b4a"],
}
HEXES = [h for ramp in PALETTE.values() for h in ramp]
RGBS = [tuple(int(h[i:i + 2], 16) for i in (1, 3, 5)) for h in HEXES]
assert len(HEXES) == 48 and len(set(HEXES)) == 48


def pal(name, n=0):
    return HEXES.index(PALETTE[name][n])


def ramp(name):
    return [pal(name, n) for n in range(len(PALETTE[name]))]


SOOT, WHITE = pal("soot"), pal("white")
IRON, STEEL, COPPER, BRASS, PLATE = ramp("iron"), ramp("steel"), ramp("copper"), ramp("brass"), ramp("plate")
SUN, HAZE, ENERGY, OK, JAM = ramp("sun"), ramp("haze"), ramp("energy"), ramp("ok"), ramp("jam")


def _srgb_to_linear(c):
    c /= 255.0
    return c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4


def to_lab(rgb):
    """sRGB (0-255) -> CIELAB, D65."""
    r, g, b = (_srgb_to_linear(c) for c in rgb)
    x = (0.4124564 * r + 0.3575761 * g + 0.1804375 * b) / 0.95047
    y = 0.2126729 * r + 0.7151522 * g + 0.0721750 * b
    z = (0.0193339 * r + 0.1191920 * g + 0.9503041 * b) / 1.08883

    def f(t):
        return t ** (1.0 / 3.0) if t > 216.0 / 24389.0 else (24389.0 / 27.0 * t + 16.0) / 116.0

    fx, fy, fz = f(x), f(y), f(z)
    return 116.0 * fy - 16.0, 500.0 * (fx - fy), 200.0 * (fy - fz)


LABS = [to_lab(c) for c in RGBS]
ANY = list(range(48))
CROP_COLORS = [i for i in ANY if i not in JAM + OK + ENERGY]  # what a painting crop may snap to


def nearest(rgb, allowed):
    """Index of the nearest allowed palette color to rgb, in CIELAB (ties go to the lower index)."""
    l, a, b = to_lab(rgb)
    best, best_d = allowed[0], 1e18
    for i in allowed:
        pl, pa, pb = LABS[i]
        d = (l - pl) ** 2 + (a - pa) ** 2 + (b - pb) ** 2
        if d < best_d:
            best, best_d = i, d
    return best


WARM = {STEEL[0]: IRON[0], STEEL[1]: IRON[1], STEEL[2]: PLATE[2], STEEL[3]: PLATE[4]}  # cold steel -> warm iron
CAP = {WHITE: HAZE[3], BRASS[5]: BRASS[4], SUN[6]: SUN[5], ENERGY[3]: ENERGY[2]}  # the line keeps the brightest colours
BRIGHT = (WHITE, BRASS[5])
MAX_BRIGHT = 16  # px of white[0] + brass[5] per lit sprite, all within 2 px of its lamp, pad or beacon


# Errors' lava, hot to cool from the crack's core to the rock: sun[5], sun[3], jam[1]. Only the crack and the crater use
# these three on Errors (its painting crop may not), so the dark sprite can keep them as embers by colour alone.
LAVA = (SUN[5], SUN[3], JAM[1])
# Across the crack, by its width there: 3 px is sun[3] | sun[5] | sun[3], 2 px is jam[1] | sun[5] (its edge toward the
# shade), 1 px (the tips, where it has cooled) jam[1]; the crater's rim, where the pool meets the rock, is jam[1] too.
LAVA_CORE, LAVA_EDGE = {3: SUN[5], 2: SUN[5], 1: JAM[1]}, {3: SUN[3], 2: JAM[1], 1: JAM[1]}
LAVA_DARK = {SUN[5]: JAM[1], SUN[3]: JAM[0], JAM[1]: JAM[0], JAM[2]: JAM[1], JAM[0]: JAM[0]}  # core jam[1], edges jam[0]
# Errors' painting crop snaps without the lava's two suns (or sun[6], which the brightness cap turns into sun[5])
CROP_COLORS_FOR = {"errors": [i for i in CROP_COLORS if i not in (SUN[3], SUN[5], SUN[6])]}


def dark_of(i, island):
    """The dark sprite's colour for a lit palette index (before the rim light): three iron tones by the lit colour's
    CIELAB L, so a dark island keeps its relief instead of going two-tone black. Soot is only the outline (and the outline
    round a hole), never a tone: make_dark puts it there. Errors' lava keeps a dim ember (LAVA_DARK)."""
    if island == "errors" and i in LAVA_DARK:
        return LAVA_DARK[i]
    lum = LABS[i][0]
    return IRON[0] if lum < 20 else IRON[1] if lum < 40 else IRON[2]


DARK_RIM = COPPER[0]  # the dark sprite's upper-right edge: the last of the sunset on it
DARK_COLORS = {SOOT, IRON[0], IRON[1], IRON[2], DARK_RIM}
DARK_ERRORS = DARK_COLORS | {JAM[0], JAM[1]}
MAX_DARK_SOOT = 0.40  # of a dark sprite's opaque px: the outline, not the whole island
MIN_DARK_MID = 0.25  # of a dark sprite's opaque px in iron[1] + iron[2]: the relief that reads at night
MAX_DARK_L = 36  # CIELAB L: no dark tone (the crack's reds aside) is brighter than this (iron[3] is 38), so a dark island
# stays dark

# ---------------------------------------------------------------------------------------------------------------
# The five islands (DIRECTION.md section A)
# ---------------------------------------------------------------------------------------------------------------

ISLANDS = ["errors", "traffic", "inbox", "customers", "marketing"]  # CITY_ISLANDS, reveal order
FORM = {"errors": "caldera", "traffic": "rail-slab", "inbox": "post-tower", "customers": "landing-disc", "marketing": "beacon-rock"}
SIZE = {"errors": (156, 128), "traffic": (200, 88), "inbox": (64, 176), "customers": (196, 96), "marketing": (76, 150)}
HEIGHT_CLASS = {"traffic": (80, 88), "customers": (92, 100), "errors": (124, 132), "marketing": (144, 152), "inbox": (172, 180)}
PAINT_SCALE = Fraction(15, 2)  # 7.5 painting px per city px, for every crop
CROP = {  # painting px (x0, y0, x1, y1): the buildings and the deck surface they stand on
    "errors": (100, 30, 610, 330),
    "traffic": (20, 0, 1510, 470),
    "inbox": (290, 0, 560, 512),
    "customers": (30, 40, 1500, 460),
    "marketing": (700, 300, 1210, 430),
}
CROP_AT = {"errors": (8, 7), "traffic": (1, 0), "inbox": (4, 0), "customers": (1, 1), "marketing": (5, 86)}  # sprite px of the crop's top-left
LAMP = {"errors": (562, 142), "traffic": (522, 262), "customers": (1120, 186)}  # painting px of each lamp post's glass
PAD = (1255, 357)  # painting px: the centre of Customers' landing ring
MAX_BYTES = 80 * 1024  # per webp
MAX_FOLDER = 1024 * 1024
MAX_OPAQUE = 12500  # 0.38 of the line's 399 x 83 box: no island outweighs the line
MAX_W = 200
MIN_CRACK = 350  # jam px in errors-lit

# The points each island must land within 2 px of (section A). Anchors are foot points; the label hangs under the island.
DESIGN = {
    "errors": dict(anchors={"n": (44, 47), "e": (151, 60), "s": (84, 120), "w": (4, 60)}, lamp=(70, 22), pad=None, beacon=None, label=(78, 131)),
    "traffic": dict(anchors={"n": (126, 58), "e": (197, 64), "s": (100, 68), "w": (2, 64)}, lamp=(68, 35), pad=None, beacon=None, label=(100, 91)),
    "inbox": dict(anchors={"n": (54, 69), "e": (62, 72), "s": (32, 172), "w": (1, 72)}, lamp=(5, 58), pad=None, beacon=None, label=(32, 179)),
    "customers": dict(anchors={"n": (40, 30), "e": (193, 60), "s": (98, 92), "w": (3, 60)}, lamp=(146, 20), pad=(164, 43), beacon=None, label=(98, 99)),
    "marketing": dict(anchors={}, lamp=None, pad=None, beacon=(38, 12), label=(38, 151)),
}
LIGHT_KINDS = ("signal", "pad", "thruster", "window", "crack")
LIGHT_COUNT = {"errors": {"crack": 3}, "traffic": {"signal": 8}, "inbox": {"window": 4}, "customers": {"pad": 12, "thruster": 3},
               "marketing": {"signal": 4, "window": 4}}

# ---------------------------------------------------------------------------------------------------------------
# A palette-index canvas
# ---------------------------------------------------------------------------------------------------------------


class Canvas:
    """w x h palette indices, -1 = transparent."""

    def __init__(self, w, h, pix=None):
        self.w, self.h = w, h
        self.pix = list(pix) if pix is not None else [-1] * (w * h)

    def copy(self):
        return Canvas(self.w, self.h, self.pix)

    def inside(self, x, y):
        return 0 <= x < self.w and 0 <= y < self.h

    def at(self, x, y):
        return self.pix[y * self.w + x] if self.inside(x, y) else -1

    def opaque(self, x, y):
        return self.at(x, y) >= 0

    def set(self, x, y, c):
        if self.inside(x, y):
            self.pix[y * self.w + x] = c

    def hline(self, x, y, n, c):
        for i in range(n):
            self.set(x + i, y, c)

    def vline(self, x, y, n, c):
        for j in range(n):
            self.set(x, y + j, c)

    def rect(self, x, y, w, h, c):
        for j in range(h):
            self.hline(x, y + j, w, c)

    def line(self, x0, y0, x1, y1, c):
        """A 1 px line, Bresenham (every step moves one px in x or y, so it stays 4-connected-free and crisp)."""
        dx, dy = abs(x1 - x0), -abs(y1 - y0)
        sx, sy = (1 if x0 < x1 else -1), (1 if y0 < y1 else -1)
        err = dx + dy
        while True:
            self.set(x0, y0, c)
            if x0 == x1 and y0 == y1:
                return
            e2 = 2 * err
            if e2 >= dy:
                err += dy
                x0 += sx
            if e2 <= dx:
                err += dx
                y0 += sy

    def paste(self, src, ox, oy, box=None):
        """Every opaque px of src at (ox, oy), only inside box (x0, y0, x1, y1 inclusive; default: 1 px in from the edge,
        where the outline goes)."""
        x0, y0, x1, y1 = box or (1, 1, self.w - 2, self.h - 2)
        for j in range(src.h):
            for i in range(src.w):
                c = src.pix[j * src.w + i]
                x, y = ox + i, oy + j
                if c >= 0 and x0 <= x <= x1 and y0 <= y <= y1:
                    self.pix[y * self.w + x] = c

    def lowest(self):
        return max(y for y in range(self.h) if any(self.pix[y * self.w + x] >= 0 for x in range(self.w)))

    def count(self, colors=None):
        return sum(1 for c in self.pix if c >= 0 and (colors is None or c in colors))


def outline(cv):
    """1 px soot outside the silhouette and inside every hole (4-neighbour), in place. Returns the outline's indices."""
    w, h, pix = cv.w, cv.h, cv.pix
    marks = []
    for y in range(h):
        for x in range(w):
            if pix[y * w + x] < 0 and (
                (x > 0 and pix[y * w + x - 1] >= 0)
                or (x < w - 1 and pix[y * w + x + 1] >= 0)
                or (y > 0 and pix[(y - 1) * w + x] >= 0)
                or (y < h - 1 and pix[(y + 1) * w + x] >= 0)
            ):
                marks.append(y * w + x)
    for i in marks:
        pix[i] = SOOT
    return set(marks)


def near_any(points, r=2):
    """(x, y) -> True within r px (Chebyshev) of any of points."""
    pts = [tuple(p) for p in points if p]
    return lambda x, y: any(max(abs(x - px), abs(y - py)) <= r for px, py in pts)


def rim_px(cv, rim_of, keep):
    """The upper-right edge: opaque px, not the outline, whose upper or right neighbour is the outline or off the sprite."""
    w = cv.w
    out = []
    for y in range(cv.h):
        for x in range(w):
            i = y * w + x
            if cv.pix[i] < 0 or i in rim_of or keep(x, y):
                continue
            up, right = (y - 1) * w + x, i + 1
            if y == 0 or up in rim_of or cv.pix[up] < 0 or x == w - 1 or right in rim_of or cv.pix[right] < 0:
                out.append(i)
    return out


def cap_brightness(cv, points):
    """The line keeps the brightest colours: CAP outside 2 px of points, then at most MAX_BRIGHT white[0] + brass[5]."""
    near = near_any(points)
    for y in range(cv.h):
        for x in range(cv.w):
            c = cv.pix[y * cv.w + x]
            if c in CAP and not near(x, y):
                cv.pix[y * cv.w + x] = CAP[c]
    pts = [tuple(p) for p in points if p] or [(0, 0)]
    bright = []
    for i, c in enumerate(cv.pix):
        if c in BRIGHT:
            x, y = i % cv.w, i // cv.w
            bright.append((min(max(abs(x - px), abs(y - py)) for px, py in pts), i))
    for _, i in sorted(bright, reverse=True)[: max(0, len(bright) - MAX_BRIGHT)]:
        cv.pix[i] = CAP[cv.pix[i]]


def make_dark(norim, rim_of, island, keep):
    """The dark sprite from the lit one before its sun rim: three iron tones by CIELAB L, a copper[0] rim light, and soot
    only on the outline."""
    dark = Canvas(norim.w, norim.h, [(-1 if c < 0 else SOOT if i in rim_of else dark_of(c, island)) for i, c in enumerate(norim.pix)])
    for i in rim_px(norim, rim_of, keep):
        dark.pix[i] = DARK_RIM
    return dark


# ---------------------------------------------------------------------------------------------------------------
# Stone: a port of props/underside.ts rocks() (and stations/shade.ts noise, blotch, tone)
# ---------------------------------------------------------------------------------------------------------------

M32 = 0xFFFFFFFF
BIG, FACET = 9, 4  # city px: half the line's 17 and 8 art px, as the line is drawn at city zoom
ROCK = [SOOT, IRON[0], IRON[1], BRASS[0], IRON[2], PLATE[1], PLATE[2], PLATE[3]]  # warm dark rock, darkest to lightest


def noise(x, y, seed=0):
    """stations/shade.ts noise(): an integer hash in 0..1 (32-bit wraparound, as JS `| 0`, `>>>` and Math.imul do)."""
    h = (x * 374761393 + y * 668265263 + seed * 2147483647) & M32
    h = ((h ^ (h >> 13)) * 1274126177) & M32
    return ((h ^ (h >> 16)) & M32) / 4294967295.0


def blotch(x, y, cell, seed=0):
    """stations/shade.ts blotch(): smooth value noise at a given cell size."""
    gx, gy = x / cell, y / cell
    x0, y0 = math.floor(gx), math.floor(gy)
    fx, fy = gx - x0, gy - y0
    sx, sy = fx * fx * (3 - 2 * fx), fy * fy * (3 - 2 * fy)
    a, b, c, d = noise(x0, y0, seed), noise(x0 + 1, y0, seed), noise(x0, y0 + 1, seed), noise(x0 + 1, y0 + 1, seed)
    return a + (b - a) * sx + (c - a) * sy + (a - b - c + d) * sx * sy


def tone(x, y, rmp, v):
    """stations/shade.ts tone(): a ramp step for v (0 dark .. 1 light), the narrow middle band dithered in a checker."""
    f = max(0.0, min(1.0, v)) * (len(rmp) - 1)
    lo = int(f)
    fr = f - lo
    i = lo if fr < 0.44 else lo + 1 if fr > 0.56 else lo + ((x + y) & 1)
    return rmp[min(len(rmp) - 1, i)]


def _hash(a, b, s):
    return noise(a * 7 + 3, b * 13 + 5, s)


class Stones:
    """One size of Voronoi stones (underside.ts seeds() + nearest()): rows squashed to 0.75, distances stretched 1.2."""

    def __init__(self, cell, salt):
        self.cell, self.salt, self.memo = cell, salt, {}

    def seed(self, i, j):
        s = self.memo.get((i, j))
        if s is None:
            c, salt = self.cell, self.salt
            s = ((i + 0.15 + _hash(i, j, salt + 1) * 0.7) * c, (j + 0.15 + _hash(i, j, salt + 2) * 0.7) * c * 0.75,
                 c * (0.6 + _hash(i, j, salt + 4) * 0.3), _hash(i, j, salt + 3))
            self.memo[(i, j)] = s
        return s

    def near(self, x, y):
        """(the nearest stone, its distance, the seam: second-nearest minus nearest; small = a crevice)."""
        c = self.cell
        gx, gy = math.floor(x / c), math.floor(y / (c * 0.75))
        best = second = 1e9
        s = None
        for a in (gx - 1, gx, gx + 1):
            for b in (gy - 1, gy, gy + 1):
                sd = self.seed(a, b)
                d = math.hypot(x + 0.5 - sd[0], (y + 0.5 - sd[1]) * 1.2)
                if d < best:
                    second, best, s = best, d, sd
                elif d < second:
                    second = d
        return s, best, second - best


def stone_v(x, y, big, facet, form, deep):
    """rocks()' tone for one px: the stone it belongs to lit on its upper right, a crevice where two stones meet, a lit
    lip, facet creases. form = the whole mass's own light here (underside.ts adds the V's sun side and the rim's
    shadow); deep = 0 at the top of the mass .. 1 at its deepest (deeper is darker). Returns (v, stone, face, r2, seam)."""
    s, best, seam = big.near(x, y)
    f, _, fseam = facet.near(x, y)
    nx, ny = (x + 0.5 - s[0]) / s[2], (y + 0.5 - s[1]) / s[2]
    r2 = min(1.4, nx * nx + ny * ny)
    face = nx * 0.62 - ny * 0.78  # > 0 faces the sun (upper right)
    fface = (x + 0.5 - f[0]) * 0.62 - (y + 0.5 - f[1]) * 0.78
    v = 0.5 + 0.36 * face - 0.18 * r2 + (s[3] - 0.5) * 0.26 + (f[3] - 0.5) * 0.08 + form
    v -= 0.18 * max(0.0, min(1.0, deep)) ** 1.4
    v += (blotch(x, y, 26, 113) - 0.5) * 0.12
    if seam < 0.9:
        v = 0.03  # crevice between stones
    elif seam < 1.6:
        v = min(v, 0.26)  # its soft edge: one step above the line's 0.16, which at city zoom (half size) falls mostly
        # between px; here it would double every crevice into a 3 px black seam
    elif seam < 3 and face > 0.25:
        v += 0.2  # a stone's lit lip
    elif fseam < 0.9 and v > 0.3:
        v -= 0.12  # a facet edge: a shallow crease
    elif fseam < 2 and fface > 1:
        v += 0.07  # a facet's lit edge
    v += (noise(x, y, 109) - 0.5) * 0.05
    return v, s, face, r2, seam


def rock_px(x, y, big, facet, form, deep, salt):
    """One px of rock: rocks()' tone on ROCK, cool steel in the deepest shadow, a little copper ore in the odd stone."""
    v, s, face, r2, seam = stone_v(x, y, big, facet, form, deep)
    c = tone(x, y, ROCK, v)
    if seam >= 1.6 and face < -0.5 and r2 > 0.4 and noise(x, y, salt + 111) < 0.5:
        c = STEEL[0] if v < 0.24 else STEEL[1]  # remapped warm later, like every steel
    if s[3] > 0.9 and seam > 3 and face > 0 and noise(x, y, salt + 112) > 0.75:
        c = COPPER[0]
    return c


def fill_rock(cv, pts, big, facet, form, deep, salt=0):
    """Rock on every (x, y) in pts. form(x, y) and deep(x, y) as in stone_v."""
    for x, y in pts:
        cv.set(x, y, rock_px(x, y, big, facet, form(x, y), deep(x, y), salt))


def interp(points, x):
    """Piecewise-linear y at x through points [(x, y), ...] sorted by x."""
    for (xa, ya), (xb, yb) in zip(points, points[1:]):
        if xa <= x <= xb:
            return ya + (yb - ya) * (x - xa) / float(xb - xa)
    return points[0][1] if x < points[0][0] else points[-1][1]


def dist_seg(px, py, ax, ay, bx, by):
    vx, vy = bx - ax, by - ay
    if not vx and not vy:
        return math.hypot(px - ax, py - ay)
    t = max(0.0, min(1.0, ((px - ax) * vx + (py - ay) * vy) / float(vx * vx + vy * vy)))
    return math.hypot(px - ax - t * vx, py - ay - t * vy)


def dist_poly(px, py, poly):
    return min(dist_seg(px, py, *a, *b) for a, b in zip(poly, poly[1:]))


# ---------------------------------------------------------------------------------------------------------------
# 1-3. Key, crop, downscale, snap
# ---------------------------------------------------------------------------------------------------------------


def _flood_white(im, tol):
    """Mask (L, 255 = island) of an RGBA painting on a white-ish background: flood fill from every border pixel, 4-
    connected, through pixels within `tol` (per channel) of the border's background color, then peel one ring of
    near-white fringe off the island. Near-white pixels the fill can't reach from the border (highlights) stay."""
    w, h = im.size
    flat = Image.new("RGBA", im.size, (255, 255, 255, 255))
    flat.alpha_composite(im)  # anything see-through counts as white
    px = flat.convert("RGB").load()
    corners = [px[0, 0], px[w - 1, 0], px[0, h - 1], px[w - 1, h - 1]]
    bg = tuple(sorted(c[k] for c in corners)[2] for k in range(3))  # median of the four corners

    def near(p, t):
        return abs(p[0] - bg[0]) <= t and abs(p[1] - bg[1]) <= t and abs(p[2] - bg[2]) <= t

    out = bytearray(b"\xff" * (w * h))  # 255 = island
    stack = []
    for x in range(w):
        stack += [(x, 0), (x, h - 1)]
    for y in range(h):
        stack += [(0, y), (w - 1, y)]
    while stack:
        x, y = stack.pop()
        if out[y * w + x] == 0 or not near(px[x, y], tol):
            continue
        out[y * w + x] = 0
        if x > 0:
            stack.append((x - 1, y))
        if x < w - 1:
            stack.append((x + 1, y))
        if y > 0:
            stack.append((x, y - 1))
        if y < h - 1:
            stack.append((x, y + 1))
    fringe = []
    for y in range(h):
        for x in range(w):
            if out[y * w + x] and near(px[x, y], tol * 3):
                for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1), (1, 1), (-1, -1), (1, -1), (-1, 1)):
                    nx, ny = x + dx, y + dy
                    if 0 <= nx < w and 0 <= ny < h and out[ny * w + nx] == 0:
                        fringe.append(y * w + x)
                        break
    for i in fringe:
        out[i] = 0
    mask = Image.new("L", (w, h))
    mask.putdata(list(out))
    return mask


def key_painting(im, mode="auto", tol=24):
    """RGBA painting -> (RGBA with alpha 0/255, how it was keyed)."""
    im = im.convert("RGBA")
    hist = im.getchannel("A").histogram()
    see_through = sum(hist[:128]) / float(im.width * im.height)
    if mode == "alpha" or (mode == "auto" and see_through >= 0.02):
        mask, how = im.getchannel("A").point(lambda v: 255 if v >= 128 else 0), "alpha"
    else:
        mask, how = _flood_white(im, tol), "white"
    out = im.copy()
    out.putalpha(mask)
    return out, how


def cells(n0, n1, scale=PAINT_SCALE):
    """Painting px sampled for a run n0..n1 (exclusive): the px under the centre of every whole-or-part cell whose centre
    is inside the run, n0 + (i + 1/2) * scale."""
    out, i = [], 0
    while (i + Fraction(1, 2)) * scale < n1 - n0:
        out.append(n0 + math.floor((i + Fraction(1, 2)) * scale))
        i += 1
    return out


def crop_snap(keyed, box, allowed=None, scale=PAINT_SCALE):
    """Painting box -> Canvas: nearest neighbour at `scale`, snapped to the palette (crop colours by default)."""
    x0, y0, x1, y1 = box
    xs, ys = cells(x0, x1, scale), cells(y0, y1, scale)
    src = keyed.load()
    allowed = allowed or CROP_COLORS
    cache = {}
    cv = Canvas(len(xs), len(ys))
    for j, sy in enumerate(ys):
        for i, sx in enumerate(xs):
            r, g, b, a = src[sx, sy]
            if a < 128:
                continue
            if (r, g, b) not in cache:
                cache[(r, g, b)] = nearest((r, g, b), allowed)
            cv.pix[j * cv.w + i] = cache[(r, g, b)]
    return cv


def to_sprite(island, painting_xy):
    """A painting px -> the sprite px its crop cell lands on."""
    bx, by = CROP[island][:2]
    ox, oy = CROP_AT[island]
    return ox + math.floor((painting_xy[0] - bx) / PAINT_SCALE), oy + math.floor((painting_xy[1] - by) / PAINT_SCALE)


# ---------------------------------------------------------------------------------------------------------------
# 4. The five forms
# ---------------------------------------------------------------------------------------------------------------
# Each takes the island's snapped crop and returns (canvas, extras): the base drawn in palette indices with the crop on
# it, content inside 1 px of the edge (the outline goes there). extras: lights, and anything a later step needs.


ERR_RIM = 60  # Errors' rim: its widest row, where the flanks meet the basalt
ERR_LEDGE = 45  # the top of the hut's ledge (its feet stand on it)
ERR_TIPS = {38: 102, 84: 126, 124: 108}  # the three prongs: the column centred on x ends on this row
ERR_POOL = (109, 13)  # the middle of the lava pool in the crater
ERR_CRATER = (109.0, 11.0, 17.0, 7.5)  # the crater bowl: centre x, y and radii (its rim runs from x 92 to x 126)
ERR_CRACK_W = ((0.42, 3), (0.84, 2), (9.0, 1))  # the crack's width by how far along it is: 3 px at the crater, 2 mid, 1 at
# the far end; a branch is 2 px at its root and 1 px at its tip, never wider than the crack it leaves
BRANCHES = ((22, -8, 3), (30, 9, -4), (49, -9, 5), (72, 8, 6), (88, -8, 7), (97, -6, 5))  # (row it leaves the crack, dx, dy)
COL_MIN, COL_MAX = 3, 6  # a basalt column's width
STEP_MIN, STEP_MAX = 3, 8  # a basalt column ends this much lower than its neighbour on the side away from the tip


def column_widths(n_px, salt, avg=4.8):
    """Widths of COL_MIN to COL_MAX px that add up to n_px, about avg on average, varied by noise."""
    n = max(1, round(n_px / avg))
    while n * COL_MAX < n_px:
        n += 1
    while n > 1 and n * COL_MIN > n_px:
        n -= 1
    ws = [n_px // n] * n
    for j in sorted(range(n), key=lambda j: noise(j, 5, salt))[: n_px - sum(ws)]:  # the remainder, one px each
        ws[j] += 1
    for i in range(n - 1):  # trade a px or two between neighbours, so no two runs repeat
        give = 2 if noise(i, 3, salt) > 0.6 else 1
        if noise(i, 1, salt) > 0.5 and ws[i] - give >= COL_MIN and ws[i + 1] + give <= COL_MAX:
            ws[i], ws[i + 1] = ws[i] - give, ws[i + 1] + give
        elif noise(i, 2, salt) > 0.5 and ws[i] + give <= COL_MAX and ws[i + 1] - give >= COL_MIN:
            ws[i], ws[i + 1] = ws[i] + give, ws[i + 1] - give
    return ws


def fit_steps(total, nominal):
    """Steps of STEP_MIN..STEP_MAX px, as close to nominal as they can be, adding up to total (nominal[0] is the step
    nearest the tip, which changes last). total must be reachable."""
    s = [max(STEP_MIN, min(STEP_MAX, v)) for v in nominal]
    order = list(range(len(s) - 1, -1, -1))
    while sum(s) != total:
        moved = False
        for j in order:
            if sum(s) < total and s[j] < STEP_MAX:
                s[j] += 1
                moved = True
            elif sum(s) > total and s[j] > STEP_MIN:
                s[j] -= 1
                moved = True
            if sum(s) == total:
                break
        if not moved:
            raise ValueError(f"no steps of {STEP_MIN}..{STEP_MAX} add up to {total}")
    return s


def basalt_columns(x0, x1, tips, salt):
    """The underside's basalt columns from x0 to x1: one 5 px column centred on each tip, the gaps between filled with
    columns of 3 to 6 px. Then each column's lowest row (its tip, at its right-hand edge: drawn, each column's end is cut
    at 45 degrees up to the left): every column ends 3 to 8 px lower than its neighbour on the side away from the nearest
    tip (nominally 3 or 4 next to a tip, so a prong ends in a point, and about 7 further out; the steps between two tips are
    fitted so both flanks climb to one valley column, 3 to 8 px above both its neighbours), so the outline steps down like
    organ pipes to the three tips. Returns [(a, b, bottom), ...], left to right."""
    spans, x = [], x0
    for t in sorted(tips):
        spans.append((x, t - 3, None))
        spans.append((t - 2, t + 2, t))
        x = t + 3
    spans.append((x, x1, None))
    cols, k = [], 0
    for a, b, t in spans:
        if t is not None:
            cols.append((a, b, t))
            continue
        for wd in column_widths(b - a + 1, salt + k, 5.4 if b - a < 36 else 4.8):
            cols.append((a, a + wd - 1, None))
            a += wd
        k += 1
    n = len(cols)
    tip_at = [c for c in range(n) if cols[c][2] is not None]
    bottoms = [0] * n
    for c in tip_at:
        bottoms[c] = tips[cols[c][2]]

    def nominal(i, d):  # the step between column i and its neighbour; d = how many columns from the tip it is
        return 3 + int(noise(i, 9, salt) * 2) if d == 0 else 6 + int(noise(i, 9, salt) * 3)

    for c in range(tip_at[0] - 1, -1, -1):  # the outer flanks fall away from the first and the last tip
        bottoms[c] = max(ERR_RIM + 4, bottoms[c + 1] - nominal(c, tip_at[0] - 1 - c))
    for c in range(tip_at[-1] + 1, n):
        bottoms[c] = max(ERR_RIM + 4, bottoms[c - 1] - nominal(c, c - 1 - tip_at[-1]))
    for a, b in zip(tip_at, tip_at[1:]):  # between two tips: both flanks climb to one valley column
        best = None
        for v in range(a + 1, b):
            nl, nr = v - a, b - v
            lo = max(bottoms[a] - STEP_MAX * nl, bottoms[b] - STEP_MAX * nr, ERR_RIM + 4)
            hi = min(bottoms[a] - STEP_MIN * nl, bottoms[b] - STEP_MIN * nr)
            if lo > hi:
                continue
            want = round(min(bottoms[a] - sum(nominal(a + j, j) for j in range(nl)),
                             bottoms[b] - sum(nominal(b - 1 - j, j) for j in range(nr))))
            row = max(lo, min(hi, want))
            score = abs(row - want) - 0.01 * (bottoms[a] + bottoms[b] - 2 * row)
            if best is None or score < best[0]:
                best = (score, v, row)
        _, v, row = best
        left = fit_steps(bottoms[a] - row, [nominal(a + j, j) for j in range(v - a)])
        right = fit_steps(bottoms[b] - row, [nominal(b - 1 - j, j) for j in range(b - v)])
        for j, s in enumerate(left):
            bottoms[a + 1 + j] = bottoms[a + j] - s
        for j, s in enumerate(right):
            bottoms[b - 1 - j] = bottoms[b - j] - s
    return [(a, b, bot) for (a, b, _), bot in zip(cols, bottoms)]


def column_joints(cols, salt):
    """One or two fracture joints per basalt column (two once it hangs 24 rows or more under the rim's shade), each
    column's staggered against its neighbours': the row nearest its spot that is 3 rows or more from every joint in the
    column to its left, clear of the column's 45-degree cut. Returns [[row, ...], ...], one list per column."""
    out, prev = [], []
    for k, (a, b, bot) in enumerate(cols):
        top, end = ERR_RIM + 5, bot - (b - a) - 3
        n = 2 if end - top >= 24 else 1 if end >= top else 0
        rows = []
        for j in range(n):
            want = top + (end - top) * (j + 1) / (n + 1.0) + (noise(k, 8 + j, salt) - 0.5) * 6 + (2 if k % 2 else -2)
            ok = [y for y in range(top, end + 1) if all(abs(y - p) >= 3 for p in prev) and all(abs(y - r) >= 6 for r in rows)]
            if ok:
                rows.append(min(ok, key=lambda y: abs(y - want)))
        out.append(sorted(rows))
        prev = rows
    return out


def bresenham(x0, y0, x1, y1):
    """The px of a 1 px line from (x0, y0) to (x1, y1), both ends included, each step one px in x, y or both."""
    out = []
    dx, dy = abs(x1 - x0), -abs(y1 - y0)
    sx, sy = (1 if x0 < x1 else -1), (1 if y0 < y1 else -1)
    err = dx + dy
    while True:
        out.append((x0, y0))
        if x0 == x1 and y0 == y1:
            return out
        e2 = 2 * err
        if e2 >= dy:
            err += dy
            x0 += sx
        if e2 <= dx:
            err += dx
            y0 += sy


def crack_px(path, branches, width_at):
    """The crack, rasterized: a 1 px skeleton through the path's points and each branch's (Bresenham), widened to
    width_at(t, branch) px (t: how far along it is, 0 at its start, 1 at its end): sideways where the run falls, downward
    where it runs across. Returns {(x, y): (core?, width)}; a core px is on the skeleton."""
    def runs(points):
        cells, total = [], 0.0
        pts = [(int(px_), int(py_)) for px_, py_ in points]
        lengths = [math.hypot(b[0] - a[0], b[1] - a[1]) for a, b in zip(pts, pts[1:])]
        whole = sum(lengths) or 1.0
        for (a, b), n in zip(zip(pts, pts[1:]), lengths):
            line = bresenham(*a, *b)
            steep = abs(b[1] - a[1]) >= abs(b[0] - a[0])
            for i, p in enumerate(line):
                cells.append((p, (total + n * i / max(1, len(line) - 1)) / whole, steep))
            total += n
        return cells

    out = {}

    def put(p, core, w):
        old = out.get(p)
        if old is None or (core and not old[0]) or (core == old[0] and w > old[1]):
            out[p] = (core, w)

    for name, points in [("main", path)] + [(k, br) for k, br in enumerate(branches)]:
        for (x, y), t, steep in runs(points):
            w = width_at(t, name)
            put((x, y), True, w)
            sides = ((-1, 0), (1, 0)) if steep else ((0, 1), (0, -1))
            for dx, dy in sides[: w - 1]:
                put((x + dx, y + dy), False, w)
    return out


def form_errors(crop):
    """The caldera: a basalt cone that peaks well above the hut, a lava pool in its crater behind a glowing rim, a ledge for
    the hut, and an underside of basalt columns stepping down like organ pipes to three prongs, each column's end cut at 45
    degrees. The crack is the island's identity: from the pool, down the right flank, then down the joints between the
    columns, hot to cool from its core to the rock (sun[5], sun[3], jam[1]), 3 px wide at the crater, 2 mid, 1 at the tips,
    with a 1 px copper[1] cast on the rock to its right, where its light falls."""
    W, H = SIZE["errors"]
    cv = Canvas(W, H)
    big, facet = Stones(BIG, 300), Stones(FACET, 400)
    RIM = ERR_RIM
    # the cone: a steep left flank up from the ledge, a crater rim at the top of the frame, a long sunny right flank
    cone = [(78, 47), (80, 42), (82, 36), (84, 31), (86, 25), (88, 20), (90, 15), (92, 10), (94, 6), (96, 3), (98, 2),
            (100, 1), (103, 1), (105, 2), (108, 3), (111, 3), (114, 2), (117, 2), (120, 3), (122, 5), (124, 7), (126, 9), (128, 12),
            (130, 16), (132, 20), (134, 24), (136, 28), (138, 31), (140, 35), (142, 38), (144, 42), (146, 46), (148, 49),
            (150, 52), (152, 55), (154, 59)]
    ledge = {1: ERR_LEDGE + 6, 2: ERR_LEDGE + 3, 3: ERR_LEDGE + 1}

    def top(x):
        return ledge.get(x, ERR_LEDGE) if x < 78 else round(interp(cone, x))

    CRX, CRY, CR_RX, CR_RY = ERR_CRATER

    def bowl(x, y):
        return y >= top(x) and ((x + 0.5 - CRX) / CR_RX) ** 2 + ((y + 0.5 - CRY) / CR_RY) ** 2 <= 1.0

    def lip(x):  # the crater's near rim: the row where the cone's front hides the bowl
        u = (x + 0.5 - CRX) / CR_RX
        return int(CRY + CR_RY * 0.52 * math.sqrt(max(0.0, 1 - u * u)))

    cols = basalt_columns(1, 154, ERR_TIPS, 351)
    end = {x: bot - (b - x) for a, b, bot in cols for x in range(a, b + 1)}  # each px column's lowest row, after the cut

    def light(x, y):
        if x >= 80:  # the cone: lit on its right flank, its foot in the ledge's shade
            return 0.04 + 0.24 * (x - 112) / 40.0 - 0.06 * max(0.0, (y - 34) / 26.0)
        return 0.12 if y < ERR_LEDGE + 4 else 0.0  # the ledge's top faces the sky, its face the viewer

    for x in range(1, 155):
        fill_rock(cv, [(x, y) for y in range(top(x), RIM)], big, facet, light, lambda x, y: 0.0, 300)
    # the basalt columns: a soot seam, an iron[0] shade face, a front that darkens with depth, a plate[2] / iron[3] sun
    # face (every third column's a step lighter, plate[3] / plate[2]); each end cut at 45 degrees up to the left, the cut in
    # shade, its tip on the right a lit facet; one or two staggered fracture joints (a dark joint, the lower piece's lit lip)
    for k, ((a, b, bot), joints) in enumerate(zip(cols, column_joints(cols, 358))):
        sunny = k % 3 == 0
        for x in range(a, b + 1):
            for y in range(RIM + 2, end[x] + 1):
                deep = (y - RIM - 2) / float(max(10, bot - RIM - 2))
                if x == a:
                    c = SOOT
                elif x == a + 1:
                    c = IRON[0]
                elif x == b:
                    c = (PLATE[3] if sunny else PLATE[2]) if deep < 0.45 else (PLATE[2] if sunny else IRON[3])
                else:
                    v = 0.8 - 0.55 * deep + (blotch(k * 17, y, 13, 381) - 0.5) * 0.1 + (noise(k, 4, 383) - 0.5) * 0.16
                    c = tone(x, y, [IRON[1], IRON[2], PLATE[1]], v)
                cv.set(x, y, c)
        for x in range(a + 1, b):  # the cut: its face looks down and away from the sun
            cv.set(x, end[x], IRON[0])
        cv.set(b, bot, PLATE[3])  # its tip, on the column's sunny edge, catches the light
        cv.set(b, bot - 1, PLATE[3] if b - a >= 3 else cv.at(b, bot - 1))
        for jy in joints:
            for x in range(a + 1, b + 1):
                if jy + 1 < end[x]:
                    cv.set(x, jy, IRON[0])
                    cv.set(x, jy + 1, PLATE[2] if x == b else PLATE[1] if x > a + 1 else IRON[1])
    # the rim: the top's front edge catches the sun, the underside right under it is in its shade
    for x in range(1, 155):
        cv.set(x, RIM, PLATE[3] if noise(x, RIM, 353) > 0.35 else PLATE[2])
        cv.set(x, RIM - 1, tone(x, RIM - 1, ROCK, 0.62 + (noise(x, RIM, 362) - 0.5) * 0.2))
        cv.set(x, RIM + 1, SOOT if noise(x, 1, 354) < 0.5 else IRON[0])
    for x in range(4, 79):  # the ledge's front edge
        cv.set(x, ERR_LEDGE + 4, tone(x, ERR_LEDGE + 4, ROCK, 0.7 + (noise(x, 46, 355) - 0.5) * 0.2))
        cv.set(x, ERR_LEDGE + 5, SOOT if noise(x, 47, 356) < 0.5 else IRON[0])
    # the crater: its far wall lit from below by the pool, the pool (a sun[5] heart in sun[4]), and the near rim, one
    # unbroken 1 px jam[1] arc from x 92 to x 126 where the lava meets the rock, the sun on the lip in front of it
    for y in range(0, 24):
        for x in range(int(CRX - CR_RX), int(CRX + CR_RX) + 1):
            if not bowl(x, y):
                continue
            if y < lip(x):
                d = math.hypot((x + 0.5 - ERR_POOL[0]) / 1.9, y + 0.5 - (ERR_POOL[1] + 1.5))
                cv.set(x, y, SUN[2] if d < 4.6 else SUN[1] if d < 6.8 else SUN[0] if d < 9.0 else BRASS[0])
    for x in range(int(CRX - CR_RX), int(CRX + CR_RX) + 1):
        ly = lip(x)
        for y in range(ly - 3, ly):  # the pool: three rows behind the rim, where the bowl is deep enough; its hottest
            if bowl(x, y) and abs(x + 0.5 - CRX) < CR_RX - 3:  # lava runs along its foot to where the crack drains it
                cv.set(x, y, SUN[5] if y == ly - 1 and ERR_POOL[0] - 2 <= x < 114 else SUN[4])
    arc = []
    for x in range(int(CRX - CR_RX), int(CRX + CR_RX) + 1):
        arc.append((x, lip(x)))
    for (x0, y0), (x1, y1) in zip(arc, arc[1:]):  # unbroken: a step of two rows gets the px between
        for y in range(min(y0, y1) + 1, max(y0, y1)):
            arc.append((x0 if y1 > y0 else x1, y))
    for x, y in arc:
        if y >= top(x):
            cv.set(x, y, JAM[1])
            if cv.at(x, y + 1) >= 0 and (x, y + 1) not in arc:
                cv.set(x, y + 1, PLATE[3] if x > CRX - 3 else PLATE[2])  # the lip in front of it, in the sun
    # the crack: pool -> down the right flank (in the crevices between the stones) -> the rim at (130, 59) -> down the
    # joints between the columns, a staircase, to (96, 100)
    path, xp = [(114.5, 13.5), (114.5, 15.5)], 114
    for y in range(16, 59):
        x0 = 114 + (130 - 114) * (y - 15) / 43.0
        best = min(range(max(xp - 2, int(x0) - 3), min(xp + 2, int(x0) + 3) + 1),
                   key=lambda xx: big.near(xx, y)[2] + 0.35 * abs(xx - x0) + 0.25 * abs(xx - xp))
        path.append((best + 0.5, y + 0.5))
        xp = best
    path.append((130.5, 59.5))
    seams = sorted((a for a, b, bot in cols if 96 <= a <= 131), reverse=True)
    seams = [s for i, s in enumerate(seams) if i in (0, len(seams) - 1) or noise(s, 6, 365) > 0.3]  # now and then it
    y = 62.0  # cuts straight across two columns
    for i, s in enumerate(seams):  # down a seam, then across to the next seam on its left, a row or two lower
        floor_ = min(end[s], end.get(s - 1, end[s])) - 6
        y = min(max(y + 3 + int(noise(s, 7, 366) * 5), 62 + (130 - s) * 1.15), floor_)
        path.append((path[-1][0], y + 0.5))
        if i + 1 < len(seams):
            drop = 1 + int(noise(s, 8, 367) * 2)
            path.append((seams[i + 1] + 0.5, y + drop + 0.5))
            y += drop
    path += [(path[-1][0], 99.5), (96.5, 100.5)]

    def at_row(yy):  # the path's x on row yy (its first point at or below it)
        return next(px_ for px_, py_ in path if py_ >= yy + 0.5)

    branches = []
    for yy, dx, dy in BRANCHES:
        x0 = at_row(yy)
        branches.append([(x0, yy + 0.5), (x0 + dx * 0.6, yy + 0.5 + dy * 0.3), (x0 + dx, yy + 0.5 + dy)])
    total = sum(math.hypot(b[0] - a[0], b[1] - a[1]) for a, b in zip(path, path[1:]))

    def along(yy):  # how far along the main crack (0..1) its point on row yy is
        acc = 0.0
        for a, b in zip(path, path[1:]):
            if b[1] >= yy + 0.5:
                return acc / total
            acc += math.hypot(b[0] - a[0], b[1] - a[1])
        return 1.0

    def width_main(t):
        return next(w for lim, w in ERR_CRACK_W if t <= lim)

    branch_root = [width_main(along(yy)) for yy, _, _ in BRANCHES]

    def width_at(t, name):
        if name == "main":
            return width_main(t)
        return min(branch_root[name], 2 if t < 0.5 else 1)

    crack = {p: v for p, v in crack_px(path, branches, width_at).items() if cv.at(*p) >= 0}
    for (x, y), (core, w) in crack.items():
        cv.set(x, y, LAVA_CORE[w] if core else LAVA_EDGE[w])
    for (x, y) in crack:  # the lava's light on the rock to its right: one solid px, no dither
        if (x + 1, y) not in crack and cv.at(x + 1, y) >= 0 and not bowl(x + 1, y) and (x + 1, y) not in arc:
            cv.set(x + 1, y, COPPER[1])
    cv.paste(crop, *CROP_AT["errors"])

    def on_crack(y):  # the crack's core px on row y nearest the path (the runtime hangs a glow there)
        xs = [x for (x, yy), (core, _) in crack.items() if yy == y and core]
        return [min(xs, key=lambda x: dist_poly(x + 0.5, y + 0.5, path)), y]

    lights = [{"at": list(ERR_POOL), "kind": "crack"}] + [{"at": on_crack(y), "kind": "crack"} for y in (40, 80)]
    return cv, {"lights": lights}


TRAFFIC_LEGS = (22, 74, 126, 178)  # each lattice leg's left chord (legs are 4 px wide)
LEG_TOP, LEG_BOT, LEG_MID = 69, 80, 75  # legs 12 rows tall, under the slab; the K braces leave them at mid height
LEG_SPLAY = 3  # the foot splays 1 px a side on each of its last 3 rows
TIE_Y = 78  # the tie between the legs, where their feet start to splay
CLUMP_Y = 79  # each boulder's top row: the leg's foot plate sits on its crown
CLUMP = ((3, 8), (1, 12), (0, 14), (0, 14), (0, 14), (0, 14), (1, 12))  # (indent, width) per row: 14 x 7, flat underneath


def boulder(cv, rows, x0, y0, facet, salt):
    """One stone, rows [(indent, width), ...] from (x0, y0): shaded as a single rounded stone lit on its upper right
    (no crevice through it), facet creases for texture, darker toward its flat underside."""
    h, w = len(rows), max(a + n for a, n in rows)
    cx, cy = x0 + w / 2.0, y0 + h * 0.5
    for j, (a, n) in enumerate(rows):
        for i in range(n):
            x, y = x0 + a + i, y0 + j
            nx, ny = (x + 0.5 - cx) / (w / 2.0), (y + 0.5 - cy) / (h * 0.62)
            f, _, fseam = facet.near(x, y)
            fface = (x + 0.5 - f[0]) * 0.62 - (y + 0.5 - f[1]) * 0.78
            face = nx * 0.62 - ny * 0.78
            v = 0.58 + (0.5 * face if face > 0 else 0.25 * face) - 0.08 * min(1.4, nx * nx + ny * ny) + (f[3] - 0.5) * 0.12
            v -= 0.1 * j / max(1.0, h - 1.0)
            if fseam < 0.9 and v > 0.3:
                v -= 0.1  # a facet edge: a shallow crease
            elif fseam < 2 and fface > 1:
                v += 0.07  # a facet's lit edge
            v += (noise(x, y, salt) - 0.5) * 0.05
            cv.set(x, y, tone(x, y, ROCK, v))


def form_traffic(crop):
    """The rail slab: a long thin riveted iron slab on four lattice legs, K-braced up to the slab and tied at the feet,
    each leg's splayed foot planted on a flat-bottomed boulder."""
    W, H = SIZE["traffic"]
    cv = Canvas(W, H)
    facet = Stones(FACET, 600)
    for k, lx in enumerate(TRAFFIC_LEGS):
        boulder(cv, CLUMP, lx - 5, CLUMP_Y, facet, 500 + k)
    for lx in TRAFFIC_LEGS:  # lattice legs: dark chord, lit chord, a zigzag between; the last rows splay into a foot
        for y in range(LEG_TOP, LEG_BOT + 1):
            s = max(0, y - (LEG_BOT - LEG_SPLAY))
            l, r = lx - s, lx + 3 + s
            for x in range(l + 1, r):
                cv.set(x, y, IRON[2] if (x + y) % 3 == 0 else IRON[1])
            cv.set(l, y, IRON[1])
            cv.set(r, y, IRON[3])
        cv.hline(lx - LEG_SPLAY, LEG_BOT, 4 + 2 * LEG_SPLAY, IRON[2])  # the foot plate, bolted
        cv.set(lx - LEG_SPLAY + 1, LEG_BOT, BRASS[2])
        cv.set(lx + 2 + LEG_SPLAY, LEG_BOT, BRASS[2])
        cv.hline(lx, LEG_TOP, 4, IRON[0])  # where the leg meets the slab: a shadow
    for x in range(1, 199):  # the slab
        cv.set(x, 63, PLATE[3])
        for y in range(64, 68):
            cv.set(x, y, PLATE[1])
        cv.set(x, 68, IRON[1])  # its underside edge, in its own shade
    signals = [12 + 24 * i for i in range(8)]
    for x in range(4, 198, 6):
        if all(abs(x - s) > 2 for s in signals):
            cv.set(x, 65, BRASS[2])
            cv.set(x, 66, PLATE[0])
    for x in range(16, 198, 32):  # plate seams with a lit right-hand bevel
        if all(abs(x - s) > 2 for s in signals):
            cv.vline(x, 64, 4, PLATE[0])
            cv.vline(x + 1, 64, 4, PLATE[2])
    for s in signals:  # signal lamps, off: a dark lens in a brass hood (the runtime lights them)
        cv.hline(s - 1, 65, 4, BRASS[1])
        cv.rect(s, 66, 2, 2, IRON[0])
    cv.vline(1, 64, 4, IRON[0])  # the slab's ends: the left one turned from the sun
    cv.paste(crop, *CROP_AT["traffic"])
    # the K braces, iron members from mid leg up to the slab at slope 1/2 (the arm reaching right, toward the sun, iron[3];
    # the other iron[1]), and an iron[1] tie between the feet: drawn as members, so they take the soot outline like
    # everything else, and kept out of the sun rim so they stay iron
    members = set()
    for lx in TRAFFIC_LEGS:
        for (x0, x1), c in (((lx - 1, lx - 1 - 2 * (LEG_MID - LEG_TOP)), IRON[1]), ((lx + 4, lx + 4 + 2 * (LEG_MID - LEG_TOP)), IRON[3])):
            for x, y in bresenham(x0, LEG_MID, x1, LEG_TOP):
                if not cv.opaque(x, y):
                    cv.set(x, y, c)
                    members.add((x, y))
    for a, b in zip(TRAFFIC_LEGS, TRAFFIC_LEGS[1:]):
        for x in range(a + 4, b):
            if not cv.opaque(x, TIE_Y):
                cv.set(x, TIE_Y, IRON[1])
                members.add((x, TIE_Y))
    return cv, {"lights": [{"at": [s, 66], "kind": "signal"} for s in signals], "norim": members}


INBOX_LIP = 68  # the plinth's top front edge: a 1 px plate[3] sun lip, the edge of a platform
INBOX_BASE = 91  # the plinth's bottom row: 8 px below the deck of a span landing on its face (belt centre row 72)
INBOX_SHAFT = INBOX_BASE + 1  # the shaft hangs from under the plinth
INBOX_ENVELOPE = (15, 29)  # the envelope window's top-left: 9 x 7 with its soot frame


def form_inbox(crop):
    """The post tower: the painting's tower, its window redrawn as an envelope, on a deep riveted plinth (a platform the
    spans land on, a sun lip along its top edge) over a riveted iron shaft that tapers to a cap."""
    W, H = SIZE["inbox"]
    cv = Canvas(W, H)
    big, facet = Stones(BIG, 700), Stones(FACET, 800)
    SHAFT = [SOOT, IRON[0], IRON[1], IRON[2], IRON[3]]

    def column(x0, x1, y0, y1, lift=0.0):
        """A riveted iron cylinder lit from the front right: dark on its left, a sheen past the middle, an iron[3] edge."""
        for y in range(y0, y1 + 1):
            for x in range(x0, x1 + 1):
                th = ((x + 0.5 - x0) / float(x1 - x0 + 1) * 2 - 1) * math.pi / 2 * 0.92
                lam = max(0.0, 0.6 * math.sin(th) + 0.8 * math.cos(th))
                v = 0.14 + 0.6 * lam + lift + (blotch(x, y, 7, 701) - 0.5) * 0.12 + (noise(x, y, 702) - 0.5) * 0.04
                cv.set(x, y, tone(x, y, SHAFT, v))
            cv.set(x1, y, IRON[3])

    column(12, 51, INBOX_SHAFT, 159)
    for x in (21, 30, 39):  # vertical plate seams, rivets down each
        for y in range(INBOX_SHAFT, 160):
            cv.set(x, y, IRON[0])
            if y % 4 == 1:
                cv.set(x + 1, y, IRON[3] if x > 30 else IRON[2])
    bands = list(range(INBOX_SHAFT + 4, 156, 16))
    for y in bands:  # brass bands
        for x in range(12, 52):
            cv.set(x, y, BRASS[3] if x > 40 else BRASS[2])
            cv.set(x, y + 1, BRASS[1])
    ports = [(px_, by + 8) for by in bands for px_ in (22, 36)]
    windows = [p for p in ports if p[1] in (bands[0] + 8, bands[2] + 8)]  # the four that light up
    for wx, wy in ports:  # portholes: a brass ring round dark glass, a glint on its upper right
        for dy in range(-2, 2):
            for dx in range(-2, 2):
                corner = dx in (-2, 1) and dy in (-2, 1)
                if not corner:
                    cv.set(wx + dx, wy + dy, BRASS[2] if dx in (-2, 1) or dy in (-2, 1) else IRON[0])
        cv.set(wx, wy - 1, IRON[3])
        cv.set(wx + 1, wy - 2, BRASS[3])
    for px in (42, 45, 48):  # three copper mail pipes down the right face, clamped at every band
        for y in range(INBOX_SHAFT, 157):
            cv.set(px, y, COPPER[1] if y % 9 else COPPER[0])
            cv.set(px + 1, y, COPPER[3] if (y + px) % 11 == 0 else COPPER[2])
        for y in bands:
            cv.set(px, y, BRASS[2])
            cv.set(px + 1, y, BRASS[3])
        cv.set(px, 157, BRASS[1])
        cv.set(px + 1, 157, BRASS[2])
    column(16, 47, 160, 165, -0.05)  # the stepped taper
    column(22, 41, 166, 171, -0.1)
    cv.hline(16, 160, 32, BRASS[1])
    cv.hline(22, 166, 20, BRASS[1])
    for x in range(16, 48, 5):
        cv.set(x, 163, BRASS[2])
    cap = [(x, y) for y, (a, b) in zip(range(172, 175), ((24, 39), (26, 37), (29, 35))) for x in range(a, b + 1)]
    fill_rock(cv, cap, big, facet, lambda x, y: 0.0, lambda x, y: (y - 171) / 3.0, 700)
    for x, y, c in ((26, 172, ENERGY[1]), (27, 173, ENERGY[2]), (27, 172, ENERGY[3]), (36, 172, ENERGY[1]),
                    (36, 173, ENERGY[2]), (37, 172, ENERGY[2]), (31, 174, ENERGY[1]), (32, 174, ENERGY[2])):
        cv.set(x, y, c)  # one crystal cluster in the cap
    # the plinth: a flagstone top behind the tower, a plate[3] sun lip along its front edge, then a deep riveted face (a
    # brass trim, two courses of plates with a brass band between, a heavy dark lip) that the spans land on
    for y in range(64, INBOX_LIP):
        for x in range(2, 62):
            v = 0.55 + 0.1 * (x / 62.0) - 0.06 * (67 - y) + (noise(x, y, 703) - 0.5) * 0.1
            cv.set(x, y, tone(x, y, [IRON[1], IRON[2], PLATE[1], PLATE[2], PLATE[3]], v))
            if (x + 6 * (y // 2)) % 12 == 0:
                cv.set(x, y, IRON[1])
    mid = (INBOX_LIP + INBOX_BASE) // 2 + 1  # the brass band between the two courses
    for x in range(1, 63):
        cv.set(x, INBOX_LIP, PLATE[3])
        cv.set(x, INBOX_LIP + 1, BRASS[3] if x > 42 else BRASS[2])
        for y in range(INBOX_LIP + 2, INBOX_BASE - 2):
            v = 0.5 + 0.12 * (x / 62.0) + (blotch(x, y, 6, 704) - 0.5) * 0.14 + (noise(x, y, 705) - 0.5) * 0.04
            cv.set(x, y, tone(x, y, [PLATE[0], PLATE[1], PLATE[1], PLATE[2]], v))
        cv.set(x, mid, BRASS[2] if x > 42 else BRASS[1])
        cv.set(x, mid + 1, PLATE[0])
        cv.set(x, INBOX_BASE - 2, BRASS[1] if x % 8 != 4 else BRASS[3])  # the heavy bottom lip
        cv.set(x, INBOX_BASE - 1, IRON[1])
        cv.set(x, INBOX_BASE, IRON[0])
    for x in range(3, 62, 5):  # rivets: one row under each trim
        for y in (INBOX_LIP + 3, mid + 3):
            cv.set(x, y, BRASS[2] if x > 30 else BRASS[1])
            cv.set(x, y + 1, PLATE[0])
    for k, x in enumerate((9, 17, 25, 33, 41, 49, 57)):  # plate seams with a lit right-hand bevel, staggered by course
        x0 = x if k % 2 else x - 4
        for y0, y1 in ((INBOX_LIP + 2, mid - 1), (mid + 2, INBOX_BASE - 3)):
            xx = x0 if y0 < mid else x0 + 4
            if 2 <= xx <= 60:
                cv.vline(xx, y0, y1 - y0 + 1, PLATE[0])
                cv.vline(xx + 1, y0, y1 - y0 + 1, PLATE[2])
    cv.vline(1, INBOX_LIP + 1, INBOX_BASE - INBOX_LIP - 1, IRON[0])  # the left end, turned from the sun
    ox, oy = CROP_AT["inbox"]
    tower = Canvas(crop.w, crop.h, [c if not (ox + i % crop.w < 11 and oy + i // crop.w >= 40) else -1 for i, c in enumerate(crop.pix)])
    cv.paste(tower, ox, oy, box=(1, 1, 62, INBOX_LIP - 1))  # the tower, steps and pipes; the rubble left of it goes (the lamp
    # stands there)
    # the envelope window: 9 x 7 in a soot frame, a haze[3] envelope with a brass[2] V flap and a white glint, upper right
    ex, ey = INBOX_ENVELOPE
    cv.rect(ex, ey, 9, 7, SOOT)
    cv.rect(ex + 1, ey + 1, 7, 5, HAZE[3])
    for i, (vx, vy) in enumerate(((0, 0), (1, 1), (2, 2), (3, 3), (4, 2), (5, 1), (6, 0))):
        cv.set(ex + 1 + vx, ey + 1 + vy, BRASS[2])
    glint = [(ex + 5, ey + 1), (ex + 6, ey + 1)]
    for x, y in glint[:1]:
        cv.set(x, y, WHITE)
    # the lamp post on the plinth: a 3 x 3 lantern, like the bridges' lanterns
    cv.vline(5, 60, 5, IRON[2])
    cv.set(6, 64, IRON[1])
    cv.hline(4, 57, 3, BRASS[1])
    cv.hline(4, 58, 3, BRASS[4])
    cv.set(6, 58, BRASS[5])
    cv.hline(4, 59, 3, BRASS[3])
    return cv, {"lights": [{"at": [wx, wy], "kind": "window"} for wx, wy in windows], "lamp": (5, 58), "bright": glint[:1]}


def form_customers(crop):
    """The landing disc: a flat elliptical deck on a brass-lipped rim band over a shallow saucer with three thrusters."""
    W, H = SIZE["customers"]
    cv = Canvas(W, H)
    SAUCER = [SOOT, IRON[0], IRON[1], IRON[2], IRON[3]]
    CX, RX, RY = 98.5, 90.5, 21.0
    bot = {}
    for x in range(8, 189):
        bot[x] = 63 + max(1, int(RY * math.sqrt(max(0.0, 1 - ((x + 0.5 - CX) / RX) ** 2))))
    for x, b in bot.items():
        for y in range(64, b + 1):
            u, t = (x + 0.5 - CX) / RX, (y - 63.5) / max(1.0, b - 63.5)
            v = 0.6 + 0.26 * u - 0.5 * t ** 1.2 + (blotch(x, y, 9, 901) - 0.5) * 0.1 + (noise(x, y, 902) - 0.5) * 0.04
            if 0.08 < t < 0.3 and u > 0.1:
                v += 0.12 * min(1.0, (u - 0.1) * 3)  # the hull's sheen, toward the sun
            if int((x - CX) / 12.0 + 20) % 2:
                v -= 0.05  # every other panel a shade darker
            cv.set(x, y, tone(x, y, SAUCER, v))
    for sx in range(-84, 85, 12):  # panel seams: meridians that close in toward the bottom
        for y in range(64, 86):
            for x in range(8, 189):
                if y <= bot[x]:
                    half = RX * math.sqrt(max(0.0, 1 - ((y - 63.5) / (RY + 0.5)) ** 2))
                    if int(CX + sx * half / RX) == x:
                        cv.set(x, y, IRON[0])
    for x in range(10, 188):  # a seam ring half way down, rivets under the rim
        y = 63 + max(1, int(RY * 0.45 * math.sqrt(max(0.0, 1 - ((x + 0.5 - CX) / RX) ** 2)))) + 1
        if cv.at(x, y) >= 0:
            cv.set(x, y, IRON[0])
        if x % 4 == 0:
            cv.set(x, 65, BRASS[1])
    thrusters = (48, 98, 148)
    for tx in thrusters:  # a strut down from the hull, then a bell with a brass collar and a cyan throat
        for y in range(bot[tx] - 1, 85):
            cv.set(tx - 2, y, IRON[1])
            cv.set(tx - 1, y, IRON[2])
            cv.set(tx, y, IRON[2])
            cv.set(tx + 1, y, IRON[3])
        rows = [(3, BRASS[2]), (3, None), (4, None), (4, None), (5, None), (5, None), (5, None), (5, None)]
        for j, (half, col) in enumerate(rows):
            y = 85 + j
            for x in range(tx - half, tx + half):
                u = (x + 0.5 - tx) / float(half)
                c = col or tone(x, y, [IRON[1], IRON[2], IRON[3], PLATE[3]], 0.45 + 0.4 * u)
                if j >= 6 and abs(x + 0.5 - tx) < half - 1:
                    c = ENERGY[2] if j == 7 and x in (tx - 1, tx) else ENERGY[1]
                cv.set(x, y, c)
        cv.set(tx + 2, 85, BRASS[3])
    # the rim band: a brass lip, plate panels, the right third catching the sun
    for x in range(1, 195):
        end = x in (1, 194)
        for y in range(56, 64):
            if end and y in (56, 63):
                continue
            c = PLATE[1]
            if y == 56:
                c = BRASS[2] if x < 130 else BRASS[3]
            elif y == 57:
                c = PLATE[3] if x >= 130 else PLATE[2]
            elif y == 63:
                c = IRON[0]
            elif y == 62:
                c = IRON[2]
            cv.set(x, y, c)
    pads = [10 + 16 * i for i in range(12)]
    for x in range(4, 194, 16):  # panel seams and rivets between the pad lights
        cv.vline(x, 58, 4, IRON[2])
        cv.vline(x + 1, 58, 4, PLATE[2])
    for p in pads:  # pad lights, off: a dark lens in a brass bezel (the runtime lights them)
        cv.hline(p - 1, 59, 4, BRASS[1])
        cv.rect(p, 60, 2, 2, IRON[0])
    cv.paste(crop, *CROP_AT["customers"], box=(1, 1, 194, 55))
    lights = [{"at": [p, 60], "kind": "pad"} for p in pads] + [{"at": [tx, 90], "kind": "thruster"} for tx in thrusters]
    return cv, {"lights": lights}


MAST_X = 38  # Marketing's mast: its centre column
BOULDER_TOP, BOULDER_BOT = 104, 144  # Marketing's boulder: one round stone, rows 104-144
PLATE_X0, PLATE_X1, PLATE_Y = 18, 57, BOULDER_TOP  # the 40 x 3 iron foot plate, set into the boulder's crown
MAST_TOP, MAST_FOOT = 15, PLATE_Y - 1  # the lattice under the ball, down to the ring on the foot plate
GUY_AT = 56  # the row where the guy wires leave the mast, at a brass collar
# The boulder's half width per row (content, about x 37.5): a flat crown for the plate, shoulders that round out fast,
# straight sides bulging to its widest at row 122, then a U: rounded under and flat at the bottom, no point anywhere.
BOULDER_HALF = {104: 22.5, 105: 26.5, 106: 29.5, 107: 31.5, 108: 33.0, 109: 34.2, 110: 35.0, 111: 35.3, 112: 35.6,
                113: 35.9, 114: 36.1, 115: 36.3, 116: 36.5, 117: 36.6, 118: 36.7, 119: 36.8, 120: 36.9, 121: 37.0,
                122: 37.0, 123: 36.9, 124: 36.7, 125: 36.4, 126: 36.1, 127: 35.8, 128: 35.5, 129: 35.2, 130: 35.0,
                131: 34.8, 132: 34.5, 133: 34.0, 134: 33.5, 135: 33.0, 136: 32.0, 137: 31.0, 138: 30.0, 139: 28.5,
                140: 27.0, 141: 25.0, 142: 23.0, 143: 20.0, 144: 16.0}
PEBBLES = ((9, 146), (60, 147))  # two loose 3 x 2 stones under the boulder's flanks, 2 px of air or more all round
MKT_SIGNALS = (24, 33, 41, 50)  # four signal lamps along the foot plate (2 x 2 each, from these columns)


def mast_half(y):
    """Half the A-frame's width at row y: 1 at the top (3 wide), 4 at the foot (9 wide)."""
    return 1 + round(3 * max(0, min(1, (y - MAST_TOP) / float(MAST_FOOT - MAST_TOP))))


GUY_TOPS = ((MAST_X - mast_half(GUY_AT) - 1, GUY_AT), (MAST_X + mast_half(GUY_AT) + 1, GUY_AT), (MAST_X + mast_half(GUY_AT) + 1, GUY_AT))
GUY_FEET = ((PLATE_X0, PLATE_Y - 1), (PLATE_X1, PLATE_Y - 1), (48, PLATE_Y - 3))  # the plate's two ends and its centre back


def boulder_px():
    """Marketing's boulder: every (x, y) inside BOULDER_HALF."""
    return {(x, y) for y, half in BOULDER_HALF.items() for x in range(1, 75) if abs(x + 0.5 - 37.5) <= half}


def poly_px(points):
    """The px whose centres fall inside a closed polygon [(x, y), ...] (even-odd), as a set of (x, y)."""
    xs, ys = [p[0] for p in points], [p[1] for p in points]
    out = set()
    for y in range(int(min(ys)), int(max(ys)) + 1):
        cy = y + 0.5
        cross = []
        for (ax, ay), (bx, by) in zip(points, points[1:] + points[:1]):
            if (ay <= cy < by) or (by <= cy < ay):
                cross.append(ax + (cy - ay) * (bx - ax) / float(by - ay))
        cross.sort()
        for a, b in zip(cross[0::2], cross[1::2]):
            for x in range(int(math.floor(min(xs))), int(math.ceil(max(xs))) + 1):
                if a <= x + 0.5 < b:
                    out.add((x, y))
    return out


def wires(cv, rim_of, segments):
    """Wires, after the outline: 1 px of soot each, part of the outline, over the sky only (a cable as thin as an
    outline; drawn as content it would come out three px wide with its own outline round it): Marketing's guy wires.
    Structural members (Traffic's braces) are drawn as iron content instead, outline and all."""
    for (ax, ay), (bx, by) in segments:
        line = Canvas(cv.w, cv.h)
        line.line(ax, ay, bx, by, SOOT)
        for i, c in enumerate(line.pix):
            if c >= 0 and cv.pix[i] < 0:
                cv.pix[i] = SOOT
                rim_of.add(i)


def form_marketing(crop):
    """The beacon rock: one round boulder (a U underneath, never a point), the painting's mast ring on a 40 x 3 iron foot
    plate set into its crown, an A-frame lattice mast (9 wide at the foot, 3 at the top) with a brass ball, three guy wires
    to brass lugs, and two loose pebbles under it. The plate carries four signal lamps and the lugs and the guy collar a
    pip each, dark until the island lights (the runtime lights them)."""
    W, H = SIZE["marketing"]
    cv = Canvas(W, H)
    big, facet = Stones(BIG, 1100), Stones(FACET, 1200)
    rock = boulder_px()
    cx, cy, rx, ry = 37.5, 123.0, 37.0, 21.0

    def light(x, y):  # the whole stone as one round form, lit on its upper right; its shade side stays stone, not a hole
        nx, ny = (x + 0.5 - cx) / rx, (y + 0.5 - cy) / ry
        f = nx * 0.62 - ny * 0.78
        return 0.12 + (0.5 * f if f > 0 else 0.22 * f)

    fill_rock(cv, sorted(rock), big, facet, light, lambda x, y: max(0.0, (y - BOULDER_TOP) / float(BOULDER_BOT - BOULDER_TOP)), 1100)
    for x, y in PEBBLES:  # lit along the top and on the right, dark underneath
        for dx, dy, col in ((0, 0, IRON[2]), (1, 0, PLATE[1]), (2, 0, PLATE[2]), (0, 1, IRON[0]), (1, 1, IRON[1]), (2, 1, IRON[2])):
            cv.set(x + dx, y + dy, col)
    # the foot plate, set into the crown: an iron[3] top lit toward the sun, rivets, a dark lower edge; four signal lamps
    # (a dark lens under a brass hood) and the wires' brass lugs at its two ends
    for x in range(PLATE_X0, PLATE_X1 + 1):
        cv.set(x, PLATE_Y, IRON[3] if x > 30 else IRON[2])
        cv.set(x, PLATE_Y + 1, IRON[2])
        cv.set(x, PLATE_Y + 2, IRON[0])
    for x in range(PLATE_X0 + 4, PLATE_X1 - 2, 6):
        if all(not s - 1 <= x <= s + 2 for s in MKT_SIGNALS):
            cv.set(x, PLATE_Y + 1, BRASS[2])
    for s in MKT_SIGNALS:
        cv.hline(s - 1, PLATE_Y, 4, BRASS[1])
        cv.rect(s, PLATE_Y + 1, 2, 2, IRON[0])
    lugs = [(PLATE_X0, PLATE_Y), (PLATE_X1 - 1, PLATE_Y)]
    for x, y in lugs:
        cv.rect(x, y, 2, 2, BRASS[2])
        cv.set(x + 1, y, BRASS[3])
    # the A-frame lattice mast: shade leg iron[1], sun leg iron[3], dark between, X braces every 6 rows
    for y in range(MAST_TOP, MAST_FOOT + 1):
        h = mast_half(y)
        l, r = MAST_X - h, MAST_X + h
        for x in range(l + 1, r):
            cv.set(x, y, SOOT)
        cv.set(l, y, IRON[1])
        cv.set(r, y, IRON[3])
    for y0 in range(MAST_TOP, MAST_FOOT, 6):
        y1 = min(MAST_FOOT, y0 + 6)
        a0, a1 = mast_half(y0) - 1, mast_half(y1) - 1
        brace = Canvas(W, H)
        brace.line(MAST_X - a0, y0, MAST_X + a1, y1, IRON[2])
        brace.line(MAST_X + a0, y0, MAST_X - a1, y1, IRON[2])
        for i, c in enumerate(brace.pix):
            if c >= 0:
                x = i % W
                cv.pix[i] = IRON[3] if x > MAST_X else IRON[2]
    for y in range(MAST_TOP + 9, MAST_FOOT - 4, 16):  # brass collars (the one at GUY_AT holds the wires)
        h = mast_half(y)
        cv.hline(MAST_X - h, y, 2 * h + 1, BRASS[2])
        cv.set(MAST_X + h, y, BRASS[3])
        cv.hline(MAST_X - h, y + 1, 2 * h + 1, BRASS[1])
    # the ball on the tip (the runtime draws its glow) and a short spike above it
    cv.vline(MAST_X, 7, 3, BRASS[2])
    for j, row in enumerate((".bcc.", "bcced", "abccc", "abbc.", ".aab.")):
        for i, ch in enumerate(row):
            if ch != ".":
                cv.set(MAST_X - 2 + i, 10 + j, {"a": BRASS[2], "b": BRASS[3], "c": BRASS[4], "d": BRASS[4], "e": BRASS[5]}[ch])
    # the painting's ring round the mast's foot (only that: the painting's flat deck goes), standing on the foot plate
    keep = Canvas(crop.w, crop.h)
    for j in range(crop.h):
        for i in range(crop.w):
            ring = ((i + 0.5 - 33.0) / 19.5) ** 2 + ((j + 0.5 - 13.5) / 4.6) ** 2 <= 1.0
            if ring and crop.pix[j * crop.w + i] >= 0:
                keep.pix[j * crop.w + i] = crop.pix[j * crop.w + i]
    cv.paste(keep, *CROP_AT["marketing"], box=(1, 1, 74, PLATE_Y - 1))
    back = (GUY_FEET[2][0], GUY_FEET[2][1] + 1)  # the back wire's lug, on the ring
    cv.rect(back[0], back[1], 2, 2, BRASS[2])
    cv.set(back[0] + 1, back[1], BRASS[3])
    collar = (MAST_X + mast_half(GUY_AT) - 1, GUY_AT)
    lights = [{"at": [s, PLATE_Y + 1], "kind": "signal"} for s in MKT_SIGNALS]
    lights += [{"at": list(p), "kind": "window"} for p in lugs + [back, collar]]
    return cv, {"lights": lights, "wires": list(zip(GUY_TOPS, GUY_FEET))}


FORMS = {"errors": form_errors, "traffic": form_traffic, "inbox": form_inbox, "customers": form_customers, "marketing": form_marketing}

# ---------------------------------------------------------------------------------------------------------------
# 5-9. One island, start to finish
# ---------------------------------------------------------------------------------------------------------------


class Island:
    def __init__(self, name, lit, dark, entry):
        self.name, self.lit, self.dark, self.entry = name, lit, dark, entry


def _glass(cv, x, y, r=2):
    """The brightest (CIELAB L) opaque px within r of x, y, the nearest one on ties: the lit glass of a lamp."""
    best = None
    for dy in range(-r, r + 1):
        for dx in range(-r, r + 1):
            i = cv.at(x + dx, y + dy)
            if i >= 0 and i != SOOT and (best is None or (-LABS[i][0], dx * dx + dy * dy) < best[0]):
                best = ((-LABS[i][0], dx * dx + dy * dy), (x + dx, y + dy))
    if best is None:
        raise SystemExit(f"no opaque pixel near {x},{y}")
    return list(best[1])


def make_island(name, keyed):
    """Keyed painting -> Island (lit and dark canvases plus the manifest entry, without file names and audits)."""
    crop = crop_snap(keyed, CROP[name], CROP_COLORS_FOR.get(name))
    cv, extra = FORMS[name](crop)
    w, h = SIZE[name]
    if (cv.w, cv.h) != (w, h):
        raise SystemExit(f"{name}: the form drew {cv.w}x{cv.h}, not {w}x{h}")
    for x in range(w):
        for y in (0, h - 1):
            if cv.opaque(x, y):
                raise SystemExit(f"{name}: content at {x},{y} leaves no room for the outline")
    for y in range(h):
        for x in (0, w - 1):
            if cv.opaque(x, y):
                raise SystemExit(f"{name}: content at {x},{y} leaves no room for the outline")
    cv.pix = [WARM.get(c, c) for c in cv.pix]
    design = DESIGN[name]
    lamp = None
    if name in LAMP:
        lamp = _glass(cv, *to_sprite(name, LAMP[name]))
    elif extra.get("lamp"):
        lamp = list(extra["lamp"])
    pad = list(to_sprite(name, PAD)) if design["pad"] else None
    beacon = list(design["beacon"]) if design["beacon"] else None
    rim_of = outline(cv)
    wires(cv, rim_of, extra.get("wires", ()))
    cv = Canvas(w, cv.lowest() + 1, cv.pix[: (cv.lowest() + 1) * w])  # no empty rows under the island
    points = [p for p in (lamp, pad, beacon) if p]
    cap_brightness(cv, points + [tuple(p) for p in extra.get("bright", ())])  # a form's own highlights keep their white
    near, members = near_any(points), set(extra.get("norim", ()))

    def keep(x, y):  # no sun rim near a light, nor on a thin iron member (a brace would turn all rim)
        return near(x, y) or (x, y) in members

    norim = cv.copy()
    for i in rim_px(cv, rim_of, keep):
        cv.pix[i] = PLATE[3]
    dark = make_dark(norim, rim_of, name, keep)
    label = [design["label"][0], cv.lowest() + 4]
    entry = {
        "form": FORM[name],
        "anchors": {k: list(v) for k, v in design["anchors"].items()},
        "lamp": lamp, "label": label, "pad": pad, "beacon": beacon,
        "lights": extra["lights"],
        "opaque": cv.count(),
    }
    return Island(name, cv, dark, entry)


def to_image(s):
    im = Image.new("RGBA", (s.w, s.h), (0, 0, 0, 0))
    im.putdata([RGBS[i] + (255,) if i >= 0 else (0, 0, 0, 0) for i in s.pix])
    return im


def save_webp(s, path):
    to_image(s).save(path, "WEBP", lossless=True, quality=100, method=6)
    return os.path.getsize(path)


def used_hexes(s):
    return sorted({HEXES[i] for i in s.pix if i >= 0})


def dump_json(o, ind=0):
    """json.dumps with short arrays on one line and long ones wrapped, so the manifest diffs well."""
    pad = "  " * ind
    if isinstance(o, dict):
        if not o:
            return "{}"
        flat = "{" + ", ".join(f"{json.dumps(k)}: {dump_json(v)}" for k, v in o.items()) + "}"
        if ind and len(flat) + len(pad) <= 60 and "\n" not in flat:
            return flat
        body = ",\n".join(f"{pad}  {json.dumps(k)}: {dump_json(v, ind + 1)}" for k, v in o.items())
        return "{\n" + body + "\n" + pad + "}"
    if isinstance(o, list):
        flat = "[" + ", ".join(dump_json(x) for x in o) + "]"
        if len(flat) + len(pad) <= 100:
            return flat
        if any(isinstance(x, dict) for x in o):
            return "[\n" + ",\n".join(f"{pad}  {dump_json(x, ind + 1)}" for x in o) + "\n" + pad + "]"
        rows = [", ".join(json.dumps(x) for x in o[i:i + 8]) for i in range(0, len(o), 8)]
        return "[\n" + ",\n".join(f"{pad}  {r}" for r in rows) + "\n" + pad + "]"
    return json.dumps(o)


def build(refs, out, key_mode, tol, say=print):
    for name in ISLANDS:  # check them all before writing anything
        if not os.path.isfile(os.path.join(refs, name + ".png")):
            raise SystemExit(f"missing painting: {os.path.join(refs, name + '.png')}")
    os.makedirs(out, exist_ok=True)
    made, islands = {}, {}
    for name in ISLANDS:
        keyed, how = key_painting(Image.open(os.path.join(refs, name + ".png")), key_mode, tol)
        isl = make_island(name, keyed)
        lit_bytes = save_webp(isl.lit, os.path.join(out, f"{name}-lit.webp"))
        dark_bytes = save_webp(isl.dark, os.path.join(out, f"{name}-dark.webp"))
        e = isl.entry
        entry = {"lit": f"{name}-lit.webp", "dark": f"{name}-dark.webp", "w": isl.lit.w, "h": isl.lit.h, "form": e["form"],
                 "anchors": e["anchors"], "lamp": e["lamp"], "label": e["label"], "pad": e["pad"], "beacon": e["beacon"],
                 "lights": e["lights"], "opaque": e["opaque"],
                 "colors": {"lit": used_hexes(isl.lit), "dark": used_hexes(isl.dark)}, "bytes": {"lit": lit_bytes, "dark": dark_bytes}}
        islands[name] = entry
        made[name] = isl
        say(f"{name:10s} keyed by {how:5s}  {e['form']:12s} {isl.lit.w}x{isl.lit.h}  opaque {e['opaque']:5d}  "
            f"lit {lit_bytes:6d} B / {len(entry['colors']['lit'])} colors   dark {dark_bytes:6d} B / {len(entry['colors']['dark'])} colors")
    manifest = {"version": 1, "unit": "city-px", "islands": islands}
    with open(os.path.join(out, "manifest.json"), "w") as f:
        f.write(dump_json(manifest) + "\n")
    return manifest, made


# ---------------------------------------------------------------------------------------------------------------
# Contact sheets
# ---------------------------------------------------------------------------------------------------------------


def dimmed_sky():
    """sky.webp the way engine/dim.ts dims it (nearest palette color, then one step darker on its ramp; two on the sun
    ramp), so the sheet shows the sprites on the backdrop the city draws. None if the sky isn't there."""
    if not os.path.isfile(SKY):
        return None
    palette_im = Image.new("P", (1, 1))
    flat = []
    for rgb in RGBS:
        flat += list(rgb)
    palette_im.putpalette(flat + [0] * (768 - len(flat)))
    q = Image.open(SKY).convert("RGB").quantize(palette=palette_im, dither=0)
    dim_to = []
    for ramp_name, rmp in PALETTE.items():
        for n in range(len(rmp)):
            dim_to.append(rmp[max(0, n - 1 - (1 if ramp_name == "sun" else 0))])
    table = []
    for h in dim_to:
        table += [int(h[1:3], 16), int(h[3:5], 16), int(h[5:7], 16)]
    q.putpalette(table + [0] * (768 - len(table)))
    return q.convert("RGB")


def _font(size):
    try:
        return ImageFont.load_default(size=size)
    except TypeError:  # old Pillow: bitmap font only
        return ImageFont.load_default()


def contact_sheet(made, manifest, path, marks=False):
    """Every lit sprite over every dark one, 1x, on the dimmed sky. marks=True: 2x, with the manifest's points drawn on
    the lit row (e red, w green, n blue, s yellow, lamp white, pad cyan, beacon magenta, label orange, lights violet)."""
    scale = 2 if marks else 1
    gap, top = 16, 22
    hmax = max(made[n].lit.h for n in ISLANDS)
    font = _font(11 * scale)

    def caption(name, kind):
        s_ = made[name].lit
        return f"{name} {kind} {s_.w}x{s_.h}"

    col = {n: max(made[n].lit.w, max(int(font.getlength(caption(n, k))) // scale + 2 for k in ("lit", "dark"))) for n in ISLANDS}
    W = gap + sum(col.values()) + gap * len(ISLANDS)
    row_h = top + hmax + gap
    H = gap // 2 + 2 * row_h
    base = Image.new("RGBA", (W, H), RGBS[pal("sun", 1)] + (255,))
    sky = dimmed_sky()
    if sky is not None:
        x0, y0 = max(0, (sky.width - W) // 2), max(0, (sky.height - H) // 2)
        base.paste(sky.crop((x0, y0, x0 + min(W, sky.width), y0 + min(H, sky.height))), (0, 0))
    sheet = base if scale == 1 else base.resize((W * scale, H * scale), Image.NEAREST)
    d = ImageDraw.Draw(sheet)
    colors = {"e": (255, 60, 60), "w": (60, 255, 60), "n": (80, 140, 255), "s": (255, 255, 60), "lamp": (255, 255, 255),
              "pad": (60, 255, 255), "beacon": (255, 60, 255), "label": (255, 150, 0), "light": (190, 120, 255)}
    for row, kind in enumerate(("lit", "dark")):
        x, y = gap, gap // 2 + row * row_h
        for name in ISLANDS:
            s = made[name].lit if kind == "lit" else made[name].dark
            im = to_image(s)
            if scale != 1:
                im = im.resize((s.w * scale, s.h * scale), Image.NEAREST)
            d.text((x * scale, y * scale), caption(name, kind), fill=(253, 250, 236, 255), font=font)
            sheet.alpha_composite(im, (x * scale, (y + top) * scale))
            if marks and kind == "lit":
                e = manifest["islands"][name]
                tags = list(e["anchors"].items()) + [(t, e[t]) for t in ("lamp", "pad", "beacon", "label") if e[t]]
                tags += [("light", li["at"]) for li in e["lights"]]
                for tag, (px_, py_) in tags:
                    cx, cy = (x + px_) * scale + scale // 2, (y + top + py_) * scale + scale // 2
                    r = 3 if tag == "light" else 6
                    d.line([(cx - r, cy), (cx + r, cy)], fill=colors[tag] + (255,), width=1)
                    d.line([(cx, cy - r), (cx, cy + r)], fill=colors[tag] + (255,), width=1)
                    if tag != "light":
                        d.text((cx + 7, cy - 7), tag, fill=colors[tag] + (255,), font=_font(10))
            x += col[name] + gap
    sheet.convert("RGB").save(path)


# ---------------------------------------------------------------------------------------------------------------
# --check
# ---------------------------------------------------------------------------------------------------------------


def contract_palette():
    """The hex list inside PALETTE in contract.ts, in order, or None if the file isn't there."""
    if not os.path.isfile(CONTRACT):
        return None
    text = open(CONTRACT).read()
    m = re.search(r"export const PALETTE = \{(.*?)\} as const;", text, re.S)
    return re.findall(r'"(#[0-9a-fA-F]{6})"', m.group(1)) if m else None


def _load_indices(path, label, bad):
    """webp -> ((w, h), palette index per pixel; -1 transparent, -2 off palette or partly transparent)."""
    lookup = {c: i for i, c in enumerate(RGBS)}
    im = Image.open(path).convert("RGBA")
    raw = im.tobytes()  # R, G, B, A per pixel (Image.getdata is deprecated in newer Pillow)
    pix, reported = [], False
    for k in range(0, len(raw), 4):
        r, g, b, a = raw[k], raw[k + 1], raw[k + 2], raw[k + 3]
        if a == 0:
            pix.append(-1)
        elif a == 255 and (r, g, b) in lookup:
            pix.append(lookup[(r, g, b)])
        else:
            pix.append(-2)
            if not reported:
                bad(f"{label}: pixel {(r, g, b, a)} is off palette or partly transparent")
                reported = True
    return im.size, pix


def _xy(v):
    return isinstance(v, list) and len(v) == 2 and all(isinstance(n, int) for n in v)


def _check_island(name, m, out, bad):
    """Assert one manifest entry against its two webps. Returns the bytes of the two files."""
    total, loaded = 0, {}
    w, h = m["w"], m["h"]
    if w != SIZE[name][0] or abs(h - SIZE[name][1]) > 3:
        bad(f"{name}: {w}x{h} is not {SIZE[name][0]}x{SIZE[name][1]} (w exact, h +-3)")
    lo, hi = HEIGHT_CLASS[name]
    if not lo <= h <= hi:
        bad(f"{name}: h {h} is outside its height class {lo}-{hi}")
    if w > MAX_W:
        bad(f"{name}: {w} px wide is over {MAX_W}")
    if m.get("form") != FORM[name]:
        bad(f"{name}: form {m.get('form')!r} is not {FORM[name]!r}")
    for kind in ("lit", "dark"):
        fn = m[kind]
        path = os.path.join(out, fn)
        if not os.path.isfile(path):
            bad(f"{fn}: missing")
            continue
        data = open(path, "rb").read()
        total += len(data)
        if len(data) >= MAX_BYTES:
            bad(f"{fn}: {len(data)} B is over {MAX_BYTES // 1024} KB")
        if data[:4] != b"RIFF" or data[8:12] != b"WEBP" or data[12:16] != b"VP8L" or data[20:21] != b"\x2f":
            bad(f"{fn}: not a lossless (VP8L) webp")
        else:
            bits = int.from_bytes(data[21:25], "little")
            if ((bits & 0x3FFF) + 1, ((bits >> 14) & 0x3FFF) + 1) != (w, h):
                bad(f"{fn}: VP8L header size is not {w}x{h}")
        if m["bytes"][kind] != len(data):
            bad(f"{fn}: manifest says {m['bytes'][kind]} B, file is {len(data)} B")
        size, pix = _load_indices(path, fn, bad)
        if size != (w, h):
            bad(f"{fn}: {size[0]}x{size[1]} is not {w}x{h}")
            continue
        if sorted({HEXES[i] for i in pix if i >= 0}) != m["colors"][kind]:
            bad(f"{fn}: audited colors differ from the pixels")
        loaded[kind] = pix
    if len(loaded) < 2:
        return total
    lit, dark = loaded["lit"], loaded["dark"]
    if [i < 0 for i in lit] != [i < 0 for i in dark]:
        bad(f"{name}: dark silhouette differs from lit")
    allowed = DARK_ERRORS if name == "errors" else DARK_COLORS
    if not {i for i in dark if i >= 0} <= allowed:
        bad(f"{name}: dark uses colors beyond soot / iron[0..2] / copper[0]" + (" / jam[0] / jam[1]" if name == "errors" else ""))
    if any(d == SOOT and l != SOOT for l, d in zip(lit, dark)):
        bad(f"{name}: dark soot where the lit sprite is not soot (soot is the outline only)")
    dark_n = sum(1 for i in dark if i >= 0)
    soot_n = sum(1 for i in dark if i == SOOT)
    mid_n = sum(1 for i in dark if i in (IRON[1], IRON[2]))
    if soot_n > MAX_DARK_SOOT * dark_n:
        bad(f"{name}: dark is {soot_n / dark_n:.1%} soot, over {MAX_DARK_SOOT:.0%}")
    if mid_n < MIN_DARK_MID * dark_n:
        bad(f"{name}: dark is {mid_n / dark_n:.1%} iron[1] + iron[2], under {MIN_DARK_MID:.0%}")
    if any(LABS[i][0] > MAX_DARK_L for i in {i for i in dark if i >= 0} - set(JAM)):
        bad(f"{name}: a dark tone is brighter than L* {MAX_DARK_L}")
    jam = sum(1 for i in lit if i in JAM)
    if name != "errors" and jam:
        bad(f"{name}: lit sprite uses a jam red")
    if name == "errors":
        lava = sum(1 for i in lit if i in LAVA)
        if lava < MIN_CRACK:
            bad(f"errors: the crack is {lava} lava px (sun[5], sun[3], jam[1]), under {MIN_CRACK}")
        if not set(LAVA) <= set(lit) or {JAM[0], JAM[2]} & set(lit):
            bad("errors: the lit crack is not sun[5], sun[3] and jam[1] (and only those reds)")
        if not {JAM[0], JAM[1]} <= set(dark):
            bad("errors: the dark crack has no jam[1] core with jam[0] edges")
    bright = sum(1 for i in lit if i in BRIGHT)
    if bright > MAX_BRIGHT:
        bad(f"{name}: {bright} px of white[0] + brass[5], over {MAX_BRIGHT}")
    opaque_n = sum(1 for i in lit if i >= 0)
    if m.get("opaque") != opaque_n:
        bad(f"{name}: manifest opaque {m.get('opaque')} is not the lit sprite's {opaque_n}")
    if opaque_n > MAX_OPAQUE:
        bad(f"{name}: {opaque_n} opaque px, over {MAX_OPAQUE}")

    def opaque(x, y):
        return 0 <= x < w and 0 <= y < h and lit[y * w + x] >= 0

    # the soot outline: an opaque pixel with a see-through 4-neighbour is on the edge, and the edge is soot
    for y in range(h):
        for x in range(w):
            if opaque(x, y) and (lit[y * w + x], dark[y * w + x]) != (SOOT, SOOT) and not all(opaque(x + dx, y + dy) for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1))):
                bad(f"{name}: edge pixel {x},{y} is not soot")
                break
        else:
            continue
        break

    design = DESIGN[name]
    if (m["pad"] is None) != (design["pad"] is None) or (m["beacon"] is None) != (design["beacon"] is None):
        bad(f"{name}: pad / beacon on the wrong island")
    if (m["lamp"] is None) != (design["lamp"] is None) or sorted(m["anchors"]) != sorted(design["anchors"]):
        bad(f"{name}: lamp / anchors on the wrong island")
    pts = [(f"anchors.{k}", v, design["anchors"].get(k)) for k, v in m["anchors"].items()]
    pts += [(t, m[t], design[t]) for t in ("lamp", "pad", "beacon") if m[t] is not None and design[t] is not None]
    for tag, at, want in pts:
        if not _xy(at):
            bad(f"{name}.{tag} {at!r} is not two whole numbers")
            continue
        if not opaque(*at):
            bad(f"{name}.{tag} {at[0]},{at[1]} is not on an opaque pixel")
        if want and max(abs(at[0] - want[0]), abs(at[1] - want[1])) > 2:
            bad(f"{name}.{tag} {at[0]},{at[1]} is more than 2 px from section A's {want[0]},{want[1]}")
    lowest = max(y for y in range(h) if any(opaque(x, y) for x in range(w)))
    lx, ly = m["label"]
    if not (0 <= lx < w) or ly != lowest + 4:
        bad(f"{name}.label {lx},{ly} is not inside the width / 4 px under the lowest pixel ({lowest})")
    if max(abs(lx - design["label"][0]), abs(ly - design["label"][1])) > 2:
        bad(f"{name}.label {lx},{ly} is more than 2 px from section A's {design['label'][0]},{design['label'][1]}")
    counts = {}
    for li in m.get("lights", []):
        kind, at = li.get("kind"), li.get("at")
        counts[kind] = counts.get(kind, 0) + 1
        if kind not in LIGHT_KINDS or not _xy(at) or not (0 <= at[0] < w and 0 <= at[1] < h):
            bad(f"{name}: light {li!r} is not a known kind inside the sprite")
        elif not opaque(*at):
            bad(f"{name}: light {kind} at {at[0]},{at[1]} is not on an opaque pixel")
    if counts != LIGHT_COUNT[name]:
        bad(f"{name}: lights {counts} are not {LIGHT_COUNT[name]}")
    return total


def check(out):
    """Re-open the output and assert the lot. Returns the problems found (empty = fine)."""
    problems = []

    def bad(msg):
        problems.append(msg)

    theirs = contract_palette()
    if theirs is None:
        print("note: contract.ts not found, palette list not compared")
    elif [h.lower() for h in theirs] != HEXES:
        bad("PALETTE in this script differs from contract.ts")
    try:
        with open(os.path.join(out, "manifest.json")) as f:
            manifest = json.load(f)
        islands = manifest["islands"]
    except (OSError, ValueError, KeyError) as e:
        return problems + [f"manifest.json: {e!r}"]
    if manifest.get("version") != 1 or manifest.get("unit") != "city-px":
        bad("manifest version / unit is not 1 / city-px")
    if list(islands) != ISLANDS:
        bad("manifest islands are not the five, in reveal order")
    if len({islands.get(n, {}).get("form") for n in ISLANDS}) != len(ISLANDS):
        bad("the five islands do not have five different forms")
    total = os.path.getsize(os.path.join(out, "manifest.json"))
    for name in ISLANDS:
        try:
            total += _check_island(name, islands[name], out, bad)
        except (KeyError, TypeError, ValueError, IndexError) as e:
            bad(f"{name}: malformed manifest entry ({e!r})")
    extra = sorted(set(os.listdir(out)) - {"manifest.json"} - {f"{n}-{k}.webp" for n in ISLANDS for k in ("lit", "dark")})
    if [f for f in extra if not f.startswith(".")]:
        bad(f"the folder holds more than the manifest and the ten webps: {extra}")
    if total >= MAX_FOLDER:
        bad(f"the folder's files add up to {total} B, over 1 MB")
    return problems


# ---------------------------------------------------------------------------------------------------------------
# --self-test
# ---------------------------------------------------------------------------------------------------------------


def self_test():
    # every palette color snaps to itself; a crop never snaps to jam, ok or energy
    for i, c in enumerate(RGBS):
        assert nearest(c, ANY) == i
        if i in CROP_COLORS:
            assert nearest(c, CROP_COLORS) == i
    for i in JAM + OK + ENERGY:
        assert i not in CROP_COLORS and nearest(RGBS[i], CROP_COLORS) not in JAM + OK + ENERGY
    # the noise port matches stations/shade.ts (values printed by bun from the TS)
    for x, y, s, want in ((0, 0, 0, 0.0), (3, 5, 101, 0.6547778231684999), (-4, 9, 200, 0.789471228790812),
                          (17, -3, 113, 0.9015259279174558), (123, 456, 109, 0.2899441556748804), (-1, -1, 7, 0.47658850193875574)):
        assert abs(noise(x, y, s) - want) < 1e-12, (x, y, s, noise(x, y, s))
    assert abs(blotch(10.5, 3.25, 26, 113) - 0.1766703741761921) < 1e-12
    assert abs(blotch(40, 70, 9, 31) - 0.7238801719157828) < 1e-12
    # the dark rule: three iron tones by CIELAB L, never soot (soot L 2 and iron[0] L 6 -> iron[0], iron[1] L 11 ->
    # iron[0], iron[3] L 38 -> iron[1], plate[3] L 50 -> iron[2]); the rim light copper[0]; every dark tone but the
    # crack's reds is L* 36 or darker and no brighter than iron[3]; the crack's core goes jam[1], its edges jam[0]
    assert dark_of(IRON[0], "traffic") == IRON[0] and dark_of(IRON[1], "traffic") == IRON[0] and dark_of(IRON[3], "traffic") == IRON[1]
    assert dark_of(PLATE[3], "inbox") == IRON[2] and dark_of(BRASS[4], "marketing") == IRON[2] and dark_of(SOOT, "errors") == IRON[0]
    assert all(LABS[i][0] <= MAX_DARK_L <= LABS[IRON[3]][0] for i in DARK_COLORS) and DARK_RIM == COPPER[0]
    assert all(dark_of(i, n) != SOOT for i in ANY for n in ISLANDS)
    assert dark_of(SUN[5], "errors") == JAM[1] and dark_of(SUN[3], "errors") == JAM[0] and dark_of(JAM[1], "errors") == JAM[0]
    assert dark_of(SUN[5], "traffic") == IRON[2] and dark_of(JAM[1], "inbox") == IRON[2]
    assert all(dark_of(i, n) in DARK_COLORS for i in ANY for n in ISLANDS if not (n == "errors" and i in LAVA_DARK))
    assert not set(LAVA) & set(CROP_COLORS_FOR["errors"]) and SUN[6] not in CROP_COLORS_FOR["errors"]
    # keying a painting on white: the background goes, an enclosed near-white highlight stays
    img = Image.new("RGBA", (120, 80), (255, 255, 255, 255))
    d = ImageDraw.Draw(img)
    d.ellipse((10, 10, 109, 69), fill=(90, 60, 50, 255))
    d.rectangle((50, 30, 60, 40), fill=(253, 252, 246, 255))  # highlight inside the island
    keyed, how = key_painting(img, "auto", 24)
    assert how == "white"
    a = keyed.getchannel("A")
    assert a.getpixel((0, 0)) == 0 and a.getpixel((119, 79)) == 0 and a.getpixel((55, 35)) == 255 and a.getpixel((30, 40)) == 255
    assert key_painting(Image.new("RGBA", (10, 10), (1, 2, 3, 0)), "auto", 24)[1] == "alpha"
    # nearest neighbour at 7.5: the painting px under each cell's centre, floor(x0 + (i + 1/2) * 7.5), nothing blended
    assert cells(100, 610) == [100 + math.floor((i + 0.5) * 7.5) for i in range(68)] and len(cells(20, 1510)) == 199
    assert [len(cells(*CROP[n][0::2])) for n in ISLANDS] == [68, 199, 36, 196, 68]
    assert [len(cells(*CROP[n][1::2])) for n in ISLANDS] == [40, 63, 68, 56, 17]
    import random

    rnd = random.Random(7)
    noise_im = Image.new("RGBA", (300, 200))
    noise_im.putdata([(rnd.randrange(256), rnd.randrange(256), rnd.randrange(256), 255 if rnd.random() > 0.2 else 0) for _ in range(300 * 200)])
    c = crop_snap(noise_im, (11, 7, 290, 190))
    for j, sy in enumerate(cells(7, 190)):
        for i, sx in enumerate(cells(11, 290)):
            r, g, b, al = noise_im.getpixel((sx, sy))
            assert c.at(i, j) == (nearest((r, g, b), CROP_COLORS) if al >= 128 else -1), (i, j)
    # the outline: 4-neighbour, outside the silhouette, and it fills a 1 px hole; the diagonal corner stays clear
    block = Canvas(7, 7)
    block.rect(1, 1, 5, 5, PLATE[2])
    block.set(3, 3, -1)
    rim_of = outline(block)
    assert block.at(0, 0) == -1 and block.at(1, 0) == SOOT and block.at(0, 1) == SOOT and block.at(3, 3) == SOOT
    assert block.at(1, 1) == PLATE[2] and (3, 3) not in rim_of and 3 * 7 + 3 in rim_of
    # the sun rim and the dark rim light: the upper and right edge of the shape, never the outline itself
    edge = set(rim_px(block, rim_of, lambda x, y: False))
    assert 1 * 7 + 1 in edge and 1 * 7 + 5 in edge and 3 * 7 + 5 in edge and 5 * 7 + 1 not in edge and 0 * 7 + 1 not in edge
    assert 4 * 7 + 3 in edge and 3 * 7 + 2 in edge  # under the hole and left of it: the hole's outline counts
    dk = make_dark(block, rim_of, "traffic", lambda x, y: False)
    assert dk.at(1, 1) == DARK_RIM and dk.at(1, 5) == dark_of(PLATE[2], "traffic") and dk.at(1, 0) == SOOT
    # the brightness cap: away from the points everything bright steps down; near them at most 16 px stay
    cv = Canvas(40, 10)
    cv.rect(0, 0, 40, 10, WHITE)
    cap_brightness(cv, [(5, 5)])
    assert cv.count(BRIGHT) <= MAX_BRIGHT and cv.at(5, 5) == WHITE and cv.at(30, 5) == HAZE[3]
    cv = Canvas(20, 20)
    cv.rect(0, 0, 20, 20, BRASS[5])
    cap_brightness(cv, [(3, 3), (15, 15)])
    assert cv.count(BRIGHT) == MAX_BRIGHT and cv.at(0, 19) == BRASS[4]
    # Marketing's guy wires: 1 px of soot each, part of the outline (no sun rim, no outline of their own), sky only
    cv = Canvas(*SIZE["marketing"])
    cv.rect(36, 40, 5, 70, IRON[1])
    rim_of = outline(cv)
    before = len(rim_of)
    wires(cv, rim_of, list(zip(GUY_TOPS, GUY_FEET)))
    assert len(rim_of) > before and all(cv.pix[i] == SOOT for i in rim_of)
    assert cv.at(*GUY_FEET[0]) == SOOT and cv.at(38, 60) == IRON[1]  # a foot on the sky; the mast it crosses is untouched
    # Errors' basalt columns: 4 to 6 px wide, edge to edge, each tip on its row, every neighbour 3 to 8 px higher or lower
    cols = basalt_columns(1, 154, ERR_TIPS, 351)
    assert cols[0][0] == 1 and cols[-1][1] == 154 and all(COL_MIN <= b - a + 1 <= COL_MAX for a, b, _ in cols)
    assert {b - a + 1 for a, b, _ in cols} >= {3, 4, 5, 6}  # every width shows up
    joints = column_joints(cols, 358)
    assert all(1 <= len(j) <= 2 for j, (a, b, bot) in zip(joints, cols) if bot - (b - a) - ERR_RIM >= 14)
    assert all(abs(p - q) >= 3 for j0, j1 in zip(joints, joints[1:]) for p in j0 for q in j1)  # staggered
    assert all(c1[0] == c0[1] + 1 for c0, c1 in zip(cols, cols[1:]))
    assert all(STEP_MIN <= abs(c1[2] - c0[2]) <= STEP_MAX for c0, c1 in zip(cols, cols[1:])), [c[2] for c in cols]
    assert all(any(a <= t <= b and bot == r for a, b, bot in cols) for t, r in ERR_TIPS.items())
    tip_cols = [k for k, (a, b, _) in enumerate(cols) if any(a <= t <= b for t in ERR_TIPS)]
    assert all(cols[k][2] > cols[k - 1][2] and cols[k][2] > cols[k + 1][2] for k in tip_cols)  # each tip hangs lowest
    steps = fit_steps(20, [3, 7, 7])
    assert sum(steps) == 20 and all(STEP_MIN <= s <= STEP_MAX for s in steps)
    # Marketing's boulder: a U, never a V. Content widths (the outline adds 2): 70 or more over rows 110-130, widest at
    # 122 (74), 42 or more at 140, a flat last row 26-34 wide, and only narrowing below row 122; its plate in the crown
    rows = {}
    for x, y in boulder_px():
        rows.setdefault(y, []).append(x)
    wide = {y: max(xs) - min(xs) + 1 for y, xs in rows.items()}
    assert min(rows) == BOULDER_TOP and max(rows) == BOULDER_BOT and all(len(xs) == wide[y] for y, xs in rows.items())
    assert all(wide[y] >= 70 for y in range(110, 131)) and wide[122] == max(wide.values()) == 74 and wide[140] >= 42
    assert 26 <= wide[BOULDER_BOT] <= 34 and all(wide[y + 1] <= wide[y] for y in range(122, BOULDER_BOT))
    assert min(rows[PLATE_Y]) < PLATE_X0 and max(rows[PLATE_Y]) > PLATE_X1 and PLATE_X1 - PLATE_X0 + 1 == 40
    def with_outline(pts):
        pts = set(pts)
        return pts | {(x + dx, y + dy) for x, y in pts for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1))}

    rock = with_outline(boulder_px())
    for px_, py_ in PEBBLES:  # each pebble, outline and all, has 2 px of air or more all round from the boulder's outline
        pebble = with_outline((px_ + dx, py_ + dy) for dx in range(3) for dy in range(2))
        assert min(max(abs(a - x), abs(b - y)) for a, b in pebble for x, y in rock) >= 3, (px_, py_)
    # Inbox's plinth reaches 8 px below the deck of a span landing on its face (belt row 72, truss down to 83)
    assert INBOX_BASE == DESIGN["inbox"]["anchors"]["e"][1] + 11 + 8 and DESIGN["inbox"]["anchors"]["n"] == (54, 69)
    # a polygon fills the px whose centres are inside it
    assert poly_px([(0, 0), (4, 0), (4, 3), (0, 3)]) == {(x, y) for x in range(4) for y in range(3)}
    # every form draws its size on an empty crop, leaves the outline's row and column free, and its points are opaque
    for name in ISLANDS:
        x0, y0, x1, y1 = CROP[name]
        empty = Canvas(len(cells(x0, x1)), len(cells(y0, y1)))
        cv, extra = FORMS[name](empty)
        assert (cv.w, cv.h) == SIZE[name], name
        assert not any(cv.opaque(x, y) for x in range(cv.w) for y in (0, cv.h - 1)), name
        assert not any(cv.opaque(x, y) for y in range(cv.h) for x in (0, cv.w - 1)), name
        outline(cv)
        lo, hi = HEIGHT_CLASS[name]
        assert lo <= cv.lowest() + 1 <= hi and abs(cv.lowest() + 1 - SIZE[name][1]) <= 3, (name, cv.lowest())
        for k, (x, y) in DESIGN[name]["anchors"].items():
            if (name, k) not in (("traffic", "n"), ("customers", "n")):  # those two stand on the painting's deck
                assert cv.opaque(x, y), (name, k)
        kinds = {}
        for li in extra["lights"]:
            kinds[li["kind"]] = kinds.get(li["kind"], 0) + 1
            assert cv.opaque(*li["at"]), (name, li)
        assert kinds == LIGHT_COUNT[name], (name, kinds)
    print("self-test ok")


# ---------------------------------------------------------------------------------------------------------------


def main():
    ap = argparse.ArgumentParser(description="Island paintings -> the city reveal's palette-only webps and manifest.")
    ap.add_argument("--refs", default=os.environ.get("CITY_REFS"), help="folder with the five paintings (or env CITY_REFS)")
    ap.add_argument("--out", default=DEFAULT_OUT, help="where the webps and manifest.json go (default: web/public/deck/art/city)")
    ap.add_argument("--sheet", help="also write a contact sheet here (keep it out of the repo), plus <name>-points.png")
    ap.add_argument("--key", choices=("auto", "alpha", "white"), default="auto", help="how to cut the island out (default: by alpha, "
                    "or from the white background when the painting has no transparency)")
    ap.add_argument("--white-tol", type=int, default=24, help="white keying: per-channel tolerance from the background (default 24)")
    ap.add_argument("--check", action="store_true", help="re-open the output and assert it; with no --refs, only check")
    ap.add_argument("--self-test", action="store_true", help="run the built-in tests on synthetic images and exit")
    args = ap.parse_args()
    if args.self_test:
        self_test()
        return 0
    theirs = contract_palette()
    if theirs is not None and [h.lower() for h in theirs] != HEXES:
        sys.exit("PALETTE in city-art.py differs from contract.ts; update the list at the top of this script")
    if args.refs:
        manifest, made = build(args.refs, args.out, args.key, args.white_tol)
        if args.sheet:
            contact_sheet(made, manifest, args.sheet)
            points = re.sub(r"(\.png)?$", "-points.png", args.sheet, count=1)
            contact_sheet(made, manifest, points, marks=True)
            print(f"sheets: {args.sheet}, {points}")
    elif not args.check:
        ap.error("--refs (or CITY_REFS) is required")
    if args.check:
        problems = check(args.out)
        for p in problems:
            print("FAIL", p)
        print("check ok" if not problems else f"{len(problems)} problem(s)")
        return 1 if problems else 0
    return 0


if __name__ == "__main__":
    sys.exit(main())
