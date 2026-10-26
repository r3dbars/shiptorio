// The field guide: every concept the game teaches, in chapters. What you've met reads in full; what's
// still ahead shows as ??? with a hint of how to find it. It's the latent complexity, visible but quiet:
// nobody reads a manual, but everyone fills a collection.

import type { FactoryState } from "@shiptorio/shared";
import { LESSONS } from "./tutorial";
import { Icon } from "./icons";

interface Entry {
  id: string;
  title: string;
  text: string;
  hint: string; // how to unlock it, shown while it's ???
  met?: (s: FactoryState) => boolean; // for concepts no lesson teaches yet
}

const lesson = (id: string, hint: string): Entry => {
  const l = LESSONS.find((x) => x.id === id)!;
  return { id, title: l.title, text: l.text, hint };
};

const CHAPTERS: { name: string; entries: Entry[] }[] = [
  {
    name: "First rocket",
    entries: [
      lesson("island", "Pick a repo"),
      lesson("machines", "Build your starter line"),
      lesson("power", "Plug in Claude or ChatGPT"),
      lesson("ore", "Wait for work to arrive"),
      lesson("inspect", "Make your first PR"),
      lesson("pad", "Pass every check"),
      lesson("rocket", "Merge a PR"),
    ],
  },
  { name: "Bottlenecks", entries: [lesson("bottleneck", "Ship once"), lesson("checkin", "Let a few things wait on you")] },
  {
    name: "More ore",
    entries: [
      { id: "sentry", title: "Biters", text: "Sentry errors attack the folder they hit. Fixes that kill biters score big.", hint: "Connect Sentry", met: (s) => s.items.some((i) => i.source === "sentry") || !!s.sources?.some((x) => x.kind === "sentry" && x.state === "connected") },
      { id: "feedback", title: "Feedback", text: "Customer emails arrive as ore at the well, linked to the errors they describe.", hint: "Forward your support inbox", met: (s) => s.items.some((i) => i.source === "inbox") },
      { id: "users", title: "Users", text: "PostHog shows how many real users each fix reached.", hint: "Connect PostHog" },
    ],
  },
  {
    name: "Verify, then automate",
    entries: [
      { id: "station", title: "Stations", text: "Add checks to the gauntlet. Every check makes a yes safer.", hint: "Ship a few PRs", met: (s) => (s.stations?.length ?? 0) > 1 },
      lesson("autonomy", "Approve suggestions as-is"),
      { id: "permit", title: "Launch permits", text: "A folder that keeps shipping clean earns the right to ship on its own.", hint: "Build trust in one folder", met: (s) => !!s.autonomy?.districts.some((d) => d.permit) },
      { id: "lights", title: "Lights out", text: "The factory runs overnight within your budget. You get a morning review.", hint: "Earn permits on most folders", met: (s) => s.autonomy?.level === "lights_out" },
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
    <section className="card sheet guide" aria-label="Field guide">
      <div className="sheet-top">
        <h2>
          Field guide <small>{n}/{GUIDE_TOTAL}</small>
        </h2>
        <button type="button" className="hud-iconbtn" onClick={onClose} aria-label="Close">
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
                  <b>{e.title}</b>
                  <span>{e.text.replace("{repo}", "your repo")}</span>
                </div>
              ) : (
                <div key={e.id} className="gitem lock">
                  <b>???</b>
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
