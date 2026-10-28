import { art, type ArtLoader } from "../contract";

// One shared image cache. Modules ask by sprite name (contract SPRITES); nothing loads twice.
export function createArt(names: readonly string[]): ArtLoader {
  const imgs = new Map<string, HTMLImageElement>();
  const loads: Promise<void>[] = [];
  const add = (name: string) => {
    if (imgs.has(name)) return;
    const im = new Image();
    im.decoding = "async";
    loads.push(new Promise((done) => { im.onload = im.onerror = () => done(); }));
    im.src = art(name);
    imgs.set(name, im);
  };
  names.forEach(add);
  return {
    get(name) {
      if (!imgs.has(name)) add(name);
      const im = imgs.get(name)!;
      return im.complete && im.naturalWidth > 0 ? im : null;
    },
    ready: () => Promise.all(loads).then(() => undefined),
  };
}
