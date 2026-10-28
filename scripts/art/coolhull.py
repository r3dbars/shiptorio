# Remap a warm hull picture onto cool steel by brightness. Keeps lamps, cyan energy, copper pipes, steam and thin
# brass trim; big warm blobs (the sun patch on the floor) become lit steel instead.
import sys, colorsys
from PIL import Image
H = lambda s: tuple(int(s[i:i+2],16) for i in (1,3,5))
RAMP = [H(c) for c in ["#0a0604","#121e2b","#1c2839","#273349","#3d4d6a","#56667f","#7d8ea3"]]
def keep(r, g, b):
    h,s,v = colorsys.rgb_to_hsv(r/255,g/255,b/255); hd = h*360
    if 160 <= hd <= 220 and s > 0.3: return "fixed"   # cyan energy
    if s < 0.15 and v > 0.7: return "fixed"           # steam
    if v > 0.95 and s > 0.6: return "thin"            # lamps, glints
    if hd < 20 and s > 0.72 and 0.45 < v < 0.9: return "thin"  # copper pipes
    if 30 <= hd <= 55 and s > 0.7 and v > 0.62: return "thin"  # brass trim
    return None
def go(src, dst):
    im = Image.open(src).convert("RGBA"); p = im.load(); W, Hh = im.size
    k = [[keep(*p[x,y][:3]) if p[x,y][3] else None for y in range(Hh)] for x in range(W)]
    out = im.copy(); q = out.load()
    for y in range(Hh):
        for x in range(W):
            r,g,b,a = p[x,y]
            if a == 0: continue
            kk = k[x][y]
            if kk == "fixed": continue
            if kk == "thin":
                n = sum(1 for dx in (-1,0,1) for dy in (-1,0,1) if (dx or dy) and 0<=x+dx<W and 0<=y+dy<Hh and k[x+dx][y+dy] == "thin")
                dark = any(0<=x+dx<W and 0<=y+dy<Hh and p[x+dx,y+dy][3] and max(p[x+dx,y+dy][:3]) < 70 for dx in range(-2,3) for dy in range(-2,3))
                if n < 5 or dark: continue
            lum = (0.299*r + 0.587*g + 0.114*b) / 255
            q[x,y] = RAMP[min(len(RAMP)-1, int(lum * 1.5 * len(RAMP)))] + (a,)
    out.save(dst, lossless=True) if dst.endswith(".webp") else out.save(dst)
for a in zip(sys.argv[1::2], sys.argv[2::2]): go(*a)
