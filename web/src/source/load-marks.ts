// Fixed names only: no account, repository, card text or payload enters performance traces.
export type LoadMark = "entry" | "me-response" | "modules-ready" | "art-ready" | "socket-start" | "socket-open" | "snapshot" | "deck-frame" | "first-card" | "live-frame" | "live-card";
export function loadMark(name: LoadMark): void {
  const key = `shiptorio:${name}`;
  if (typeof performance !== "undefined" && !performance.getEntriesByName(key).length) performance.mark(key);
}
