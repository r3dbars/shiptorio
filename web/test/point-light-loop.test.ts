import { expect, test } from "bun:test";
import upstreamLights from "three/src/renderers/shaders/ShaderChunk/lights_fragment_begin.glsl.js";
import { compactPointLightLoop } from "../src/map/shaft/pointLightLoop";

const point = /\t#pragma unroll_loop_start\n\tfor \( int i = 0; i < NUM_POINT_LIGHTS; i \+\+ \) \{[\s\S]*?\t#pragma unroll_loop_end/;
test("only legacy point lights without shadow samplers use the compact lighting loop", () => {
  const source = upstreamLights; // Immutable upstream fixture: other scene tests may already patch ShaderChunk.
  const original = source.match(point)?.[0];
  expect(original).toBeDefined(); // An upstream chunk change needs review, not a silent ineffective patch.
  const result = compactPointLightLoop(source);
  expect(compactPointLightLoop(result)).toBe(result);
  const start = result.indexOf("#if defined( IRON_LEGACY ) && ( NUM_POINT_LIGHT_SHADOWS == 0 )");
  expect(start).toBeGreaterThan(-1);
  const split = result.indexOf("\n#else\n", start);
  const end = result.indexOf("\n#endif", split + 7);
  const compact = result.slice(start, split);
  expect(compact).not.toContain("#pragma unroll_loop");
  // In this outer NUM_POINT_LIGHT_SHADOWS==0 branch the retained shadow block
  // is preprocessor-dead (undefined UNROLLED_LOOP_INDEX is 0, and 0<0 is false).
  expect(compact).toContain("UNROLLED_LOOP_INDEX < NUM_POINT_LIGHT_SHADOWS");
  expect(compact).toContain("pointLight = pointLights[ i ]");
  expect(compact).toContain("getPointLightInfo( pointLight, geometryPosition, directLight )");
  expect(compact).toContain("RE_Direct( directLight, geometryPosition");
  // The complete original path, including all point shadows, remains byte-for-byte.
  expect(result.slice(split + 7, end)).toBe(original);
  expect(result.slice(0, start) + original + result.slice(end + 7)).toBe(source);
});

test("an unrelated or changed shader chunk is left alone", () => {
  expect(compactPointLightLoop("void main() {}" )).toBe("void main() {}");
});
