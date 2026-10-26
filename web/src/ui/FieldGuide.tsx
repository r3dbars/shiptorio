// The field guide: every concept the game teaches, in chapters. What you've met reads in full; what's
// still ahead shows as ??? with a hint of how to find it. It's the latent complexity, visible but quiet:
// nobody reads a manual, but everyone fills a collection.

import type { FactoryState } from "@shiptorio/shared";
import { CONCEPT_ICON, LESSONS } from "./tutorial";
import { Icon } from "./icons";
import { GUIDE, WORDS } from "../copy";

interface Entry {
  id: string;
  title: string;
  text: string;
  hint: string; // how to unlock it, shown while it's ???
  met?: (s: FactoryState) => boolean; // for concepts no lesson teaches yet
}

const lesson = (id: string): Entry => {
  const l = LESSONS.find((x) => x.id === id)!;
  return { id, title: l.title, text: l.text, hint: GUIDE.hint[id] };
};
const extra = (id: keyof typeof GUIDE.extra, met?: Entry["met"]): Entry => ({ id, ...GUIDE.extra[id], met });

const CHAPTERS: { name: string; entries: Entry[] }[] = [
  {
    name: GUIDE.chapters.first,
    entries: [lesson("island"), lesson("machines"), lesson("power"), lesson("ore"), lesson("inspect"), lesson("pad"), lesson("rocket")],
  },
  { name: GUIDE.chapters.bottlenecks, entries: [lesson("bottleneck"), lesson("checkin")] },
  {
    name: GUIDE.chapters.ore,
    entries: [
      extra("sentry", (s) => s.items.some((i) => i.source === "sentry") || !!s.sources?.some((x) => x.kind === "sentry" && x.state === "connected")),
      extra("feedback", (s) => s.items.some((i) => i.source === "inbox")),
      extra("users"),
    ],
  },
  {
    name: GUIDE.chapters.automate,
    entries: [
      extra("station", (s) => (s.stations?.length ?? 0) > 1),
      lesson("autonomy"),
      extra("permit", (s) => !!s.autonomy?.districts.some((d) => d.permit)),
      extra("lights", (s) => s.autonomy?.level === "lights_out"),
    ],
  },
];

export const GUIDE_TOTAL = CHAPTERS.reduce((n, c) => n + c.entries.length, 0);

export function guideMet(state: FactoryState | null, learned: string[]) {
  const met = new Set(learned);
  if (state) for (const c of CHAPTERS) for (const e of c.entries) if (e.met?.(state)) met.add(e.id);
  return met;
}

export function FieldGuide({ met, onClose }: { met: Set<string>; onClose: () => void }) {
  const n = CHAPTERS.reduce((k, c) => k + c.entries.filter((e) => met.has(e.id)).length, 0);
  return (
    <section className="card sheet guide" aria-label={GUIDE.title}>
      <div className="sheet-top">
        <h2>
          {GUIDE.title} <small>{n}/{GUIDE_TOTAL}</small>
        </h2>
        <button type="button" className="hud-iconbtn" onClick={onClose} aria-label={WORDS.close}>
          <Icon name="cross" size={14} />
        </button>
      </div>
      {CHAPTERS.map((c) => (
        <div key={c.name}>
          <h3>{c.name}</h3>
          <div className="guide-grid">
            {c.entries.map((e) =>
              met.has(e.id) ? (
                <div key={e.id} className="gitem">
                  <b>
                    <Icon name={CONCEPT_ICON[e.id] ?? "star"} size={16} />
                    {e.title}
                  </b>
                  <span>{e.text.replace("{repo}", WORDS.yourRepo)}</span>
                </div>
              ) : (
                <div key={e.id} className="gitem lock">
                  <b>
                    <Icon name="lock" size={16} />
                    {GUIDE.locked}
                  </b>
                  <span>{e.hint}</span>
                </div>
              ),
            )}
          </div>
        </div>
      ))}
    </section>
  );
}
