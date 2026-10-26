// The research tree (docs/LOOP.md "Players add checks"). Every PR you ship is a science pack. Spend packs to
// unlock a new gauntlet station, and from then on it really runs on every PR, right after CI: cheapest checks
// first, so nothing expensive runs on work a regex could have caught. Repeated scars point at the tech that
// would have caught them. Pure rules, shared by the server (live PRs) and the sim.

import type { Belt, FactoryState, Item, Machine, Research, Science } from "./model";

export interface Tech {
  id: string;
  name: string; // "Leftover sweeper"
  icon: string; // a HUD pixel icon name (web/src/ui/icons.tsx)
  tier: 1 | 2 | 3;
  cost: number; // science packs
  needs: string[]; // every one of these first
  rockets: number; // PRs shipped before it shows up as researchable
  what: string; // the panel line: what it does
  catches: string; // a real example of what it stops
  scar: RegExp; // a scar whose reason matches this is one this tech would have caught
  soon?: string; // not runnable yet: why, in plain words
}

export const TECHS: Tech[] = [
  {
    id: "leftovers",
    name: "Leftover sweeper",
    icon: "broom",
    tier: 1,
    cost: 2,
    needs: [],
    rockets: 1,
    what: "Sweeps every PR for debug leftovers: console.log, debugger, .only on a test, merge conflict markers.",
    catches: "a console.log left in the checkout handler",
    scar: /console\.(log|debug)|debugger|leftover|stray (log|print)|debug (code|output|log)|\.only\b|conflict marker/i,
  },
  {
    id: "secrets",
    name: "Secret scanner",
    icon: "key",
    tier: 1,
    cost: 2,
    needs: [],
    rockets: 1,
    what: "Blocks any PR that adds an API key, token, password or private key to the code.",
    catches: "a live Stripe key pasted into a config file",
    scar: /secret|api[ _-]?key|token|credential|password|private key|leak/i,
  },
  {
    id: "types",
    name: "Type guard",
    icon: "shield",
    tier: 2,
    cost: 4,
    needs: ["leftovers"],
    rockets: 3,
    what: "Sends back PRs that switch the checker off: `any`, @ts-ignore, eslint-disable, type: ignore, noqa.",
    catches: "an @ts-ignore that hid a null crash",
    scar: /\bany\b|ts-ignore|ts-nocheck|eslint-disable|type: ?ignore|noqa|type (error|check|safety)|unsafe cast/i,
  },
  {
    id: "scope",
    name: "Scope gauge",
    icon: "gauge",
    tier: 2,
    cost: 4,
    needs: ["leftovers"],
    rockets: 3,
    what: "Sends back PRs too big to review safely (over 400 changed lines or 20 files), so fixes stay small.",
    catches: "a one-line fix that rewrote three folders",
    scar: /scope|unrelated|too (big|large)|sprawl|drive-by|refactor/i,
  },
  {
    id: "deps",
    name: "Dependency guard",
    icon: "box",
    tier: 2,
    cost: 4,
    needs: ["secrets"],
    rockets: 3,
    what: "Makes sure the package manifest and its lockfile change together, so nobody ships a dependency nobody pinned.",
    catches: "a new package in package.json with no lockfile update",
    scar: /dependenc|package\.json|lockfile|lock file|npm install|version pin/i,
  },
  {
    id: "perf",
    name: "Perf gauge",
    icon: "bolt",
    tier: 3,
    cost: 8,
    needs: ["scope"],
    rockets: 8,
    what: "Times the hot paths before and after every PR and sends back anything that got slower.",
    catches: "a cart page that went from 200ms to 2s",
    scar: /slow|perf|latency|timeout|n\+1/i,
    soon: "Needs the runner to time your app. Coming soon.",
  },
  {
    id: "visual",
    name: "Visual diff camera",
    icon: "eye",
    tier: 3,
    cost: 8,
    needs: ["types"],
    rockets: 8,
    what: "Screenshots every page before and after, and shows you what moved.",
    catches: "a checkout button pushed off the screen on phones",
    scar: /layout|css|screenshot|visual|overlap|off.?screen/i,
    soon: "Needs the runner to take screenshots. Coming soon.",
  },
  {
    id: "canary",
    name: "Canary tower",
    icon: "tower",
    tier: 3,
    cost: 10,
    needs: ["deps"],
    rockets: 10,
    what: "Ships to 5% of users first and watches errors before it goes to everyone.",
    catches: "a crash that only real traffic finds",
    scar: /regress|production|rollback|revert|users? (hit|saw)/i,
    soon: "Needs deploy hooks. Coming soon.",
  },
];

export const techById = (id: string) => TECHS.find((t) => t.id === id);
export const CHECK_PREFIX = "check-";
export const checkStationId = (tech: string) => `${CHECK_PREFIX}${tech}`;
export const techOfStation = (id: string | undefined) => (id?.startsWith(CHECK_PREFIX) ? techById(id.slice(CHECK_PREFIX.length)) : undefined);

export const emptyResearch = (): Research => ({ done: [], spent: 0 });
export const packs = (s: Science) => s.red + s.green + s.grey + s.blue;
/** Science packs on hand: everything shipped, minus what research spent. */
export const sciencePacks = (state: Pick<FactoryState, "science" | "research">) => Math.max(0, packs(state.science) - (state.research?.spent ?? 0));
/** Rockets count toward unlocks; outside merges without an item still count as shipped through science. */
const shippedCount = (state: Pick<FactoryState, "science" | "metrics">) => Math.max(state.metrics?.rockets ?? 0, packs(state.science));

export type TechState = "done" | "ready" | "short" | "locked" | "soon";

/** Where one tech stands for this factory, and the one line that says why. */
export function techStatus(tech: Tech, state: Pick<FactoryState, "science" | "research" | "metrics">): { state: TechState; why: string } {
  const r = state.research ?? emptyResearch();
  if (r.done.includes(tech.id)) return { state: "done", why: "Running on every PR" };
  const missing = tech.needs.filter((n) => !r.done.includes(n));
  if (missing.length) return { state: "locked", why: `Research ${missing.map((n) => techById(n)?.name ?? n).join(" and ")} first` };
  const shipped = shippedCount(state);
  if (shipped < tech.rockets) return { state: "locked", why: `Ship ${tech.rockets - shipped} more PR${tech.rockets - shipped === 1 ? "" : "s"} to unlock` };
  if (tech.soon) return { state: "soon", why: tech.soon };
  const have = sciencePacks(state);
  if (have < tech.cost) return { state: "short", why: `${tech.cost - have} more science pack${tech.cost - have === 1 ? "" : "s"}: ship ${tech.cost - have} more PR${tech.cost - have === 1 ? "" : "s"}` };
  return { state: "ready", why: `${tech.cost} science packs` };
}

/** Null when the tech can be researched now, else the reason it can't. */
export function researchBlocked(state: Pick<FactoryState, "science" | "research" | "metrics">, id: string): string | null {
  const tech = techById(id);
  if (!tech) return "There's no such research.";
  const st = techStatus(tech, state);
  return st.state === "ready" ? null : st.state === "done" ? `${tech.name} is already running.` : st.why;
}

// ---------- the checks themselves (they really run, on the PR's diff) ----------

export interface DiffFile {
  filename: string;
  status?: string;
  patch?: string;
  additions?: number;
  deletions?: number;
}

const TEST_FILE = /(^|\/)(test|tests|__tests__|spec)\/|\.(test|spec)\.[cm]?[jt]sx?$|_test\.(go|py)$|(^|\/)test_[^/]+\.py$/i;
const CODE_FILE = /\.([cm]?[jt]sx?|py|go|rb|rs|java|kt|swift|php|cs|vue|svelte)$/i;

/** The lines a file's patch adds, without the leading "+". */
export function addedLines(patch: string | undefined): string[] {
  if (!patch) return [];
  return patch.split("\n").filter((l) => l.startsWith("+") && !l.startsWith("+++")).map((l) => l.slice(1));
}

const SECRET: [RegExp, string][] = [
  [/AKIA[0-9A-Z]{16}/, "an AWS access key"],
  [/gh[pousr]_[A-Za-z0-9]{36,}|github_pat_[A-Za-z0-9_]{40,}/, "a GitHub token"],
  [/sk_live_[A-Za-z0-9]{16,}|rk_live_[A-Za-z0-9]{16,}/, "a live Stripe key"],
  [/sk-(?:proj-|ant-)?[A-Za-z0-9_-]{32,}/, "an AI API key"],
  [/xox[abposr]-[A-Za-z0-9-]{10,}/, "a Slack token"],
  [/-----BEGIN (?:RSA |EC |OPENSSH |DSA )?PRIVATE KEY-----/, "a private key"],
  [/(?:api[_-]?key|secret|token|passw(?:or)?d)["']?\s*[:=]\s*["'][A-Za-z0-9/+_\-]{20,}["']/i, "a hard-coded secret"],
];
const LEFTOVER: [RegExp, string, (f: string) => boolean][] = [
  [/^\s*debugger;?\s*$/, "a debugger statement", (f) => CODE_FILE.test(f)],
  [/\bconsole\.(log|debug)\(/, "a console.log", (f) => CODE_FILE.test(f) && !TEST_FILE.test(f) && !/(^|\/)(scripts?|bin|cli)\//.test(f)],
  [/\b(describe|it|test)\.only\(/, "a .only that skips the rest of the tests", (f) => TEST_FILE.test(f)],
  [/^(<<<<<<<|>>>>>>>) /, "a merge conflict marker", () => true],
];
const TYPE_ESCAPE: [RegExp, string][] = [
  [/@ts-(ignore|nocheck)/, "@ts-$1"],
  [/\bas any\b|:\s*any\b(?![-\w])/, "`any`"],
  [/eslint-disable/, "eslint-disable"],
  [/#\s*type:\s*ignore|#\s*noqa/, "a type: ignore"],
];
const MANIFESTS: Record<string, RegExp> = {
  "package.json": /(^|\/)(bun\.lockb?|package-lock\.json|yarn\.lock|pnpm-lock\.yaml)$/,
  "pyproject.toml": /(^|\/)(poetry\.lock|uv\.lock|pdm\.lock)$/,
  "Cargo.toml": /(^|\/)Cargo\.lock$/,
  "go.mod": /(^|\/)go\.sum$/,
  Gemfile: /(^|\/)Gemfile\.lock$/,
};
// "react": "^18.3.1", "x": "workspace:*", "y": "latest": a dependency line, not a script or a name
const DEP_LINE = /^\s*"[@\w./-]+"\s*:\s*"(?:[~^<>=]*\s*\d[\w.+-]*|workspace:[^"]*|npm:[^"]*|latest|\*)",?\s*$/;
const SCOPE_LINES = 400;
const SCOPE_FILES = 20;

const where = (f: string, line: string) => `${f}: ${line.trim().slice(0, 80)}`;

/** Runs one researched check on a PR's files. Pure: same diff, same verdict. */
export function runCheck(id: string, files: DiffFile[]): { passed: boolean; reason: string } {
  const tech = techById(id);
  if (!tech) return { passed: true, reason: "Unknown check, skipped." };
  if (id === "leftovers" || id === "secrets" || id === "types") {
    const rules = id === "leftovers" ? LEFTOVER : (id === "secrets" ? SECRET : TYPE_ESCAPE).map(([re, what]) => [re, what, (f: string) => id === "secrets" || CODE_FILE.test(f)] as const);
    for (const f of files) {
      if (id === "types" && TEST_FILE.test(f.filename)) continue; // tests may cast freely
      for (const line of addedLines(f.patch)) {
        for (const [re, what, applies] of rules) {
          if (!applies(f.filename) || !re.test(line)) continue;
          const label = id === "types" ? what.replace("$1", line.match(/@ts-(ignore|nocheck)/)?.[1] ?? "ignore") : what;
          return { passed: false, reason: `${tech.name} found ${label}. ${id === "secrets" ? f.filename : where(f.filename, line)}`.slice(0, 300) };
        }
      }
    }
    return { passed: true, reason: id === "secrets" ? "No keys or tokens in the added lines." : id === "types" ? "No type checks switched off." : "No debug leftovers." };
  }
  if (id === "scope") {
    const lines = files.reduce((n, f) => n + (f.additions ?? addedLines(f.patch).length) + (f.deletions ?? 0), 0);
    if (files.length > SCOPE_FILES) return { passed: false, reason: `Scope gauge: ${files.length} files changed (limit ${SCOPE_FILES}). Split it into smaller PRs.` };
    if (lines > SCOPE_LINES) return { passed: false, reason: `Scope gauge: ${lines} lines changed (limit ${SCOPE_LINES}). Split it into smaller PRs.` };
    return { passed: true, reason: `${lines} lines across ${files.length} file${files.length === 1 ? "" : "s"}. Small enough to review.` };
  }
  if (id === "deps") {
    const names = files.map((f) => f.filename);
    for (const [manifest, lock] of Object.entries(MANIFESTS)) {
      const touched = names.filter((n) => n === manifest || n.endsWith(`/${manifest}`));
      const locks = names.filter((n) => lock.test(n));
      const depsChanged = touched.some((n) => {
        const patch = files.find((f) => f.filename === n)?.patch;
        // package.json edits to scripts or metadata don't need a lockfile change
        return manifest !== "package.json" || !patch || addedLines(patch).some((l) => DEP_LINE.test(l) && !/^\s*"version"/.test(l));
      });
      if (depsChanged && !locks.length) return { passed: false, reason: `Dependency guard: ${touched[0]} changed its dependencies but no lockfile came with it.` };
      if (locks.length && !touched.length) return { passed: false, reason: `Dependency guard: ${locks[0]} changed with no manifest change. Unexplained lockfile churn.` };
    }
    return { passed: true, reason: "Manifest and lockfile agree." };
  }
  return { passed: true, reason: tech.soon ?? "Nothing to check." };
}

// ---------- the planner's pick ----------

/** Two or more scars a researchable tech would have caught: suggest it. The biggest pile wins. */
export function suggestResearch(state: Pick<FactoryState, "items" | "science" | "research" | "metrics">): Research["suggest"] {
  const r = state.research ?? emptyResearch();
  let best: { tech: Tech; n: number; station: string } | undefined;
  for (const tech of TECHS) {
    if (r.done.includes(tech.id) || tech.soon) continue;
    const hits = state.items.flatMap((i) => (i.scars ?? []).filter((sc) => sc.station !== "custom" && tech.scar.test(sc.reason)));
    if (hits.length >= 2 && (!best || hits.length > best.n)) best = { tech, n: hits.length, station: STATION_WORD[hits.at(-1)!.station] ?? "The gauntlet" };
  }
  if (!best) return undefined;
  return { tech: best.tech.id, why: `${best.station} sent back ${best.n} PRs for this. ${best.tech.name} would have caught them in a second, before anything expensive ran.` };
}
const STATION_WORD: Record<string, string> = { ci: "CI", verify: "The verify bay", review: "AI review", merge: "You", orbit: "Orbit watch" };

// ---------- the line ----------

/** The researched check stations, in line order (the order they were researched). */
export const researchedChecks = (state: Pick<FactoryState, "research">) => (state.research?.done ?? []).filter((id) => !techById(id)?.soon);

/** Pending checks for an item entering the gauntlet. Undefined when nothing is researched. */
export function pendingChecks(state: Pick<FactoryState, "research">): NonNullable<Item["inspection"]>["checks"] {
  const ids = researchedChecks(state);
  return ids.length ? ids.map((id) => ({ id, state: "pending" as const, reason: "Waiting for its turn" })) : undefined;
}

const STEP = 3; // grid cells between stations on the line

/**
 * Drops a researched check onto the line right after CI (after the other checks), and slides everything
 * downstream along so the line grows. Returns the machines and belts to upsert and the belt to remove.
 */
export function insertCheck(state: Pick<FactoryState, "machines" | "belts">, tech: string): { machines: Machine[]; belts: Belt[]; removed: string[] } {
  const id = checkStationId(tech);
  if (state.machines.some((m) => m.id === id)) return { machines: [], belts: [], removed: [] };
  const ci = state.machines.find((m) => m.id === "ci-1");
  if (!ci) return { machines: [], belts: [], removed: [] };
  // walk from CI over the checks already on the line
  let last = ci;
  for (;;) {
    const b = state.belts.find((x) => x.from === last.id && x.to.startsWith(CHECK_PREFIX));
    const next = b && state.machines.find((m) => m.id === b.to);
    if (!next) break;
    last = next;
  }
  const out = state.belts.find((b) => b.from === last.id);
  const moved = state.machines.filter((m) => m.x > last.x && m.id !== id).map((m) => ({ ...m, x: m.x + STEP }));
  const station: Machine = { id, type: "inspector", x: last.x + STEP, y: last.y, tier: 1, state: "idle" };
  const belts: Belt[] = [{ id: `belt-${id}-in`, from: last.id, to: id }];
  if (out) belts.push({ id: `belt-${id}-out`, from: id, to: out.to });
  return { machines: [...moved, station], belts, removed: out ? [out.id] : [] };
}
