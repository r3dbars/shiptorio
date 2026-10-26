// The empire (VISION: "the factory must grow"): every repo you connect is its own island. The one
// you're playing is the main island; the rest float nearby as satellites on the map, tied to it by
// sky rails. The island chip in the top bar opens the overview: the camera pulls back over every
// island, and a sheet rolls them up (shipped, automated, waiting on you, the most stuck island).
//
// Behind a flag while Justin looks at it: ?empire=1 turns it on (and remembers), ?empire=0 off.

import { useEffect, useMemo, useState } from "react";
import { rollup, stuckScore, summarizeIsland, type FactoryState, type IslandSummary } from "@shiptorio/shared";
import type { SourceConfig } from "../source";
import type { SatelliteSpec } from "../map/empire";
import { Icon } from "./icons";

const FLAG_KEY = "shiptorio:empire";

export function empireOn(search = location.search): boolean {
  const v = new URLSearchParams(search).get("empire");
  try {
    if (v === "1") localStorage.setItem(FLAG_KEY, "1");
    if (v === "0") localStorage.removeItem(FLAG_KEY);
    return v === "1" || (v !== "0" && localStorage.getItem(FLAG_KEY) === "1");
  } catch {
    return v === "1";
  }
}

export const shortName = (repo: string) => repo.split("/").pop() ?? repo;

// ---------- the sim's empire ----------

// Three of Justin's real repos, so the sim shows the shape a real player's empire takes.
// Each plays a different scenario when you sail to it.
const SIM_EMPIRE: { repo: string; scenario: string; districts: [string, number][]; rockets: number; launches: number; automated: number; waiting: number; bottleneck: IslandSummary["bottleneck"]; research: string[]; permits: string[] }[] = [
  {
    repo: "r3dbars/shiptorio", scenario: "research",
    districts: [["web", 48], ["server", 41], ["runner", 14], ["shared", 9]],
    rockets: 41, launches: 22, automated: 0.41, waiting: 3,
    bottleneck: { stage: "inspect", summary: "3 PRs waiting on review for 2h", wip: 3, ageMs: 2 * 3600_000 },
    research: ["leftovers", "secrets"], permits: ["docs"],
  },
  {
    repo: "r3dbars/testing", scenario: "rework-loop",
    districts: [["src", 4], ["test", 2], ["docs", 1]],
    rockets: 2, launches: 2, automated: 0, waiting: 2,
    bottleneck: { stage: "build", summary: "2 fixes waiting for a runner", wip: 2, ageMs: 40 * 60_000 },
    research: [], permits: [],
  },
  {
    repo: "r3dbars/transcripted", scenario: "quiet-morning",
    districts: [["app", 30], ["api", 18], ["docs", 6], ["shared", 5]],
    rockets: 17, launches: 12, automated: 0.67, waiting: 0,
    bottleneck: null,
    research: ["leftovers"], permits: ["docs", "app"],
  },
];

function simIslands(current: string, t: number): IslandSummary[] {
  const here = shortName(current);
  return SIM_EMPIRE.filter((x) => shortName(x.repo) !== here).map((x, i) => ({
    repo: x.repo,
    ready: true,
    // the satellites keep shipping while you're away
    rockets: x.rockets + Math.floor((t + i * 17) / 45),
    launches: x.launches + Math.floor((t + i * 17) / 45),
    automated: x.automated,
    waiting: x.waiting,
    inFlight: 2 + ((t + i) % 3),
    bottleneck: x.bottleneck,
    districts: x.districts.map(([name, files]) => ({ name, files })),
    permits: x.permits,
    research: x.research,
    updatedAt: Date.now(),
  }));
}

// ---------- the live empire ----------

async function fetchIslands(): Promise<IslandSummary[] | null> {
  const r = await fetch("/api/empire", { credentials: "same-origin" }).catch(() => null);
  if (r?.ok) {
    // the schema (and zod) load only when there's an empire to check
    const { Empire: EmpireSchema } = await import("../source/schemas");
    const parsed = EmpireSchema.safeParse(await r.json().catch(() => null));
    if (parsed.success) return parsed.data.islands;
  }
  // older servers: the repo list alone still draws the islands
  const repos = await fetch("/api/repos", { credentials: "same-origin" }).catch(() => null);
  if (!repos?.ok) return null;
  const body = (await repos.json().catch(() => null)) as { repos?: { fullName?: string; full_name?: string }[] } | null;
  return (body?.repos ?? []).map((x) => ({
    repo: (x.fullName ?? x.full_name ?? "").toLowerCase(),
    ready: false, rockets: 0, launches: 0, automated: 0, waiting: 0, inFlight: 0,
    bottleneck: null, districts: [], permits: [], research: [], updatedAt: Date.now(),
  })).filter((x) => x.repo);
}

export interface EmpireView {
  on: boolean;
  here: IslandSummary | null; // the island you're on, live from the factory state
  others: IslandSummary[];
  hrefFor: (repo: string) => string;
}

export function useEmpire(cfg: SourceConfig, state: FactoryState | null): EmpireView {
  const on = useMemo(() => empireOn(), []);
  const [fetched, setFetched] = useState<IslandSummary[]>([]);
  const [t, setT] = useState(0);
  useEffect(() => {
    if (!on) return;
    let dead = false;
    const pull = () => {
      if (cfg.kind === "sim") return setT((n) => n + 5);
      fetchIslands().then((list) => !dead && list && setFetched(list));
    };
    pull();
    const id = setInterval(pull, cfg.kind === "sim" ? 5_000 : 30_000);
    return () => {
      dead = true;
      clearInterval(id);
    };
  }, [on, cfg.kind]);

  const repo = state?.repo ?? cfg.repo;
  const here = state ? summarizeIsland(state) : null;
  const others = !on ? [] : cfg.kind === "sim" ? simIslands(repo, t) : fetched.filter((x) => x.repo.toLowerCase() !== repo.toLowerCase());
  const hrefFor = (to: string) => {
    if (cfg.kind === "live") return `?source=live&repo=${encodeURIComponent(to)}&empire=1`;
    const sc = SIM_EMPIRE.find((x) => x.repo === to)?.scenario ?? "quiet-morning";
    return `?source=sim&scenario=${sc}&repo=${encodeURIComponent(to)}&empire=1`;
  };
  return { on, here, others, hrefFor };
}

// What a satellite's label says: what's waiting on you there, else what's stuck, else all clear.
export function islandLine(i: IslandSummary): string {
  if (!i.ready) return "not opened yet";
  const auto = i.launches ? ` · ${Math.round(i.automated * 100)}% auto` : "";
  if (i.waiting) return `${i.waiting} waiting on you${auto}`;
  if (i.bottleneck) return i.bottleneck.summary.length > 42 ? `${i.bottleneck.summary.slice(0, 40)}…` : i.bottleneck.summary;
  return `all clear · ${i.rockets} shipped${auto}`;
}

export function satellitesFor(e: EmpireView): SatelliteSpec[] {
  const all = e.here ? [e.here, ...e.others] : e.others;
  const worst = rollup(all).worst;
  return e.others.slice(0, 8).map((i) => ({
    repo: i.repo,
    title: shortName(i.repo).toUpperCase(),
    sub: islandLine(i),
    districts: i.districts.length ? i.districts : [{ name: "src", files: 6 }],
    rockets: i.rockets,
    hot: !!worst && worst.repo === i.repo,
  }));
}

// ---------- the top bar chip and the overview sheet ----------

export function IslandChip({ e, open, onToggle }: { e: EmpireView; open: boolean; onToggle: () => void }) {
  const waitingElsewhere = e.others.reduce((n, i) => n + i.waiting, 0);
  const name = e.here ? shortName(e.here.repo) : "island";
  return (
    <button type="button" className="island-chip" aria-pressed={open} onClick={onToggle} aria-label={`Your islands: on ${name}, ${e.others.length + 1} in all${waitingElsewhere ? `, ${waitingElsewhere} waiting on other islands` : ""}`}>
      <Icon name="island" size={16} />
      <span className="ic-name">{name}</span>
      <span className="ic-n">{e.others.length + 1}</span>
      {waitingElsewhere > 0 && <span className="ic-dot" aria-hidden="true" />}
    </button>
  );
}

export function EmpireSheet({ e, live, onClose }: { e: EmpireView; live: boolean; onClose: () => void }) {
  const all = e.here ? [e.here, ...e.others] : e.others;
  const r = rollup(all);
  const here = e.here?.repo;
  const ranked = [...all].sort((a, b) => (a.repo === here ? -1 : b.repo === here ? 1 : stuckScore(b) - stuckScore(a)));
  const mine = new Set(e.here?.research ?? []);
  const elsewhere = r.research.filter((t) => !mine.has(t));
  return (
    <section className="card sheet empire" aria-label="Your empire">
      <div className="sheet-top">
        <h2>Your empire</h2>
        <button type="button" className="hud-iconbtn" onClick={onClose} aria-label="Close">
          <Icon name="cross" size={14} />
        </button>
      </div>
      <div className="em-roll">
        <span><b>{r.islands}</b><small>islands</small></span>
        <span><b>{r.rockets}</b><small>shipped</small></span>
        <span><b>{Math.round(r.automated * 100)}%</b><small>automated</small></span>
        <span className={r.waiting ? "hot" : ""}><b>{r.waiting}</b><small>on you</small></span>
      </div>
      {r.worst && (
        <a className="em-worst" href={r.worst.repo === here ? undefined : e.hrefFor(r.worst.repo)} onClick={r.worst.repo === here ? onClose : undefined}>
          <span className="rs-tag">Most stuck</span>
          <span className="em-worst-body">
            <b>{shortName(r.worst.repo)}</b>
            <small>{r.worst.waiting ? `${r.worst.waiting} card${r.worst.waiting === 1 ? "" : "s"} waiting on you` : r.worst.bottleneck?.summary}</small>
          </span>
          <span className="em-go">{r.worst.repo === here ? "Here" : "Go"}</span>
        </a>
      )}
      <div className="em-list">
        {ranked.map((i) => {
          const isHere = i.repo === here;
          return (
            <a key={i.repo} className={`em-row${isHere ? " here" : ""}`} href={isHere ? undefined : e.hrefFor(i.repo)} onClick={isHere ? onClose : undefined} aria-current={isHere ? "location" : undefined}>
              <span className="em-ico" aria-hidden="true"><Icon name="island" size={20} /></span>
              <span className="em-body">
                <span className="em-name">{shortName(i.repo)}{isHere && <em>you're here</em>}</span>
                <span className="em-line">{islandLine(i)}</span>
                {i.permits.length > 0 && <span className="em-permits">Ships on its own in {i.permits.join(", ")}</span>}
              </span>
              <span className="em-stats">
                <span title="shipped"><Icon name="rocket" size={10} /> {i.rockets}</span>
                {i.waiting > 0 && <span className="hot" title="waiting on you"><Icon name="bell" size={10} /> {i.waiting}</span>}
              </span>
            </a>
          );
        })}
      </div>
      {elsewhere.length > 0 && (
        <p className="em-note">
          <Icon name="flask" size={12} /> {elsewhere.length} check{elsewhere.length === 1 ? "" : "s"} researched on your other islands {elsewhere.length === 1 ? "isn't" : "aren't"} running here yet.
        </p>
      )}
      <a className="em-add" href={live ? "/setup" : undefined} aria-disabled={!live}>
        <Icon name="island" size={16} />
        <span>
          Connect another repo
          <small>{live ? "Every repo you add becomes a new island." : "In the live game, every repo you add becomes a new island."}</small>
        </span>
      </a>
    </section>
  );
}
