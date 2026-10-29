import { ART_PX, PALETTE as C, STOP_X } from "../contract";

export const DOCK_HOME_X = Math.max(160, STOP_X.repo - 450);

export const chargeLevel = (level: number, dt: number, docked: boolean) =>
  Math.max(0.12, Math.min(1, level + Math.max(0, dt) * (docked ? 1 / 7 : -1 / 24)));

/** A low charging plate on the front walkway, fed from the cyan conduit under the deck. */
export function drawChargingDock(ctx: CanvasRenderingContext2D, home: number, floor: number, level: number, docked: boolean, time: number, still: boolean) {
  const x = Math.round(home / ART_PX), y = Math.round(floor / ART_PX);
  const rect = (dx: number, dy: number, w: number, h: number, color: string) => {
    ctx.fillStyle = color; ctx.fillRect((x + dx) * ART_PX, (y + dy) * ART_PX, w * ART_PX, h * ART_PX);
  };
  // Shielded cable drops over the front lip, then turns onto the dock.
  rect(-22, 2, 4, 17, C.soot[0]); rect(-21, 3, 2, 15, C.iron[2]);
  rect(-21, 2, 9, 4, C.soot[0]); rect(-20, 3, 8, 2, C.energy[0]);
  rect(-20, 4, 1, 13, C.energy[0]); rect(-19, 3, 7, 1, C.energy[1]);
  for (const y of [7, 14]) { rect(-22, y, 4, 1, C.iron[3]); rect(-19, y, 1, 1, C.brass[2]); }
  if (docked && level < 1) {
    const pulse = still ? 7 : Math.floor(time * 4) % 13;
    rect(-20, 4 + pulse, 1, 2, C.energy[1]);
  }
  // Receding top, black edge, and a substantial front face.
  rect(-16, 5, 30, 3, C.iron[0]);
  rect(-15, -2, 30, 8, C.soot[0]); rect(-13, -3, 26, 2, C.iron[3]);
  rect(-14, -1, 28, 5, C.iron[2]); rect(-12, 0, 24, 3, C.steel[0]);
  rect(-14, 4, 28, 3, C.iron[0]); rect(-13, 4, 26, 1, C.steel[2]);
  rect(7, -2, 6, 1, C.steel[3]);
  for (const side of [-12, 10]) {
    rect(side, 0, 2, 3, docked ? C.energy[1] : C.energy[0]);
    rect(side, 5, 2, 1, C.brass[2]);
  }
  for (let i = 0; i < 4; i++) rect(-8 + i * 5, 1, 2, 1, C.steel[2]);
  // Four recessed battery cells in the front fascia; no separate tower competing with the line.
  rect(-8, 4, 17, 3, C.soot[0]);
  const bars = Math.floor(level * 4 + 0.00001);
  for (let i = 0; i < 4; i++) rect(-7 + i * 4, 5, 3, 1, i < bars ? docked && level < 1 ? C.energy[2] : C.energy[1] : C.energy[0]);
  rect(11, 5, 1, 1, level >= 1 ? C.energy[2] : C.iron[3]);
}
