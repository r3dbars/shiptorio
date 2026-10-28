import { FLOOR_Y, STOP_X, type ArtLoader, type CardView, type MountCard, type ShippyModule, type ShippyView } from "../contract";

// Simple stand-ins so the deck runs before shippy/ and card/ land. main.ts swaps in the real modules when they exist.

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

export const fallbackCard: MountCard = (host, h) => {
  host.innerHTML = `<div class="card" hidden><h1></h1><ol class="dots"><li></li><li></li><li></li></ol><p></p>
    <div class="btns"><button class="btn" type="button" data-a="later">&larr; Later</button><button class="btn go" type="button" data-a="approve">Approve &rarr;</button></div></div>`;
  const el = host.firstElementChild as HTMLElement;
  let card: CardView | null = null, sx: number | null = null;
  const act = (a: string) => { if (!card) return; const id = card.id; if (a === "approve") h.onApprove(id); else h.onLater(id); };
  el.addEventListener("click", (e) => { const a = (e.target as HTMLElement).closest("button")?.dataset.a; if (a) act(a); });
  el.addEventListener("pointerdown", (e) => { if ((e.target as HTMLElement).closest("button")) return; sx = e.clientX; el.setPointerCapture(e.pointerId); });
  el.addEventListener("pointermove", (e) => { if (sx !== null) el.style.transform = `translate(calc(-50% + ${e.clientX - sx}px), 0) rotate(${(e.clientX - sx) / 40}deg)`; });
  el.addEventListener("pointerup", (e) => { if (sx === null) return; const dx = e.clientX - sx; sx = null; el.style.transform = ""; if (dx > 80) act("approve"); else if (dx < -80) act("later"); });
  const key = (e: KeyboardEvent) => { if (e.key === "ArrowRight") act("approve"); if (e.key === "ArrowLeft") act("later"); };
  addEventListener("keydown", key);
  return {
    show(next) {
      if (next?.id === card?.id && next?.title === card?.title) return;
      card = next;
      if (!next) { el.classList.add("gone"); setTimeout(() => { if (!card) el.hidden = true; }, 300); return; }
      el.hidden = false; el.classList.remove("gone");
      el.querySelector("h1")!.textContent = next.title;
      el.querySelector("p")!.textContent = next.line;
      el.querySelector<HTMLElement>("[data-a=approve]")!.textContent = (next.yes ?? "Approve") + " \u2192";
      el.querySelector<HTMLElement>("[data-a=later]")!.textContent = "\u2190 " + (next.no ?? "Later");
      const dots = el.querySelector(".dots") as HTMLElement;
      dots.hidden = !next.dots;
      [...dots.children].forEach((d, i) => d.classList.toggle("on", !!next.dots && i < next.dots.have));
    },
    destroy() { removeEventListener("keydown", key); host.innerHTML = ""; },
  };
};
