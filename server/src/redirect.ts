// Redirects remain local after browser URL normalization, including control characters.
export function sameOriginPath(next: string | null | undefined, origin: string): string {
  if (!next || !/^\/(?![/\\])/.test(next) || /[\\\u0000-\u0020\u007f]/.test(next)) return "/";
  try {
    return new URL(next, origin).origin === new URL(origin).origin ? next : "/";
  } catch { return "/"; }
}

// shiptorio.dev has one front door: the 2D deck. Bare visits, sign-in returns ("/" or an old "/?onboard=..."),
// the old live map and ?px=0 all 302 there; nothing is deleted, so old links never 404. Explicit demos
// (?source=sim, ?source=replay, ?scenario=), /judge and every other path keep their own URL. shiptorio.com is unchanged.
export const DECK_HOSTS = new Set(["shiptorio.dev", "www.shiptorio.dev"]);
export function deckFrontDoor(url: URL): string | null {
  if (!DECK_HOSTS.has(url.hostname)) return null;
  const q = new URLSearchParams(url.search);
  if (url.pathname === "/deck" || url.pathname === "/deck.html") {
    if (q.get("px") !== "0") return null;
    q.delete("px");
    return `/deck${q.size ? `?${q}` : ""}`;
  }
  if (url.pathname !== "/") return null;
  const source = q.get("source");
  if (source ? source !== "live" : q.has("scenario")) return null;
  const repo = q.get("repo");
  return `/deck?source=live${repo ? `&repo=${encodeURIComponent(repo)}` : ""}`;
}
