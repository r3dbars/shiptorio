// Pointer gestures on the map. One finger (or mouse) drags to pan, two fingers pinch to zoom and pan together, and a
// press that barely moves is a tap (or click) on whatever is under it. When the last finger lifts: a tap picks, a
// one-finger drag settles the view (a phone snaps to the nearest floor), and anything else never acts. A gesture a
// second finger joined is never a tap and never snaps (a pinch is the player framing on purpose), and a cancelled
// pointer (the OS took the gesture) never acts.

export type Release = "pick" | "settle" | "none";

export function releaseAction(g: { last: boolean; moved: number; multi: boolean; cancelled: boolean }): Release {
  if (!g.last || g.cancelled || g.multi) return "none";
  return g.moved < 8 ? "pick" : "settle";
}

export interface PointerLike {
  pointerId: number;
  clientX: number;
  clientY: number;
  type: string; // pointerup or pointercancel on release
  pointerType?: string;
}

export interface GestureTarget {
  capture(id: number): void;
  panBy(dx: number, dy: number): void;
  zoomBy(f: number): void;
  hover(x: number, y: number): void; // a mouse moving with no button down
  pick(x: number, y: number): void;
  settle(): void;
}

export function mapGesture(t: GestureTarget) {
  const pts = new Map<number, { x: number; y: number }>();
  let moved = 0;
  let multi = false; // a second finger joined this gesture
  let pinch = 0; // last distance between two fingers
  const mid = () => {
    const [a, b] = [...pts.values()];
    return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2, d: Math.hypot(a.x - b.x, a.y - b.y) };
  };
  const down = (e: PointerLike) => {
    if (pts.size === 0) (moved = 0), (multi = false);
    pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
    t.capture(e.pointerId);
    if (pts.size === 2) (pinch = mid().d), (multi = true);
  };
  const move = (e: PointerLike) => {
    const p = pts.get(e.pointerId);
    if (!p) {
      if (e.pointerType === "mouse") t.hover(e.clientX, e.clientY);
      return;
    }
    if (pts.size === 1) {
      moved += Math.abs(e.clientX - p.x) + Math.abs(e.clientY - p.y);
      t.panBy(e.clientX - p.x, e.clientY - p.y);
      p.x = e.clientX;
      p.y = e.clientY;
      return;
    }
    const before = mid();
    p.x = e.clientX;
    p.y = e.clientY;
    const after = mid();
    t.panBy(after.x - before.x, after.y - before.y);
    if (pinch > 0 && after.d > 0) t.zoomBy(pinch / after.d); // fingers apart zooms in
    pinch = after.d;
  };
  const up = (e: PointerLike) => {
    const act = releaseAction({ last: pts.size === 1 && pts.has(e.pointerId), moved, multi, cancelled: e.type !== "pointerup" });
    if (act === "pick") t.pick(e.clientX, e.clientY);
    else if (act === "settle") t.settle();
    pts.delete(e.pointerId);
    pinch = pts.size === 2 ? mid().d : 0;
  };
  return { down, move, up };
}
