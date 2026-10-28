# Placeholder art for the launch build: splits pad.webp (bridge + rocket island + tower) into pieces the
# launch layer can animate one at a time, plus darkened copies for "built but not lit yet".
# Re-run when Justin's island/bridge/tower stage art lands (or delete once real sheets replace these).
#   python3 web/src/deck2d/launch/slice-art.py
from pathlib import Path
from PIL import Image, ImageEnhance

ART = Path(__file__).resolve().parents[3] / "public" / "deck" / "art"
pad = Image.open(ART / "pad.webp").convert("RGBA")
W, H = pad.size
px = pad.load()

def piece(x, y):
    if 1018 <= x <= 1440 and y < 222:
        return "tower"
    if x >= 1022 or (x >= 900 and y < 392) or (930 <= x < 985 and y >= 610):
        return "island"
    return "bridge"

parts = {k: Image.new("RGBA", (W, H)) for k in ("island", "bridge", "tower")}
out = {k: p.load() for k, p in parts.items()}
for y in range(H):
    for x in range(W):
        if px[x, y][3]:
            out[piece(x, y)][x, y] = px[x, y]

for name, im in parts.items():
    box = im.getbbox()
    crop = im.crop(box)
    crop.save(ART / f"launch-{name}.webp", quality=88, method=6)
    print(name, box)
    if name in ("island", "bridge"):
        rgb = ImageEnhance.Brightness(ImageEnhance.Color(crop).enhance(0.35)).enhance(0.42)
        rgb.putalpha(crop.getchannel("A"))
        rgb.save(ART / f"launch-{name}-dark.webp", quality=88, method=6)
