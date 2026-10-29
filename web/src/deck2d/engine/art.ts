import { art, type ArtLoader } from "../contract";

// One shared image cache. Modules ask by sprite name (contract SPRITES); nothing loads twice.
export function createArt(names: readonly string[]): ArtLoader {
  const imgs = new Map<string, HTMLImageElement>();
  const loads: Promise<void>[] = [];
  const add = (name: string) => {
    if (imgs.has(name)) return;
    const im = new Image();
    im.decoding = "async";
    im.src = art(name);
    // decode() unpacks the picture off the main thread, so the first frame's drawImage doesn't stall on it
    loads.push(im.decode().catch(() => undefined));
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
