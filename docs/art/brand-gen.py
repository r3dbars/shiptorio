#!/usr/bin/env python3
"""Shiptorio brand generator: pixel wordmark + mark as crisp SVG rects."""
import sys, math, os

OUT = sys.argv[1] if len(sys.argv) > 1 else "."
F = 4  # fine pixels per coarse cell

LET = {
 "S": [".######", "#######", "##.....", "######.", ".######", ".....##", "#######", "######."],
 "H": ["##...##", "##...##", "##...##", "#######", "#######", "##...##", "##...##", "##...##"],
 "P": ["######.", "#######", "##...##", "#######", "######.", "##.....", "##.....", "##....."],
 "T": ["########", "########", "...##...", "...##...", "...##...", "...##...", "...##...", "...##..."],
 "R": ["######.", "#######", "##...##", "#######", "######.", "##.###.", "##..###", "##...##"],
 "O": [".######.", "########", "##....##", "##....##", "##....##", "##....##", "########", ".######."],
 "I": ["######", "######", "..##..", "..##..", "..##..", "..##..", "######", "######"],
}
CAP = 8 * F  # 32 fine px cap height

def hexc(c):
    c = c.lstrip("#"); return tuple(int(c[i:i+2], 16) for i in (0, 2, 4))
def mix(a, b, t):
    a, b = hexc(a), hexc(b)
    return "#%02x%02x%02x" % tuple(round(a[i] + (b[i] - a[i]) * t) for i in range(3))
def h(x, y, s=0):
    n = (x * 374761393 + y * 668265263 + s * 2246822519) & 0xFFFFFFFF
    n = (n ^ (n >> 13)) * 1274126177 & 0xFFFFFFFF
    return ((n ^ (n >> 16)) & 0xFFFF) / 65535.0

# --- rocket I (fine grid, 24 wide). chars: b body, s body shade, n nose red, N nose dark, w window aether,
# W window rim, f fin red, F fin dark, k flame core, a amber flame, o furnace, x outline handled later
ROCKET = [
 "...........nn...........",
 "...........nn...........",
 "..........nnnN..........",
 "..........nnnN..........",
 ".........nnnnNN.........",
 ".........nnnnNN.........",
 "........nnnnnNNN........",
 "........nnnnnNNN........",
 "........bbbbbbss........",
 "........bbbbbbss........",
 "........bbbbbbss........",
 "........bbWWWWss........",
 "........bWwwwwWs........",
 "........bWwwwwWs........",
 "........bWwwwwWs........",
 "........bWwwwwWs........",
 "........bbWWWWss........",
 "........bbbbbbss........",
 "........nnnnnnNN........",
 "........nnnnnnNN........",
 "........bbbbbbss........",
 "........bbbbbbss........",
 "........bbbbbbss........",
 "........bbbbbbss........",
 "........bbbbbbss........",
 "........bbbbbbss........",
 "........bbbbbbss........",
 "........bbbbbbss........",
 "......ffbbbbbbssFF......",
 ".....fffbbbbbbssFFF.....",
 "....ffffbbbbbbssFFFF....",
 "...fffffbbbbbbssFFFFF...",
 "..ffffffbbbbbbssFFFFFF..",
 ".fffffffbbbbbbssFFFFFFF.",
 "fffffff.ssssssss.FFFFFFF",
 "fffff....kkkkkk....FFFFF",
 ".........akkkkka........",
 ".........aakkkaa........",
 "..........akkka.........",
 "..........aakaa.........",
 "...........oao..........",
 "...........oo...........",
 "............o...........",
]
ROCKET_TOP = 12  # rows above cap line
RC = {"b": "#f4ead8", "s": "#b8a48a", "n": "#ff4a32", "N": "#b02a1a", "w": "#7af0d8", "W": "#2a5a54",
      "f": "#ff4a32", "F": "#b02a1a", "k": "#fff2c0", "a": "#ffb020", "o": "#ff7a2a"}

def cog_mask(cx, cy, r_out, r_in, r_tooth, teeth, tw, rot=0.0):
    pts = set()
    R = int(r_tooth) + 2
    for y in range(int(cy - R), int(cy + R) + 1):
        for x in range(int(cx - R), int(cx + R) + 1):
            dx, dy = x + 0.5 - cx, y + 0.5 - cy
            d = math.hypot(dx, dy)
            if d < r_in: continue
            if d <= r_out: pts.add((x, y)); continue
            if d <= r_tooth:
                a = math.atan2(dy, dx) - rot
                for k in range(teeth):
                    ta = 2 * math.pi * k / teeth
                    da = (a - ta + math.pi) % (2 * math.pi) - math.pi
                    # tooth: constant width band along the spoke direction
                    if abs(d * math.sin(da)) <= tw / 2 and math.cos(da) > 0:
                        pts.add((x, y)); break
    return pts

def build_wordmark():
    """returns dict (x,y)->color plus bbox"""
    face = {}   # iron pixels: (x,y) -> letter index
    brass = set()  # cog pixels
    rocket = {}
    x = 0
    GAP = 5
    letters = list("SHIPTORIO")
    for i, ch in enumerate(letters):
        if i == 2:  # rocket I
            for ry, row in enumerate(ROCKET):
                for rx, c in enumerate(row):
                    if c != ".": rocket[(x + rx - 2, ry - ROCKET_TOP)] = RC[c]
            x += 24 - 4 + GAP
            continue
        if ch == "O" and i == 8:
            w = 34
            cx, cy = x + w / 2, CAP / 2
            for p in cog_mask(cx, cy, 13.2, 6.6, 17.2, 8, 6.2, rot=math.pi / 8 if i == 5 else 0):
                brass.add(p) if i == 8 else face.setdefault(p, i)
            x += w + GAP
            continue
        g = LET[ch]
        for gy, row in enumerate(g):
            for gx, c in enumerate(row):
                if c == "#":
                    for fy in range(F):
                        for fx in range(F):
                            face[(x + gx * F + fx, gy * F + fy)] = i
        x += len(g[0]) * F + GAP
    return face, brass, rocket

IRON_TOP, IRON_BOT = "#9a8673", "#4a3a30"
def shade_iron(face, px):
    out = {}
    for (x, y) in face:
        up = (x, y - 1) in face; dn = (x, y + 1) in face
        lf = (x - 1, y) in face; rt = (x + 1, y) in face
        up2 = (x, y - 2) in face
        t = max(0, min(1, y / CAP))
        c = mix(IRON_TOP, IRON_BOT, t)
        if not up: c = "#ffc24a"
        elif not up2: c = "#d0a24e"
        elif not dn: c = "#2a1d16"
        elif not lf: c = mix(c, "#f4ead8", 0.18)
        elif not rt: c = mix(c, "#000000", 0.35)
        else:
            r = h(x, y, 1)
            if r < 0.05: c = mix(c, "#1e1814", 0.5)       # soot
            elif r < 0.075: c = mix(c, "#8a3a20", 0.55)    # rust fleck
            elif r > 0.96: c = mix(c, "#f4ead8", 0.15)    # wear
        out[(x, y)] = c
    return out

def shade_brass(brass, cx_of):
    out = {}
    for (x, y) in brass:
        up = (x, y - 1) in brass; dn = (x, y + 1) in brass
        lf = (x - 1, y) in brass; rt = (x + 1, y) in brass
        t = max(0, min(1, y / CAP))
        c = mix("#f0c060", "#8a5a20", t)
        if not up: c = "#fff0b0"
        elif not dn: c = "#4a2a10"
        elif not lf: c = mix(c, "#fff0b0", 0.3)
        elif not rt: c = mix(c, "#000000", 0.3)
        elif h(x, y, 3) < 0.06: c = mix(c, "#5a3a14", 0.5)
        out[(x, y)] = c
    return out

def rivets(face, shaded):
    # a rivet on each letter's top-left solid 4x4 corner block and bottom-right one
    by = {}
    for (x, y), i in face.items(): by.setdefault(i, []).append((x, y))
    for i, pts in by.items():
        s = set(pts)
        cand = [p for p in pts if all((p[0] + dx, p[1] + dy) in s for dx in range(-2, 4) for dy in range(-2, 4))]
        if not cand: continue
        tl = min(cand, key=lambda p: p[0] + p[1]); br = max(cand, key=lambda p: p[0] + p[1])
        for (rx, ry) in {tl, br}:
            shaded[(rx, ry)] = "#ffe08a"; shaded[(rx + 1, ry)] = "#d0a24e"
            shaded[(rx, ry + 1)] = "#d0a24e"; shaded[(rx + 1, ry + 1)] = "#8a5a20"
            shaded[(rx + 2, ry + 1)] = "#1e1410"; shaded[(rx + 1, ry + 2)] = "#1e1410"; shaded[(rx + 2, ry + 2)] = "#1e1410"
            # rust streak under the rivet
            if h(rx, ry, 9) < 0.6:
                for k in range(3, 3 + int(2 + h(rx, ry, 7) * 4)):
                    if (rx + 1, ry + k) in s and (rx + 1, ry + k + 1) in s:
                        shaded[(rx + 1, ry + k)] = mix(shaded.get((rx + 1, ry + k), "#5a4a3e"), "#8a3a20", 0.7)

def compose(face, brass, rocket, extr=3, outline="#000000"):
    shaded = shade_iron(face, None)
    rivets(face, shaded)
    shaded.update(shade_brass(brass, None))
    shaded.update(rocket)
    solid = set(shaded)
    # extrusion: iron sides lit by furnace from below
    ext = {}
    for (x, y) in solid:
        if (x, y) in rocket: continue
        for k in range(1, extr + 1):
            p = (x + (1 if k == extr else 0), y + k)
            if p not in solid and p not in ext:
                ext[p] = k
    pix = dict(shaded)
    for p, k in ext.items():
        pix[p] = "#2a1810" if k < extr else "#7a3a16"
    allp = set(pix)
    for (x, y) in list(allp):
        for dx in (-1, 0, 1):
            for dy in (-1, 0, 1):
                q = (x + dx, y + dy)
                if q not in allp: pix.setdefault(q, outline)
    return pix

def to_svg(pix, scale_attr=2, title="Shiptorio", pad=0):
    xs = [p[0] for p in pix]; ys = [p[1] for p in pix]
    x0, y0, x1, y1 = min(xs) - pad, min(ys) - pad, max(xs) + 1 + pad, max(ys) + 1 + pad
    W, H = x1 - x0, y1 - y0
    rows = {}
    for (x, y), c in pix.items(): rows.setdefault(y, {})[x] = c
    by_color = {}
    for y in sorted(rows):
        r = rows[y]; xs_ = sorted(r); i = 0
        while i < len(xs_):
            x = xs_[i]; c = r[x]; j = i
            while j + 1 < len(xs_) and xs_[j + 1] == xs_[j] + 1 and r[xs_[j + 1]] == c: j += 1
            by_color.setdefault(c, []).append((x - x0, y - y0, xs_[j] - x + 1))
            i = j + 1
    parts = []
    for c, runs in sorted(by_color.items(), key=lambda kv: -len(kv[1])):
        d = "".join(f"M{x} {y}h{w}v1h-{w}z" for x, y, w in runs)
        parts.append(f'<path fill="{c}" d="{d}"/>')
    return (f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {W} {H}" width="{W*scale_attr}" height="{H*scale_attr}" '
            f'shape-rendering="crispEdges" role="img" aria-label="{title}"><title>{title}</title>' + "".join(parts) + "</svg>\n"), W, H

def build_mark(n=32):
    """square badge: riveted iron plate, brass cog, rocket bursting up through it."""
    pix = {}
    for y in range(n):
        for x in range(n):
            edge = min(x, y, n - 1 - x, n - 1 - y)
            if edge == 0: c = "#000000"
            elif edge == 1: c = "#8a6a4c" if (y == 1 or x == 1) else "#3a2a20"
            else:
                c = mix("#2a211b", "#140e0a", y / n)
                if h(x, y, 5) < 0.06: c = "#0e0a08"
            pix[(x, y)] = c
    # under-glow
    for y in range(n - 10, n - 2):
        for x in range(2, n - 2):
            t = (y - (n - 10)) / 8
            d = abs(x + 0.5 - n / 2) / (n / 2)
            pix[(x, y)] = mix(pix[(x, y)], "#ff7a2a", max(0, 0.28 * t * (1 - d)))
    s = n / 32
    cx, cy = n / 2, n / 2 + 1 * s
    cog = cog_mask(cx, cy, 9.4 * s, 5.6 * s, 12.6 * s, 8, 4.4 * s, rot=math.pi / 8)
    shaded = shade_brass(cog, None)
    for p in cog:
        y = p[1]
        t = (y - (cy - 11 * s)) / (22 * s)
        c = mix("#f0c060", "#7a4a18", max(0, min(1, t)))
        up = (p[0], p[1] - 1) in cog; dn = (p[0], p[1] + 1) in cog
        if not up: c = "#fff0b0"
        elif not dn: c = "#3a2008"
        shaded[p] = c
    # outline cog
    for (x, y) in list(cog):
        for dx in (-1, 0, 1):
            for dy in (-1, 0, 1):
                q = (x + dx, y + dy)
                if q not in cog and 1 < q[0] < n - 2 and 1 < q[1] < n - 2: pix[q] = "#000000"
    pix.update(shaded)
    # rocket 8 wide at n=32
    R = [
     "...nN...",
     "..nnNN..",
     "..nnNN..",
     "..bbbs..",
     "..bwws..",
     "..bwws..",
     "..bbbs..",
     "..nnNN..",
     "..bbbs..",
     "..bbbs..",
     "..bbbs..",
     ".fbbbsF.",
     "ffbbbsFF",
     "ff.kk.FF",
     "...ka...",
     "...aa...",
     "....o...",
    ]
    rx0, ry0 = int(cx) - 4, 5
    rk = {}
    for ry, row in enumerate(R):
        for rx, c in enumerate(row):
            if c != ".": rk[(rx0 + rx, ry0 + ry)] = RC[c]
    for (x, y) in list(rk):
        for dx in (-1, 0, 1):
            for dy in (-1, 0, 1):
                q = (x + dx, y + dy)
                if q not in rk: pix[q] = "#000000"
    pix.update(rk)
    # rivets
    for (x, y) in [(3, 3), (n - 5, 3), (3, n - 5), (n - 5, n - 5)]:
        pix[(x, y)] = "#ffe08a"; pix[(x + 1, y)] = "#d0a24e"; pix[(x, y + 1)] = "#d0a24e"; pix[(x + 1, y + 1)] = "#8a5a20"
    return pix

FAV16 = [
 "################",
 "#..............#",
 "#......nn......#",
 "#.....nnNN.....#",
 "#.....bbbb.....#",
 "#..cc.bwwb.cc..#",
 "#..cccbbbbccc..#",
 "#...cbbbbbbc...#",
 "#..ccfbbbbfcc..#",
 "#..cfffbbfffc..#",
 "#..ccc.kk.ccc..#",
 "#...cc.aa.cc...#",
 "#..cc.cccc.cc..#",
 "#..............#",
 "#..............#",
 "################",
]

def build_fav16():
    n = 16
    pix = {}
    for y in range(n):
        for x in range(n):
            e = min(x, y, n - 1 - x, n - 1 - y)
            pix[(x, y)] = "#000000" if e == 0 else ("#2a1d16" if y < 9 else "#3a1e10")
    cog = cog_mask(8, 9, 5.0, 2.6, 6.9, 8, 2.2, rot=math.pi / 8)
    for (x, y) in cog:
        if 0 < x < n - 1 and 0 < y < n - 1:
            up = (x, y - 1) in cog
            pix[(x, y)] = "#ffd27a" if not up else ("#d09a40" if y < 10 else "#a06a24")
    R = {(7, 1): "n", (8, 1): "N", (7, 2): "n", (8, 2): "N", (7, 3): "b", (8, 3): "s", (7, 4): "w", (8, 4): "w",
         (7, 5): "b", (8, 5): "s", (7, 6): "b", (8, 6): "s", (7, 7): "b", (8, 7): "s", (7, 8): "b", (8, 8): "s",
         (6, 8): "f", (9, 8): "F", (6, 9): "f", (9, 9): "F", (7, 9): "b", (8, 9): "s", (7, 10): "k", (8, 10): "a",
         (7, 11): "a", (8, 11): "o"}
    for (x, y), c in R.items():
        pix[(x, y)] = {"b": "#ffffff", "s": "#d8c8b0", "n": "#ff4a32", "N": "#c02a1a", "w": "#7af0d8",
                        "f": "#ff4a32", "F": "#c02a1a", "k": "#fff2c0", "a": "#ffb020", "o": "#ff7a2a"}[c]
    for (x, y) in [(6, 2), (9, 2), (6, 3), (9, 3), (6, 4), (9, 4), (6, 5), (9, 5), (6, 6), (9, 6), (6, 7), (9, 7), (5, 8), (10, 8), (5, 9), (10, 9)]:
        if (x, y) in cog: pix[(x, y)] = "#000000"
    return pix

if __name__ == "__main__":
    face, brass, rocket = build_wordmark()
    pix = compose(face, brass, rocket)
    svg, W, H = to_svg(pix, 2)
    open(os.path.join(OUT, "wordmark.svg"), "w").write(svg)
    # single color: ink silhouette, no outline
    mono = {p: "#f4ead8" for p in list(face) + list(brass) + list(rocket)}
    open(os.path.join(OUT, "wordmark-mono.svg"), "w").write(to_svg(mono, 2)[0])
    open(os.path.join(OUT, "mark.svg"), "w").write(to_svg(build_mark(32), 8)[0])
    open(os.path.join(OUT, "favicon.svg"), "w").write(to_svg(build_fav16(), 2)[0])
    print("wordmark", W, H)
