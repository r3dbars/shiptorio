// Frame the actual machine layout in an orthographic camera, including vertical lanes.
// The phone gets a closer fit; extra sky should not make a short line microscopic.
import type { Machine } from '@shiptorio/shared';
const CELL = 1.8, YAW = Math.PI / 4, TILT = Math.PI / 6;
export function lineFrame(machines: readonly Pick<Machine, 'x' | 'y'>[], width: number, height: number, baseHeight: number) {
  if (!machines.length) return null;
  const xs = machines.map(m => m.x * CELL), zs = machines.map(m => m.y * CELL);
  const x = (Math.min(...xs) + Math.max(...xs)) / 2, z = (Math.min(...zs) + Math.max(...zs)) / 2;
  const horizontal = machines.map(m => m.x * CELL * Math.cos(YAW) - m.y * CELL * Math.sin(YAW));
  const vertical = machines.map(m => (m.x * CELL * Math.sin(YAW) + m.y * CELL * Math.cos(YAW)) * Math.sin(TILT));
  const spanX = Math.max(...horizontal) - Math.min(...horizontal) + 6;
  const spanY = Math.max(...vertical) - Math.min(...vertical) + 7;
  const freeWidth = Math.max(1, width - 32) / Math.max(1, height);
  const freeHeight = height <= 500 ? 0.72 : width <= 760 ? 0.56 : 0.7;
  return { x, z, zoom: Math.max(0.4, spanX / (baseHeight * freeWidth), spanY / (baseHeight * freeHeight)) };
}
