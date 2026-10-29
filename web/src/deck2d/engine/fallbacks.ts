import { FLOOR_Y, STOP_X, type ArtLoader, type ShippyModule, type ShippyView } from "../contract";

// A simple stand-in Shippy for dev pages and for when shippy/ fails to load. main.ts swaps in the real one when it exists.

export function fallbackShippy(art: ArtLoader): ShippyModule {
  let v: ShippyView = { pose: "folded", at: "corner" }, t = 0, poseT = 0, unfoldT = 0;
  const put = (cx: CanvasRenderingContext2D, name: string, x: number, base: number, h: number, flip = false) => {
    const im = art.get(name); if (!im) return;
    const w = im.naturalWidth * h / im.naturalHeight;
    cx.save(); cx.translate(x, base); if (flip) cx.scale(-1, 1); cx.drawImage(im, -w / 2, -h, w, h); cx.restore();
  };
  return {
    update(dt, view) {
      t += dt;
      if (view.pose !== v.pose) { poseT = 0; if (view.pose === "unfold") unfoldT = 0; }
      poseT += dt; unfoldT += dt; v = view;
    },
    drawWorld(cx) {
      if (v.at === "corner") return;
      const x = STOP_X[v.at] + 150, base = FLOOR_Y + 52;
      if (v.pose === "unfold") {
        const hop = unfoldT < 0.3 ? -260 * (1 - unfoldT / 0.3) : 0;
        put(cx, "shippy-" + Math.min(5, Math.floor(unfoldT / 0.2)), x, base + hop, 84, true);
      } else if (v.pose === "lever") put(cx, "shippy-lever", x - 40, base, 84, true);
      else if (v.pose === "happy") put(cx, "shippy-happy", x, base - Math.abs(Math.sin(poseT * 9)) * 10, 100, true);
      else if (v.pose === "alarmed") put(cx, "shippy-alarm", x + Math.sin(t * 60) * 2, base, 100, true);
      else put(cx, "shippy-" + (Math.sin(t * 3) > 0 ? 3 : 4), x, base, 84, true);
    },
    drawCorner(cx, x, y, size) {
      if (v.at !== "corner") return;
      const mx = x + size / 2, base = y + size * 0.85, h = size * 0.7;
      const g = cx.createRadialGradient(mx, base - h / 2, 2, mx, base - h / 2, size * 0.7);
      g.addColorStop(0, `rgba(95,215,255,${0.18 + 0.1 * Math.sin(t * 1.6)})`); g.addColorStop(1, "rgba(95,215,255,0)");
      cx.fillStyle = g; cx.fillRect(x - size * 0.2, y - size * 0.2, size * 1.4, size * 1.4);
      if (v.pose === "happy") put(cx, "shippy-happy", mx, base - Math.abs(Math.sin(poseT * 9)) * 8, h * 1.3);
      else if (v.pose === "alarmed") put(cx, "shippy-alarm", mx + Math.sin(t * 60) * 2, base, h * 1.3);
      else if (v.pose === "peek") put(cx, "shippy-peek", mx, base, h);
      else put(cx, "shippy-" + (Math.sin(t * 1.6) > 0.3 ? 1 : 0), mx, base, h); // the eye light breathing
    },
  };
}
