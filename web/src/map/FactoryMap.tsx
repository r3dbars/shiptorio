import { useEffect, useRef } from "react";
import type { FactoryState } from "@shiptorio/shared";
import { FactoryScene } from "./scene";

export function FactoryMap({ state }: { state: FactoryState | null }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const labelsRef = useRef<HTMLDivElement>(null);
  const sceneRef = useRef<FactoryScene | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current!;
    const scene = new FactoryScene(canvas, labelsRef.current!);
    sceneRef.current = scene;
    const ro = new ResizeObserver(([e]) => scene.setSize(e.contentRect.width, e.contentRect.height));
    ro.observe(canvas);

    let drag: { x: number; y: number } | null = null;
    const down = (e: PointerEvent) => {
      drag = { x: e.clientX, y: e.clientY };
      canvas.setPointerCapture(e.pointerId);
    };
    const move = (e: PointerEvent) => {
      if (!drag) return;
      scene.panBy(e.clientX - drag.x, e.clientY - drag.y);
      drag = { x: e.clientX, y: e.clientY };
    };
    const up = () => (drag = null);
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
      <div ref={labelsRef} className="maplabels" aria-hidden="true" />
    </>
  );
}
