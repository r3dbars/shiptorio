import "./gauntlet.css";
import { useEffect, useRef } from "react";
import type { FactoryState } from "@shiptorio/shared";
import { FactoryScene, type Ping } from "./scene";

interface Props {
  state: FactoryState | null;
  onPick?: (id: string) => void;
  focus?: string | null; // the picked thing the camera flies in on
  showLabels?: boolean; // all labels on; otherwise they show on hover
  pings?: Ping[]; // the pulsing marker on whatever needs you, then quiet tags on busy machines
}

const NO_PINGS: Ping[] = [];

export function FactoryMap({ state, onPick, focus = null, showLabels = false, pings = NO_PINGS }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const labelsRef = useRef<HTMLDivElement>(null);
  const sceneRef = useRef<FactoryScene | null>(null);
  const pickRef = useRef(onPick);
  pickRef.current = onPick;

  useEffect(() => {
    const canvas = canvasRef.current!;
    const scene = new FactoryScene(canvas, labelsRef.current!, (id) => pickRef.current?.(id));
    sceneRef.current = scene;
    const ro = new ResizeObserver(([e]) => scene.setSize(e.contentRect.width, e.contentRect.height));
    ro.observe(canvas);

    // One finger (or mouse) drags to pan, two fingers pinch to zoom and pan together.
    // A press that barely moves is a tap (or click) on whatever is under it.
    const pts = new Map<number, { x: number; y: number }>();
    let moved = 0;
    let pinch = 0; // last distance between two fingers
    const mid = () => {
      const [a, b] = [...pts.values()];
      return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2, d: Math.hypot(a.x - b.x, a.y - b.y) };
    };
    const down = (e: PointerEvent) => {
      if (pts.size === 0) moved = 0;
      pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
      canvas.setPointerCapture(e.pointerId);
      if (pts.size === 2) pinch = mid().d;
    };
    const move = (e: PointerEvent) => {
      const p = pts.get(e.pointerId);
      if (!p) {
        // no button down: hovering shows that thing's label
        if (e.pointerType === "mouse") canvas.style.cursor = scene.hover(e.clientX, e.clientY, canvas.getBoundingClientRect()) ? "pointer" : "";
        return;
      }
      if (pts.size === 1) {
        moved += Math.abs(e.clientX - p.x) + Math.abs(e.clientY - p.y);
        scene.panBy(e.clientX - p.x, e.clientY - p.y);
        p.x = e.clientX;
        p.y = e.clientY;
        return;
      }
      const before = mid();
      p.x = e.clientX;
      p.y = e.clientY;
      const after = mid();
      moved += 100; // two fingers never count as a tap
      scene.panBy(after.x - before.x, after.y - before.y);
      if (pinch > 0 && after.d > 0) scene.zoomBy(pinch / after.d); // fingers apart zooms in
      pinch = after.d;
    };
    const up = (e: PointerEvent) => {
      if (pts.size === 1 && pts.has(e.pointerId) && moved < 8 && e.type === "pointerup") {
        const id = scene.pick(e.clientX, e.clientY, canvas.getBoundingClientRect());
        if (id) pickRef.current?.(id);
      }
      pts.delete(e.pointerId);
      pinch = pts.size === 2 ? mid().d : 0;
    };
    const wheel = (e: WheelEvent) => {
      e.preventDefault();
      scene.zoomBy(Math.exp(e.deltaY * 0.001)); // scroll down zooms out
    };
    canvas.addEventListener("pointerdown", down);
    canvas.addEventListener("pointermove", move);
    canvas.addEventListener("pointerup", up);
    canvas.addEventListener("pointercancel", up);
    const leave = () => scene.clearHover();
    canvas.addEventListener("pointerleave", leave);
    canvas.addEventListener("wheel", wheel, { passive: false });
    if (stateRef.current) scene.update(stateRef.current);
    return () => {
      ro.disconnect();
      scene.dispose();
      sceneRef.current = null;
    };
  }, []);

  const stateRef = useRef(state);
  stateRef.current = state;
  useEffect(() => {
    if (state) sceneRef.current?.update(state);
  }, [state]);
  useEffect(() => sceneRef.current?.focus(focus), [focus]);
  useEffect(() => sceneRef.current?.setShowAllLabels(showLabels), [showLabels]);
  const pingKey = JSON.stringify(pings);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => sceneRef.current?.setPings(pings), [pingKey]);

  return (
    <>
      <canvas ref={canvasRef} className="map" aria-label="Factory map" />
      <div ref={labelsRef} className="maplabels" />
    </>
  );
}
