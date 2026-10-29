// HTTP feature configuration stays outside the factory websocket contract.
export let introEnabled = true;
/** docs/ATTENTION.md: the calm Needs you tray. Server flag "attention", or ?attention=1 / ?attention=0 to try it. */
export let attentionEnabled = true;
const attentionParam = () => new URLSearchParams(location.search).get("attention");
export const attentionOn = () => { const p = attentionParam(); return p === null ? attentionEnabled : p !== "0"; };
/** New features ship ON on dev (Justin, 2026-10-28: "everything just pushed into dev, I can experiment with it all").
 * shiptorio.dev turns every preview feature on with no URL flags; shiptorio.com keeps its defaults until a promotion
 * flips them. ?preview=1 / ?preview=0 picks either set on any host (localhost, e2e). docs/context/branches.md */
const PREVIEW_HOSTS = ["shiptorio.dev", "www.shiptorio.dev"];
export function previewOn(search = globalThis.location?.search ?? "", host = globalThis.location?.hostname ?? ""): boolean {
  const p = new URLSearchParams(search).get("preview");
  return p === "1" ? true : p === "0" ? false : PREVIEW_HOSTS.includes(host);
}
/** A preview feature: ?name=1 forces it on, ?name=0 off (for debugging), otherwise on exactly where previewOn(). */
export function feature(name: string, search = globalThis.location?.search ?? "", host = globalThis.location?.hostname ?? ""): boolean {
  const p = new URLSearchParams(search).get(name);
  return p === "1" ? true : p === "0" ? false : previewOn(search, host);
}
/** The simple screen (thread "Simplify the whole game UI", 2026-10-28): one slow-spot line, one task tray that flies the
 * camera to each ask, and a quiet map with no labels. A preview feature: ?simple=1 / ?simple=0. */
export const simpleOn = () => feature("simple");
/** Build as you go (web/src/buildout/CONTRACT.md): the first run starts dark and empty, every piece built in front of
 * you. A preview feature (?buildout=1 / ?buildout=0), but the simple screen has no tour (docs/SIMPLE-UI.md, journey
 * pick 1: learn by doing), so it only plays with ?simple=0. */
export const buildoutOn = () => feature("buildout") && !simpleOn();
/** The pixel-art deck (docs/PIXEL-PLAN.md) is THE deck (Justin, 2026-10-29). The old painted look stays reachable
 * only with ?px=0. */
export const pixelOn = (search = globalThis.location?.search ?? "") => new URLSearchParams(search).get("px") !== "0";
export async function loadFeatureFlags(): Promise<void> {
  // Explicit simulator URLs work offline and never depend on the backend.
  if (new URLSearchParams(location.search).get("source") === "sim") return;
  try {
    const response = await fetch("/api/flags", { signal: AbortSignal.timeout(2000) });
    if (!response.ok) return;
    const flags = await response.json();
    if (typeof flags.intro === "boolean") introEnabled = flags.intro;
    if (typeof flags.attention === "boolean") attentionEnabled = flags.attention;
  } catch { /* Keep the simulator's existing welcome behavior when offline. */ }
}
