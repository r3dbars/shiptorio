// "See what's moving" on the simple screen (?simple=1, Justin's round 3 pick 8): once nothing needs you, the camera
// zooms out, the tray says you're all caught up, and one tap rides each piece of work in flight up the shaft, one at a
// time. This is the list it cycles through: real work on the line, the furthest along first, the newest first within a
// stage. Ore still in the mine and work already shipped aren't moving.

import type { Item } from "@shiptorio/shared";

const ALONG: Partial<Record<Item["state"], number>> = { on_pad: 0, passed: 1, inspecting: 2, rejected: 3, working: 4, queued: 5 };

export function moving(items: readonly Item[] | undefined, first?: string | null): Item[] {
  const list = (items ?? []).filter((it) => it.state in ALONG).sort((a, b) => ALONG[a.state]! - ALONG[b.state]! || b.updatedAt - a.updatedAt);
  // the work you just said yes to goes first, so the tour starts where your last card left off
  const at = first ? list.findIndex((it) => it.id === first) : -1;
  return at > 0 ? [list[at], ...list.slice(0, at), ...list.slice(at + 1)] : list;
}
