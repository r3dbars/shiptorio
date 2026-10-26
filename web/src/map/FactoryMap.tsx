import "./gauntlet.css";
import { useEffect, useRef } from "react";
import type { FactoryState } from "@shiptorio/shared";
import { FactoryScene, type Cosmetics, type Ping } from "./scene";

import type { SatelliteSpec } from "./empire";

interface Props {
  state: FactoryState | null;
  onPick?: (id: string) => void;
  focus?: string | null; // the picked thing the camera flies in on
  showLabels?: boolean; // all labels on; otherwise they show on hover
  teachingKeys?: string[]; // pinned labels for the concept the tour is teaching
  pings?: Ping[]; // the pulsing marker on whatever needs you, then quiet tags on busy machines
  wide?: number | null; // no focus: pull back over the whole island, this far out (the welcome tour)
  lift?: number; // keep what the camera's on this much higher, as a fraction of height (a card sits below)
  cosmetics?: Cosmetics; // progression unlocks drawn on the island

  satellites?: SatelliteSpec[]; // the player's other repos, floating nearby
  empire?: boolean; // pulled back over every island (the empire overview)
  summary?: string; // the floor in one sentence, for screen readers (ui/FactoryText.tsx has the full text view)
}

const NO_PINGS: Ping[] = [];
const NO_SATS: SatelliteSpec[] = [];

export function FactoryMap({ state, onPick, focus = null, showLabels = false, pings = NO_PINGS, teachingKeys = [], wide = null, lift = 0, cosmetics, satellites = NO_SATS, empire = false, summary }: Props) {
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
    // Keyboard: with the map focused, arrows pan, + and - zoom. The labels on it tab like buttons.
    const keys = (e: KeyboardEvent) => {
      const pan = ({ ArrowLeft: [60, 0], ArrowRight: [-60, 0], ArrowUp: [0, 60], ArrowDown: [0, -60] } as Record<string, number[]>)[e.key];
      if (pan) scene.panBy(pan[0], pan[1]);
      else if (e.key === "+" || e.key === "=") scene.zoomBy(0.85);
      else if (e.key === "-" || e.key === "_") scene.zoomBy(1 / 0.85);
      else return;
      e.preventDefault();
      e.stopPropagation(); // the deck's arrow keys stay with the deck
    };
    canvas.addEventListener("keydown", keys);
    // While the keyboard is on the map, every label shows, so Tab can walk them.
    const labels = labelsRef.current!;
    const onMap = (el: EventTarget | null) => el instanceof Node && (el === canvas || labels.contains(el));
    const focusIn = () => scene.setShowAllLabels(true);
    const focusOut = (e: Event) => {
      if (!onMap((e as FocusEvent).relatedTarget)) scene.setShowAllLabels(labelsOnRef.current);
    };
    for (const el of [canvas, labels]) {
      el.addEventListener("focusin", focusIn);
      el.addEventListener("focusout", focusOut);
    }
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
  useEffect(() => {
    if (!focus && wide) sceneRef.current?.overview(wide);
    else sceneRef.current?.focus(focus);
    // the wide shot refits as the island grows
  }, [focus, wide, wide && state?.districts.length, wide && state?.machines.length]);
  const satKey = JSON.stringify(satellites);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => sceneRef.current?.setSatellites(satellites), [satKey]);
  const wasEmpire = useRef(false);
  useEffect(() => {
    if (empire) sceneRef.current?.empireView();
    else if (wasEmpire.current) sceneRef.current?.backToLine();
    wasEmpire.current = empire;
    // the overview refits when an island joins
  }, [empire, empire && satellites.length]);
  const labelsOnRef = useRef(showLabels);
  labelsOnRef.current = showLabels;
  useEffect(() => sceneRef.current?.setShowAllLabels(showLabels), [showLabels]);
  useEffect(() => sceneRef.current?.setLift(lift), [lift]);
  const cosmeticsKey = JSON.stringify(cosmetics ?? null);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => sceneRef.current?.setCosmetics(cosmetics), [cosmeticsKey]);
  const teachingKey = JSON.stringify(teachingKeys);
  useEffect(() => sceneRef.current?.setTeachingKeys(teachingKeys), [teachingKey]);
  const pingKey = JSON.stringify(pings);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => sceneRef.current?.setPings(pings), [pingKey]);

  return (
    <>
      <canvas
        ref={canvasRef}
        className="map"
        tabIndex={0}
        role="application"
        aria-roledescription="map"
        aria-label="Factory map. Arrow keys pan, plus and minus zoom. Press T for the factory as text."
        aria-describedby="map-summary"
      />
      <p id="map-summary" className="sr">
        {summary}
      </p>
      <div ref={labelsRef} className="maplabels" />
    </>
  );
}
