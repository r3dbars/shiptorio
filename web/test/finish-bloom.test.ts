import { expect, test } from "bun:test";
import type { ShaderMaterial, Vector2 } from "three";
import { FinishPass } from "../src/map/shaft/finish";

// The Bayer noise has sixteen phases. Factoring its rotation must preserve every
// sample of both existing bloom patterns; this is not a lower-tap quality tier.
test("precomputed bloom directions preserve all Bayer-rotated 12- and 8-tap samples", () => {
  const finish = new FinishPass({});
  try {
    for (const taps of [12, 8] as const) {
      finish.setBloomTaps(taps);
      const material = (finish as unknown as { material: ShaderMaterial }).material;
      const directions = material.uniforms.bloomDirections.value as Vector2[];
      expect(directions.length).toBe(taps);
      for (let phase = 0; phase < 16; phase++) {
        const a = phase / 16 * 6.2832 / taps;
        for (let i = 0; i < taps; i++) {
          const b = directions[i];
          const x = b.x * Math.cos(a) - b.y * Math.sin(a);
          const y = b.x * Math.sin(a) + b.y * Math.cos(a);
          expect(x).toBeCloseTo(Math.cos((i + phase / 16) * 6.2832 / taps), 12);
          expect(y).toBeCloseTo(Math.sin((i + phase / 16) * 6.2832 / taps), 12);
        }
      }
    }
  } finally { finish.dispose(); }
});
