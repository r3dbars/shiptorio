import type { Item, OreChunk } from "@shiptorio/shared";
import type { Signal } from "./sources";

const unique = (values: string[]) => [...new Set(values)].slice(-100);

/** Evidence weight only; Spark decides priority. Severity × affected users, +2/reporter,
 * +10 paying-customer evidence, with a 7-day half-life (10% floor). */
export function oreWeight(chunk: OreChunk, now: number): number {
  const age = Math.max(0, now - chunk.lastSeen);
  const decay = Math.max(0.1, 2 ** (-age / (7 * 86400000)));
  return Math.round((chunk.severity * Math.max(1, chunk.usersAffected) + 2 * chunk.reporters.length + (chunk.paying ? 10 : 0)) * decay * 100) / 100;
}

export function foldSignal(existing: Item | undefined, signal: Signal, now = Date.now()): Item {
  if (existing?.ore?.rawRefs.includes(signal.rawRef)) return existing;
  const previous = existing?.ore;
  const ore: OreChunk = {
    fingerprint: signal.fingerprint,
    count: (previous?.count ?? 0) + 1,
    firstSeen: Math.min(previous?.firstSeen ?? signal.occurredAt, signal.occurredAt),
    lastSeen: Math.max(previous?.lastSeen ?? signal.occurredAt, signal.occurredAt),
    severity: Math.max(previous?.severity ?? 0, signal.severity),
    usersAffected: (previous?.usersAffected ?? 0) + signal.usersAffected,
    reporters: unique([...(previous?.reporters ?? []), ...(signal.reporters ?? []), ...(signal.reporter ? [signal.reporter] : [])]),
    linked: previous?.linked ?? [], // only Spark link_items may add judged cross-source links
    hints: unique([...(previous?.hints ?? []), ...signal.hints, ...(signal.districtHint ? [`path:${signal.districtHint}`] : [])]),
    rawRefs: unique([...(previous?.rawRefs ?? []), signal.rawRef]),
    paying: previous?.paying || !!signal.paying,
  };
  return {
    ...existing,
    id: existing?.id ?? (signal.source === "github_issue" ? `gh-${signal.externalId}` : `${signal.source}-${encodeURIComponent(signal.externalId)}`),
    source: signal.source, title: signal.title.slice(0, 500), body: signal.body.slice(0, 16000), url: signal.url,
    kind: existing?.kind ?? signal.kindHint ?? "feature",
    district: existing?.district ?? "/", state: existing?.state ?? "ore", attempts: existing?.attempts ?? 0,
    updatedAt: now, ore, value: oreWeight(ore, now),
    customer: { usersAffected: ore.usersAffected, reporters: ore.reporters, linked: ore.linked, paying: ore.paying },
  };
}
