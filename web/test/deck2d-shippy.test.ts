import { expect, test } from "bun:test";
import { STOP_X, type ShippyView } from "../src/deck2d/contract";
import { createShippy } from "../src/deck2d/shippy/shippy";
import { DOCK_HOME_X } from "../src/deck2d/shippy/dock";

const noArt = { get: () => null, ready: async () => {} };
function run(s: ReturnType<typeof createShippy>, view: ShippyView, seconds: number) {
  for (let t = 0; t < seconds; t += 1 / 60) s.update(1 / 60, view);
}

test("Shippy unfolds out of the corner, walks to the stop, works it, and folds back home", () => {
  const s = createShippy(noArt, { reducedMotion: true, pixel: false });
  run(s, { at: "corner", pose: "folded" }, 0.5);
  expect(s.state).toMatchObject({ corner: "home", world: "off" });

  s.update(1 / 60, { at: "review", pose: "walking" });
  expect(s.state.corner).toBe("unfold");
  run(s, { at: "review", pose: "walking" }, 1.4);
  expect(s.state.corner).toBe("gone");
  expect(s.state.world).toBe("walk");
  run(s, { at: "review", pose: "lever" }, 8);
  expect(s.state).toMatchObject({ world: "stand", x: STOP_X.review + 150, pose: "lever" });

  run(s, { at: "gate", pose: "alarmed" }, 8);
  expect(s.state).toMatchObject({ world: "stand", x: STOP_X.gate + 150 });

  run(s, { at: "corner", pose: "folded" }, 3);
  expect(s.state).toMatchObject({ corner: "home", world: "off" });
});

test("a call back to the deck mid-leap drops him straight back down", () => {
  const s = createShippy(noArt, { reducedMotion: true, pixel: false });
  run(s, { at: "builder", pose: "walking" }, 8);
  expect(s.state.world).toBe("stand");
  s.update(1 / 60, { at: "corner", pose: "folded" });
  run(s, { at: "checks", pose: "lever" }, 8);
  expect(s.state).toMatchObject({ corner: "gone", world: "stand", x: STOP_X.checks + 150 });
});

test("build poses: he carries the beam while he walks, then welds at the stop", () => {
  const s = createShippy(noArt, { reducedMotion: true, pixel: false });
  run(s, { at: "builder", pose: "carry" }, 1.4);
  expect(s.state).toMatchObject({ world: "walk", pose: "carry" });
  run(s, { at: "builder", pose: "weld" }, 8);
  expect(s.state).toMatchObject({ world: "stand", x: STOP_X.builder + 150, pose: "weld" });
});

test("pixel Shippy rests on the deck and walks home instead of returning to the sky", () => {
  const s = createShippy(noArt, { reducedMotion: true, pixel: true });
  const home = s.state.x;
  expect(s.state).toMatchObject({ corner: "gone", world: "stand" });
  // A corner render must not touch the screen-space canvas.
  s.drawCorner(new Proxy({} as CanvasRenderingContext2D, {
    get() { throw new Error("pixel Shippy must stay in world space"); },
  }), 14, 14, 76);
  run(s, { at: "review", pose: "lever" }, 10);
  expect(s.state).toMatchObject({ corner: "gone", world: "stand", x: STOP_X.review + 150 });
  s.update(1 / 60, { at: "corner", pose: "folded" });
  expect(s.state.world).toBe("walk");
  run(s, { at: "corner", pose: "folded" }, 10);
  expect(s.state).toMatchObject({ corner: "gone", world: "stand", x: home });
});

test("pixel mode: called back mid-walk home, he turns around on the floor instead of folding", () => {
  const s = createShippy(noArt, { reducedMotion: true, pixel: true });
  run(s, { at: "checks", pose: "lever" }, 10);
  expect(s.state).toMatchObject({ world: "stand", x: STOP_X.checks + 150 });
  run(s, { at: "corner", pose: "folded" }, 1);
  expect(s.state.world).toBe("walk");
  run(s, { at: "review", pose: "lever" }, 10);
  expect(s.state).toMatchObject({ corner: "gone", world: "stand", x: STOP_X.review + 150 });
});

test("pixel mode: home poses stay at the world-space home on the floor", () => {
  const s = createShippy(noArt, { reducedMotion: true, pixel: true });
  for (const pose of ["peek", "alarmed", "happy", "folded"] as const) {
    run(s, { at: "corner", pose }, 1);
    expect(s.state).toMatchObject({ corner: "gone", world: "stand", x: DOCK_HOME_X, pose });
  }
});

test("pixel mode: never jumps or drops through a whole busy story", () => {
  const s = createShippy(noArt, { reducedMotion: true, pixel: true });
  const views: ShippyView[] = [
    { at: "corner", pose: "peek" }, { at: "builder", pose: "walking" }, { at: "gate", pose: "alarmed" },
    { at: "corner", pose: "folded" }, { at: "review", pose: "lever" }, { at: "corner", pose: "happy" },
  ];
  for (const v of views) for (let t = 0; t < 2.5; t += 1 / 60) {
    s.update(1 / 60, v);
    expect(["drop", "leave"]).not.toContain(s.state.world);
  }
  run(s, { at: "corner", pose: "folded" }, 12);
  expect(s.state).toMatchObject({ corner: "gone", world: "stand", x: DOCK_HOME_X });
});

function pixels(s: ReturnType<typeof createShippy>) {
  const marks: { box: number[]; color: string; alpha: number }[] = [];
  const stack: number[] = [];
  const ctx = { fillStyle: '', globalAlpha: 1,
    save() { stack.push(this.globalAlpha); },
    restore() { this.globalAlpha = stack.pop() ?? 1; },
    fillRect(...box: number[]) { marks.push({box, color:this.fillStyle, alpha:this.globalAlpha}); },
  };
  s.drawWorld(ctx as unknown as CanvasRenderingContext2D);
  return marks;
}

test('waiting poses settle into identical pixels instead of fidgeting forever', () => {
  for (const pose of ['idle','inspect','alarmed','peek','carry','lever','happy','poke'] as const) {
    const s = createShippy(noArt,{pixel:true,reducedMotion:false});
    const v = {at:'review' as const,pose};
    run(s,v,12);
    const before = pixels(s);
    run(s,v,1.83);
    expect(pixels(s)).toEqual(before);
  }
});

test('pixel feet stay on the floor throughout a walk, including each gait frame', () => {
  const floor=400;
  const s=createShippy(noArt,{pixel:true,reducedMotion:false,floorAt:()=>floor});
  let samples=0;
  for(let i=0;i<240;i++) {
    s.update(1/60,{at:'review',pose:'walking'});
    if(s.state.world!=='walk'||s.state.x<DOCK_HOME_X+200)continue;
    const actor=pixels(s).filter(m=>m.alpha===1 && Math.abs(m.box[0]-s.state.x)<100);
    expect(actor.length).toBeGreaterThan(0);
    expect(Math.max(...actor.map(m=>m.box[1]+m.box[3]))).toBe(floor);
    samples++;
  }
  expect(samples).toBeGreaterThan(30);
});

test('reduced motion keeps working-pose pixels still too', () => {
  const s=createShippy(noArt,{pixel:true,reducedMotion:true});
  const v={at:'review' as const,pose:'weld' as const};
  run(s,v,12);const before=pixels(s);run(s,v,0.63);expect(pixels(s)).toEqual(before);
});
