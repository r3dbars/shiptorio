// Redirects remain local after browser URL normalization, including control characters.
export function sameOriginPath(next: string | null | undefined, origin: string): string {
  if (!next || !/^\/(?![/\\])/.test(next) || /[\\\u0000-\u0020\u007f]/.test(next)) return "/";
  try {
    return new URL(next, origin).origin === new URL(origin).origin ? next : "/";
  } catch { return "/"; }
}

// One front door: the 2D deck. The old React app is gone, so "/" always 302s there (after the access gate; on
// shiptorio.com a visitor without access still gets the landing page first). Explicit demos (?source=sim,
// ?source=replay, ?scenario=) keep their query on /deck; everything else lands on the live deck. ?px=0 is dropped.
// DECK_HOSTS is where the deck is public without the password (access.ts isPublicDeck).
export const DECK_HOSTS = new Set(["shiptorio.dev", "www.shiptorio.dev"]);
// The old app's own switches; they mean nothing to the deck.
const OLD_APP_KEYS = ["onboard", "tour", "world", "simple", "buildout", "artpass", "intro", "px", "connect"];
export function deckFrontDoor(url: URL): string | null {
  const q = new URLSearchParams(url.search);
  if (url.pathname === "/deck" || url.pathname === "/deck.html") {
    if (q.get("px") !== "0") return null;
    q.delete("px");
    return `/deck${q.size ? `?${q}` : ""}`;
  }
  if (url.pathname !== "/") return null;
  const source = q.get("source");
  if (source ? source !== "live" : q.has("scenario")) {
    for (const key of OLD_APP_KEYS) q.delete(key);
    return `/deck?${q}`;
  }
  const repo = q.get("repo");
  return `/deck?source=live${repo ? `&repo=${encodeURIComponent(repo)}` : ""}`;
}
