import { WebGLRenderer } from 'three';

export const SCENE_REBUILD = 'shiptorio:scene-rebuild';
export const RENDER_CRASH = 'shiptorio:render-crash';

/** Three rebuilds its renderer internals first; the owner then recreates GPU resources. */
export function recoverContext(canvas: HTMLCanvasElement, redraw: () => void): WebGLRenderer {
  const renderer = new WebGLRenderer({ canvas, antialias: false });
  let timer: ReturnType<typeof setTimeout> | undefined;
  let lost = false;
  let dead = false;
  let failed = false;
  const fail = () => {
    if (dead || failed) return;
    failed = true;
    window.dispatchEvent(new Event(RENDER_CRASH));
  };
  const onLost = (event: Event) => {
    event.preventDefault();
    if (dead || lost) return;
    lost = true;
    timer = setTimeout(() => {
      timer = undefined;
      if (!dead && lost) canvas.dispatchEvent(new Event(SCENE_REBUILD));
    }, 3000);
  };
  const onRestored = () => {
    if (dead || !lost) return;
    lost = false;
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
    try { render(...args); } catch { fail(); }
  };
  const dispose = renderer.dispose.bind(renderer);
  renderer.dispose = () => {
    dead = true;
    clearTimeout(timer);
    canvas.removeEventListener('webglcontextlost', onLost);
    canvas.removeEventListener('webglcontextrestored', onRestored);
    dispose();
  };
  return renderer;
}
