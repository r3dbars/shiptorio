// Builds hull widths off the main thread (props/index.ts warmNext): the deck grows a column at a time and each column is
// a fresh hull, too slow to make on a phone mid-animation. Pure pixels in, transferred pixels out.
import { hullPixels } from "./hull";

self.onmessage = (e: MessageEvent<number>) => {
  const p = hullPixels(e.data);
  (self as unknown as Worker).postMessage(p, [p.rgba.buffer as ArrayBuffer, p.bottom.buffer as ArrayBuffer]);
};
