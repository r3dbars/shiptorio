import { expect, test } from "bun:test";
import { createMachineRehearsal, MACHINE_ORDER } from "../src/deck2d/stations/rehearsal";

test("each machine can be inspected in idle, working and blocked states without activating its neighbors", () => {
  const src = createMachineRehearsal();
  for (const id of MACHINE_ORDER) {
    src.select(id);
    for (const mode of ["idle", "working", "jammed"] as const) {
      src.setMode(mode);
      const v = src.view();
      expect(v.stops.find(s => s.id === id)?.state).toBe(mode);
      expect(v.stops.filter(s => s.id !== id).every(s => s.state === "idle")).toBe(true);
      expect(v.jam).toBe(mode === "jammed" ? id : null);
      expect(v.shipped).toBe(0);
      expect(v.card).toBeNull();
    }
  }
});

test("the sequence demonstrates a block and recovery on every machine, one at a time", () => {
  const src = createMachineRehearsal(); src.cycling = true;
  for (const id of MACHINE_ORDER) {
    expect(src.machine).toBe(id);
    expect(src.mode).toBe("idle");
    src.step?.(3); expect(src.mode).toBe("working");
    src.step?.(6); expect(src.view().jam).toBe(id);
    src.frozen = true; src.step?.(100); expect(src.view().jam).toBe(id);
    src.frozen = false; src.step?.(4); expect(src.mode).toBe("working"); expect(src.view().jam).toBeNull();
    src.step?.(3);
  }
  expect(src.machine).toBe("repo");
  src.setMode("jammed"); src.step?.(100); expect(src.mode).toBe("jammed"); expect(src.cycling).toBe(false);
});
