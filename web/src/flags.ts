// Shared preview policy and the pixel deck rendering switch.
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
/** The pixel-art deck (docs/context/pixel-deck.md) is THE deck (Justin, 2026-10-29). The old painted look stays reachable
 * only with ?px=0. */
export const pixelOn = (search = globalThis.location?.search ?? "") => new URLSearchParams(search).get("px") !== "0";
