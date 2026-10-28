// Dev contact sheet (web/shippy-sheet.html): every pixel frame at 4x (?scale=), labelled, with the webp art on top
// for comparison. Used for the 4x check the pixel canvas asks for.
import { PALETTE_48, art } from "../contract";
import { PX_FRAMES, drawPx, pxFrame, type PxFrame } from "./pixel";

const scale = Number(new URLSearchParams(location.search).get("scale")) || 4;
const cell = 30 * scale, cols = 8, refs = ["shippy-0", "shippy-3", "shippy-5", "shippy-lever", "shippy-happy", "shippy-alarm", "shippy-peek", "shippy-weld-0", "shippy-carry-0"];
const refH = 110;
const c = document.getElementById("c") as HTMLCanvasElement;
c.width = cols * cell; c.height = refH + Math.ceil(PX_FRAMES.length / cols) * (cell + 16);
const ctx = c.getContext("2d")!;
ctx.fillStyle = "#291b17"; ctx.fillRect(0, 0, c.width, c.height);
ctx.font = "12px monospace"; ctx.fillStyle = "#c0988e";
PX_FRAMES.forEach((name, i) => {
  const x = (i % cols) * cell, y = refH + Math.floor(i / cols) * (cell + 16);
  const g = pxFrame(name);
  // feet line on the cell's ground, body centred
  drawPx(ctx, name, x + cell / 2, y + cell - 4 * scale, scale);
  ctx.fillStyle = "#c0988e"; ctx.fillText(`${name} ${g.maxX - g.minX + 1}x${g.maxY - g.minY + 1}`, x + 6, y + cell + 12);
});
const comparing = new URLSearchParams(location.search).has("compare");
if (!comparing) Promise.all(refs.map((n) => new Promise<HTMLImageElement>((ok) => { const im = new Image(); im.onload = () => ok(im); im.onerror = () => ok(im); im.src = art(n); })))
  .then((ims) => ims.forEach((im, i) => { if (!im.naturalWidth) return; const h = refH - 10, w = im.naturalWidth * h / im.naturalHeight; ctx.drawImage(im, 10 + i * (c.width / refs.length), 4, w, h); }))
  .then(() => { document.body.dataset.ready = ""; });

// ?compare=1: each pixel frame next to the matching webp, shrunk to the same art size and snapped to the 48 colors
// (what the engine would show if the picture were used directly). Both at the same zoom.
if (comparing) {
  const pairs: [PxFrame, string][] = [
    ["box1", "shippy-1"], ["peek", "shippy-peek"], ["stand", "shippy-3"], ["walk1", "shippy-5"], ["lever0", "shippy-lever"],
    ["happy", "shippy-happy"], ["alarm", "shippy-alarm"], ["weld0", "shippy-weld-0"], ["carry0", "shippy-carry-0"],
  ];
  const rgb = PALETTE_48.map((h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16)));
  const snapImg = (im: HTMLImageElement, h: number) => {
    // crop to the opaque box first, so both sides are the same height in art px
    const t = document.createElement("canvas"); t.width = im.naturalWidth; t.height = im.naturalHeight;
    const tx = t.getContext("2d", { willReadFrequently: true })!; tx.drawImage(im, 0, 0);
    const a = tx.getImageData(0, 0, t.width, t.height).data;
    let x0 = t.width, y0 = t.height, x1 = 0, y1 = 0;
    for (let y = 0; y < t.height; y++) for (let x = 0; x < t.width; x++) if (a[(y * t.width + x) * 4 + 3] > 110) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y); }
    const cw = x1 - x0 + 1, ch = y1 - y0 + 1;
    const b = document.createElement("canvas"), w = Math.round((cw * h) / ch);
    b.width = w; b.height = h;
    const bx = b.getContext("2d", { willReadFrequently: true })!;
    bx.imageSmoothingQuality = "high"; bx.drawImage(t, x0, y0, cw, ch, 0, 0, w, h);
    const d = bx.getImageData(0, 0, w, h);
    for (let i = 0; i < d.data.length; i += 4) {
      if (d.data[i + 3] < 110) { d.data[i + 3] = 0; continue; }
      let best = 0, be = Infinity;
      rgb.forEach(([r, g, bl], n) => { const e = (r - d.data[i]) ** 2 + (g - d.data[i + 1]) ** 2 + (bl - d.data[i + 2]) ** 2; if (e < be) { be = e; best = n; } });
      [d.data[i], d.data[i + 1], d.data[i + 2], d.data[i + 3]] = [...rgb[best], 255];
    }
    bx.putImageData(d, 0, 0);
    return b;
  };
  const colW = 34 * scale;
  c.width = colW * pairs.length; c.height = 2 * 26 * scale + 40;
  ctx.font = "12px monospace";
  ctx.fillStyle = "#291b17"; ctx.fillRect(0, 0, c.width, c.height);
  ctx.imageSmoothingEnabled = false;
  Promise.all(pairs.map(([, n]) => new Promise<HTMLImageElement>((ok) => { const im = new Image(); im.onload = () => ok(im); im.src = art(n); }))).then((ims) => {
    pairs.forEach(([px], i) => {
      const g = pxFrame(px), h = g.maxY - g.minY + 1, x = i * colW;
      drawPx(ctx, px, x + colW / 2, 24 * scale, scale);
      const sn = snapImg(ims[i], h);
      ctx.drawImage(sn, x + colW / 2 - (sn.width * scale) / 2, 2 * 24 * scale + 10 - h * scale, sn.width * scale, h * scale);
      ctx.fillStyle = "#c0988e"; ctx.fillText(px, x + 6, c.height - 8);
    });
    document.body.dataset.ready = "";
  });
}
