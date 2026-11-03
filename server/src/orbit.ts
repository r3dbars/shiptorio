// Orbit watch (docs/LOOP.md, station 5): checks don't stop at merge. For 24 hours after a launch, orbit watch
// looks at the real world. A comeback trips it: the same Sentry error fires again, new Sentry errors spike on
// the folder the fix touched, a revert PR merges into the tracked branch, or CI/deploy goes red on the merge commit.
// A trip scars the item, puts it back on the rework belt and costs its lane the launch permit.
// Pure rules; the Factory DO wires them to webhooks and storage.

import type { FactoryState, Item, OrbitSignal, ScarTag, Station } from "@shiptorio/shared";

export const ORBIT_ID = "orbit-1";
export const WATCH_MS = 24 * 3600_000;
/** Events in one new Sentry error on the watched folder before it counts as a spike, not noise. */
export const SPIKE = 3;
/** The fix isn't live the second it merges. Errors in the first minutes are from the old deploy. */
export const DEPLOY_GRACE_MS = 15 * 60_000;

/** A rocket launched: orbit watch starts its 24h clock. */
export function startWatch(item: Item, now = Date.now(), mergeSha?: string): Item {
  return { ...item, orbit: { since: now, until: now + WATCH_MS, mergeSha, state: "watching", prNumber: item.prNumber } };
}

export const isWatching = (item: Item, now = Date.now()): boolean =>
  item.state === "launched" && item.orbit?.state === "watching" && now < item.orbit.until;

/** Launches whose 24h ran out with no comeback. Returns the items marked clear. */
export function expired(items: Item[], now = Date.now()): Item[] {
  return items
    .filter((i) => i.state === "launched" && i.orbit?.state === "watching" && now >= i.orbit.until)
    .map((i) => ({ ...i, orbit: { ...i.orbit!, state: "clear" as const, at: now } }));
}

const ago = (ms: number) => (ms < 3600_000 ? `${Math.max(1, Math.round(ms / 60_000))}m` : `${Math.round(ms / 3600_000)}h`);

/**
 * Orbit watch caught a comeback. The item gets an orbit scar and rides the rework belt: it needs a new PR from a
 * fresh branch (the old one is merged), and it gets a fresh set of attempts since this is a new round.
 */
export function regress(item: Item, signal: OrbitSignal, what: string, evidenceUrl: string | undefined, now = Date.now()): Item {
  const watch = item.orbit!;
  const reason = `${what} ${ago(now - watch.since)} after #${watch.prNumber ?? item.prNumber} launched`.slice(0, 500);
  const strike = (item.scars ?? []).filter((s) => s.station === "orbit").length + 1;
  const scar: ScarTag = { station: "orbit", reason, evidenceUrl: evidenceUrl ?? item.prUrl, strike, at: now };
  return {
    ...item,
    state: "rejected",
    failure: reason,
    machineId: ORBIT_ID,
    attempts: 0,
    branch: undefined,
    prNumber: undefined,
    prUrl: undefined,
    inspection: undefined,
    scars: [...(item.scars ?? []), scar],
    orbit: { ...watch, state: "regressed", signal, reason, evidenceUrl, at: now },
    updatedAt: now,
  };
}

/** The PR a revert PR undoes. GitHub's revert button writes "Reverts owner/repo#12" in the body. */
export function revertedPr(pr: { title?: string; body?: string | null }, repo: string): number | null {
  if (!/^revert\b/i.test(pr.title ?? "")) return null;
  const m = (pr.body ?? "").match(/\breverts\s+([\w.-]+\/[\w.-]+)?#(\d+)/i);
  if (!m || (m[1] && m[1].toLowerCase() !== repo.toLowerCase())) return null;
  return Number(m[2]);
}

/** The watched launch a revert PR undoes. */
export const watchForRevert = (items: Item[], prNumber: number, now = Date.now()): Item | undefined =>
  items.find((i) => isWatching(i, now) && i.orbit!.prNumber === prNumber);

/** The watched launch whose merge commit a failed check ran on. */
export const watchForSha = (items: Item[], sha: string, now = Date.now()): Item | undefined =>
  items.find((i) => isWatching(i, now) && !!i.orbit!.mergeSha && i.orbit!.mergeSha === sha);

/**
 * The watched launch a Sentry error points at. The same error coming back is a comeback straight away. A new
 * error on the folder a fix just touched counts once it spikes (SPIKE events), so one stray event doesn't trip it.
 */
export function watchForSentry(items: Item[], ore: Item, comeback: boolean, occurredAt: number, now = Date.now()): Item | undefined {
  if (comeback) return isWatching(ore, now) && occurredAt >= ore.orbit!.since + DEPLOY_GRACE_MS ? ore : undefined;
  if (ore.source !== "sentry" || ore.district === "/" || (ore.ore?.count ?? 0) < SPIKE) return undefined;
  return items
    .filter((i) => i.id !== ore.id && isWatching(i, now) && i.district === ore.district && (ore.ore?.firstSeen ?? 0) >= i.orbit!.since + DEPLOY_GRACE_MS)
    .sort((a, b) => b.orbit!.since - a.orbit!.since)[0];
}

/** The orbit watch station for the map and its panel. */
export function orbitStation(s: FactoryState, now = Date.now()): Station {
  const watched = s.items.filter((i) => isWatching(i, now));
  const done = s.items.filter((i) => i.orbit && i.orbit.state !== "watching" && i.orbit.at);
  const clear = done.filter((i) => i.orbit!.state === "clear").length;
  const last = [...done].sort((a, b) => b.orbit!.at! - a.orbit!.at!)[0];
  const ref = (i: Item) => `#${i.orbit!.prNumber ?? i.prNumber}`;
  return {
    id: ORBIT_ID,
    kind: "orbit",
    name: "Orbit watch",
    machineId: ORBIT_ID,
    wip: watched.length,
    oldestWaitMs: watched.length ? Math.max(0, now - Math.min(...watched.map((i) => i.orbit!.since))) : undefined,
    passRate: done.length ? clear / done.length : undefined,
    caughtThisWeek: s.items.reduce((n, i) => n + (i.scars ?? []).filter((sc) => sc.station === "orbit").length, 0),
    lastLog: last
      ? last.orbit!.state === "regressed"
        ? { who: "Orbit watch", text: `${ref(last)}: ${last.orbit!.reason}`.slice(0, 200), ok: false }
        : { who: "Orbit watch", text: `${ref(last)} held 24h: no comeback.`, ok: true }
      : undefined,
    actions: [],
  };
}
