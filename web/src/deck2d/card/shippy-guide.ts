import { drawPx, type PxFrame } from "../shippy/pixel";

/** The deck's own Shippy sprite: a short entrance, then a quiet reading pose. */
export function mountShippyGuide(host: HTMLElement): { destroy(): void } {
  const canvas = document.createElement("canvas");
  canvas.className = "ic-shippy-guide";
  canvas.width = 168;
  canvas.height = 84;
  canvas.setAttribute("aria-hidden", "true");
  host.append(canvas);
  const ctx = canvas.getContext("2d");
  const motion = window.matchMedia("(prefers-reduced-motion: reduce)");
  const started = performance.now();
  let timer: ReturnType<typeof setInterval> | undefined;
  const paint = () => {
    if (!ctx) return;
    const age = performance.now() - started;
    const walk = !motion.matches && age < 2400;
    const x = motion.matches ? 72 : Math.round(Math.min(1, age / 2400) * 24) * 3;
    const frame: PxFrame = walk ? `walk${Math.floor(age / 140) % 6 as 0 | 1 | 2 | 3 | 4 | 5}`
      : !motion.matches && age % 3900 < 280 ? "inspect1" : "inspect0";
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    drawPx(ctx, frame, 45 + x, 75, 3);
  };
  const update = () => {
    if (timer !== undefined) clearInterval(timer);
    timer = undefined;
    paint();
    if (!motion.matches && !document.hidden) timer = setInterval(paint, 140);
  };
  motion.addEventListener("change", update);
  document.addEventListener("visibilitychange", update);
  update();
  return { destroy() {
    if (timer !== undefined) clearInterval(timer);
    motion.removeEventListener("change", update);
    document.removeEventListener("visibilitychange", update);
    canvas.remove();
  } };
}
