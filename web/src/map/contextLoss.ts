import { WebGLRenderer, type Object3D, type Mesh } from 'three';
import { ProgramLinks } from './programLinks';

export const SCENE_REBUILD = 'shiptorio:scene-rebuild';
export const RENDER_CRASH = 'shiptorio:render-crash';

/** React cannot catch exceptions raised by an animation frame. */
export function guardRender(frame: () => void): () => void {
  let failed = false;
  return () => {
    if (failed) return;
    try { frame(); } catch {
      failed = true;
      window.dispatchEvent(new Event(RENDER_CRASH));
    }
  };
}

/** CPU-side geometry survives a loss; force material programs back through compilation. */
export function restoreMaterials(root: Object3D) {
  root.traverse(object => {
    const material = (object as Mesh).material;
    for (const entry of Array.isArray(material) ? material : material ? [material] : []) entry.needsUpdate = true;
  });
}

/** Three rebuilds its renderer internals first; the owner then recreates GPU resources. */
export function recoverContext(canvas: HTMLCanvasElement, redraw: () => void, discard: () => void = () => {}): WebGLRenderer {
  const renderer = new WebGLRenderer({ canvas, antialias: false });
  let timer: ReturnType<typeof setTimeout> | undefined;
  let lost = false;
  let dead = false;
  let failed = false;
  const links = new ProgramLinks();
  const gl = renderer.getContext(), useProgram = gl.useProgram;
  const used = new Set<WebGLProgram>();
  // Three queries compiler logs even after successful compilation. Keep failure
  // detection, but validate newly used programs after their uniforms are ready.
  renderer.debug.checkShaderErrors = false;
  const trackProgram: typeof gl.useProgram = (program) => {
    useProgram.call(gl, program);
    if (program) used.add(program);
  };
  gl.useProgram = trackProgram;
  const fail = () => {
    if (dead || failed) return;
    failed = true;
    window.dispatchEvent(new Event(RENDER_CRASH));
  };
  const onLost = (event: Event) => {
    event.preventDefault();
    if (dead || lost) return;
    lost = true;
    links.reset(); used.clear();
    discard();
    timer = setTimeout(() => {
      timer = undefined;
      if (!dead && lost) canvas.dispatchEvent(new Event(SCENE_REBUILD));
    }, 3000);
  };
  const onRestored = () => {
    if (dead || !lost) return;
    lost = false;
    links.reset(); used.clear();
    clearTimeout(timer);
    timer = undefined;
    try { redraw(); } catch { fail(); }
  };
  canvas.addEventListener('webglcontextlost', onLost);
  canvas.addEventListener('webglcontextrestored', onRestored);

  // Animation-frame errors are outside React's render lifecycle. Hand them to its boundary.
  const render = renderer.render.bind(renderer);
  renderer.render = (...args) => {
    if (dead || lost || failed) return;
    try {
      render(...args);
      for (const program of used) if (!links.valid(gl, program)) { fail(); break; }
      used.clear();
    } catch { used.clear(); fail(); }
  };
  const dispose = renderer.dispose.bind(renderer);
  renderer.dispose = () => {
    dead = true;
    if (gl.useProgram === trackProgram) gl.useProgram = useProgram;
    links.reset(); used.clear();
    clearTimeout(timer);
    canvas.removeEventListener('webglcontextlost', onLost);
    canvas.removeEventListener('webglcontextrestored', onRestored);
    dispose();
  };
  return renderer;
}
