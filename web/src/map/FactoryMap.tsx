import { useEffect, useRef } from "react";
import type { FactoryState } from "@shiptorio/shared";
import { FactoryScene } from "./scene";

export function FactoryMap({ state, onPick }: { state: FactoryState | null; onPick?: (id: string) => void }) {
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

    let drag: { x: number; y: number } | null = null;
    let moved = 0; // a press that barely moves is a click on whatever is under it
    const down = (e: PointerEvent) => {
      drag = { x: e.clientX, y: e.clientY };
      moved = 0;
      canvas.setPointerCapture(e.pointerId);
    };
    const move = (e: PointerEvent) => {
      if (!drag) return;
      moved += Math.abs(e.clientX - drag.x) + Math.abs(e.clientY - drag.y);
      scene.panBy(e.clientX - drag.x, e.clientY - drag.y);
      drag = { x: e.clientX, y: e.clientY };
    };
    const up = (e: PointerEvent) => {
      if (drag && moved < 5 && e.type === "pointerup") {
        const id = scene.pick(e.clientX, e.clientY, canvas.getBoundingClientRect());
        if (id) pickRef.current?.(id);
      }
      drag = null;
    };
    const wheel = (e: WheelEvent) => {
      e.preventDefault();
      scene.zoomBy(Math.exp(e.deltaY * 0.001)); // scroll down zooms out
    };
    canvas.addEventListener("pointerdown", down);
    canvas.addEventListener("pointermove", move);
    canvas.addEventListener("pointerup", up);
    canvas.addEventListener("pointercancel", up);
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

  return (
    <>
      <canvas ref={canvasRef} className="map" aria-label="Factory map" />
      <div ref={labelsRef} className="maplabels" />
    </>
  );
}
