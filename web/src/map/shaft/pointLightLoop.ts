// Three must unroll sampler-array indices for shadow-casting point lights. The
// shaft's ordinary lamps have no shadow samplers: retaining their bounded loop
// avoids compiling thirteen copies of the legacy lighting equation on recovery.
export function compactPointLightLoop(source: string): string {
  if (source.includes("#if defined( IRON_LEGACY ) && ( NUM_POINT_LIGHT_SHADOWS == 0 )")) return source;
  const loop = /\t#pragma unroll_loop_start\n\tfor \( int i = 0; i < NUM_POINT_LIGHTS; i \+\+ \) \{[\s\S]*?\t#pragma unroll_loop_end/;
  return source.replace(loop, original => {
    const compact = original.replace(/\t#pragma unroll_loop_(start|end)/g, "");
    return `#if defined( IRON_LEGACY ) && ( NUM_POINT_LIGHT_SHADOWS == 0 )\n${compact}\n#else\n${original}\n#endif`;
  });
}
