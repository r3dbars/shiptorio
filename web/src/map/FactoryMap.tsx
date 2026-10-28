import "./gauntlet.css";
import { useEffect, useRef, useState } from "react";
import type { FactoryState } from "@shiptorio/shared";
import type { FactoryScene, Cosmetics, Ping } from "./scene";
import { SCENE_REBUILD } from "./contextLoss";
import { SHAFT } from "./world";

import type { SatelliteSpec } from "./empire";
import { mapGesture } from "./gesture";
import type { Timelapse } from "./shaft/ShaftScene";

// What FactoryMap asks of a map. The shaft (shaft/ShaftScene.ts, the map) and the island (scene.ts, ?world=iron) both do it.
type MapScene = Pick<
  FactoryScene,
  "setSize" | "setLift" | "zoomBy" | "panBy" | "update" | "pick" | "hover" | "clearHover" | "setTeachingKeys" | "setShowAllLabels" | "setPings" | "focus" | "setSatellites" | "backToLine" | "empireView" | "overview" | "setCosmetics" | "dispose"
> & {
  settle?: () => void; // the shaft snaps a phone drag to the nearest floor
  timelapse?: (lapse: Timelapse) => void; // the shaft replays what shipped while you were away (ui/away.ts)
  endTimelapse?: () => void;
};
type MapCtor = new (canvas: HTMLCanvasElement, labels: HTMLElement, onPick: (id: string) => void, recovering?: boolean) => MapScene;

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
  lapse?: Timelapse | null; // coming back: replay what shipped while you were away; null ends it
  still?: boolean; // the camera is the tour's: no drag, zoom or hover labels (a tap still picks)
}

const NO_PINGS: Ping[] = [];

// a map that can't replay (the island) says so right away, and the comeback skips to the end
const playLapse = (scene: MapScene, lapse: Timelapse) => (scene.timelapse ? scene.timelapse(lapse) : lapse.onStart([]));
const NO_SATS: SatelliteSpec[] = [];

export function FactoryMap({ state, onPick, focus = null, showLabels = false, pings = NO_PINGS, teachingKeys = [], wide = null, lift = 0, cosmetics, satellites = NO_SATS, empire = false, summary, lapse = null, still = false }: Props) {
  const [generation, setGeneration] = useState(0);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const labelsRef = useRef<HTMLDivElement>(null);
  const sceneRef = useRef<MapScene | null>(null);
  const [crash, setCrash] = useState<{ e: unknown } | null>(null);
  const pickRef = useRef(onPick);
  pickRef.current = onPick;
  const stillRef = useRef(still);
  stillRef.current = still;
  // the latest props, for a map that arrives late (the shaft loads its art first)
  const propsRef = useRef({ showLabels, lift, cosmetics, teachingKeys, pings, satellites, focus, wide, empire, lapse });
  propsRef.current = { showLabels, lift, cosmetics, teachingKeys, pings, satellites, focus, wide, empire, lapse };

  useEffect(() => {
    let off: (() => void) | null = null;
    let dead = false;
    const rebuild = () => setGeneration(n => n + 1);
    const start = (scene: MapScene, late: boolean) => {
      if (dead) return scene.dispose();
      off = attach(scene);
      canvasRef.current!.addEventListener(SCENE_REBUILD, rebuild, { once: true });
      if (stateRef.current) scene.update(stateRef.current);
      if (!late) return; // the effects below hand it the rest
      const p = propsRef.current;
      scene.setShowAllLabels(p.showLabels);
      scene.setLift(p.lift);
      scene.setCosmetics(p.cosmetics);
      scene.setTeachingKeys(p.teachingKeys);
      scene.setPings(p.pings);
      scene.setSatellites(p.satellites);
      if (p.empire) scene.empireView();
      else if (!p.focus && p.wide) scene.overview(p.wide);
      else if (p.focus) scene.focus(p.focus);
      if (p.lapse) playLapse(scene, p.lapse);
    };
    const make = (Scene: MapCtor) => new Scene(canvasRef.current!, labelsRef.current!, (id) => pickRef.current?.(id), generation > 0);
    // (a map whose effect was already cleaned up, like StrictMode's first mount, is never built)
    const island = () => import("./scene").then(({ FactoryScene }) => FactoryScene);
    if (SHAFT)
      void import("./shaft/ShaftScene")
        // the shaft's code didn't arrive (say a deploy swapped it out under an open tab): the island stands in
        .then(({ ShaftScene }): MapCtor => ShaftScene, island)
        .then((Scene) => dead || start(make(Scene), true))
        // no WebGL: the nearest error boundary hears about it, as it does when the island can't start
        .catch((e: unknown) => dead || setCrash({ e }));
    else void island().then((Scene) => dead || start(make(Scene), true)).catch((e: unknown) => dead || setCrash({ e }));
    return () => {
      dead = true;
      canvasRef.current?.removeEventListener(SCENE_REBUILD, rebuild);
      off?.();
    };
  }, [generation]);

  // input and sizing for a map, once it exists; returns the teardown
  function attach(scene: MapScene) {
    const canvas = canvasRef.current!;
    sceneRef.current = scene;
    const ro = new ResizeObserver(([e]) => scene.setSize(e.contentRect.width, e.contentRect.height));
    ro.observe(canvas);

    // pointer gestures (gesture.ts): drag pans, pinch zooms, a tap picks, a phone drag settles on a floor
    const { down, move, up } = mapGesture({
      capture: (id) => canvas.setPointerCapture(id),
      panBy: (dx, dy) => stillRef.current || scene.panBy(dx, dy),
      zoomBy: (f) => stillRef.current || scene.zoomBy(f),
      // no button down: hovering shows that thing's label
      hover: (x, y) => (canvas.style.cursor = !stillRef.current && scene.hover(x, y, canvas.getBoundingClientRect()) ? "pointer" : ""),
      pick: (x, y) => {
        const id = scene.pick(x, y, canvas.getBoundingClientRect());
        if (id) pickRef.current?.(id);
      },
      settle: () => stillRef.current || scene.settle?.(),
    });
    const wheel = (e: WheelEvent) => {
      e.preventDefault();
      if (!stillRef.current) scene.zoomBy(Math.exp(e.deltaY * 0.001)); // scroll down zooms out
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
      if (stillRef.current) return;
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
    const focusIn = () => stillRef.current || scene.setShowAllLabels(true);
    const focusOut = (e: Event) => {
      if (!onMap((e as FocusEvent).relatedTarget)) scene.setShowAllLabels(labelsOnRef.current);
    };
    for (const el of [canvas, labels]) {
      el.addEventListener("focusin", focusIn);
      el.addEventListener("focusout", focusOut);
    }
    return () => {
      ro.disconnect();
      canvas.removeEventListener("pointerdown", down);
      canvas.removeEventListener("pointermove", move);
      canvas.removeEventListener("pointerup", up);
      canvas.removeEventListener("pointercancel", up);
      canvas.removeEventListener("pointerleave", leave);
      canvas.removeEventListener("wheel", wheel);
      canvas.removeEventListener("keydown", keys);
      for (const el of [canvas, labels]) {
        el.removeEventListener("focusin", focusIn);
        el.removeEventListener("focusout", focusOut);
      }
      scene.dispose();
      sceneRef.current = null;
    };
  }

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
  useEffect(() => {
    if (!lapse) return;
    if (sceneRef.current) playLapse(sceneRef.current, lapse); // else the map starts it when it arrives
    return () => sceneRef.current?.endTimelapse?.();
  }, [lapse]);
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

  if (crash) throw crash.e;
  return (
    <>
      <canvas
        key={generation}
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
