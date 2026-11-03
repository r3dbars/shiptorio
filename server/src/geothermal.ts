import type { ItemKind, PowerSource } from "@shiptorio/shared";
import type { RunnerJob } from "./runner-job";

// Geothermal power = a model on the player's own hardware, reached through their local runner.
// Free and always on, but small. The planner picks a plant per job; these fixed rules decide
// what geothermal is ever allowed to touch, and the planner can't override them.
export const LOCAL_POWER_ID = "geo-local";
export const localPower = (level = 1): PowerSource => ({ id: LOCAL_POWER_ID, kind: "geothermal", name: "Your computer", level, online: true });
export const MAX_LOCAL_FILES = 3;

type Harness = RunnerJob["harness"];
export const harnessLabel = (h: Harness | string | undefined): string =>
  h === "codex" ? "Codex" : h === "muse_code" ? "Muse Code" : h === "claude_code" ? "Claude" : h === "local" ? "your computer" : "the planner";
/** Runner presence → the plants it powers. One solar per signed-in subscription, geothermal for a local model. */
export const runnerPower = (harnesses: Harness[]): PowerSource[] =>
  harnesses.map(h => h === "local" ? localPower() : { id: `solar-${h}`, kind: "solar" as const, name: h === "codex" ? "Codex" : h === "muse_code" ? "Muse Code" : "Claude Code", level: 1, online: true });

const DOCS = /(^|\/)docs\/|\.(md|mdx|txt|rst)$/i;
const RISKY = [
  /(^|\/)\.github\//i, /(^|\/)package\.json$/i, /(^|\/)(bun\.lockb?|package-lock\.json|yarn\.lock|pnpm-lock\.yaml)$/i,
  /(^|\/)(wrangler\.(toml|jsonc?)|Dockerfile|docker-compose\.ya?ml)$/i, /(^|\/)migrations?\//i, /\.sql$/i,
  /(auth|access|account|session|secret|token|crypto|security|permission|payment|billing|stripe|runner)/i,
];
const SMALL_WORDS = /\b(typo|spelling|readme|docs?|documentation|comment|copy|wording|rename|lint|format|link|example)\b/i;

export interface RouteCase { kind?: ItemKind; title: string; paths: string[]; scars: number; rework: boolean }
export interface Guard { ok: boolean; reason: string }

/** The hard rules. Anything that fails these goes to a subscription, whatever the planner says. */
export function geothermalGuard(c: RouteCase): Guard {
  if (!c.paths.length) return { ok: false, reason: "No file scope yet." };
  if (c.paths.length > MAX_LOCAL_FILES) return { ok: false, reason: `${c.paths.length} files is too big for local power (max ${MAX_LOCAL_FILES}).` };
  const risky = c.paths.find(p => RISKY.some(r => r.test(p)));
  if (risky) return { ok: false, reason: `${risky} is sensitive, so a subscription model builds it.` };
  if (c.scars > 0 || c.rework) return { ok: false, reason: "It already failed a check once, so a stronger model takes the retry." };
  if (c.kind === "feature" && !c.paths.every(p => DOCS.test(p))) return { ok: false, reason: "New features go to a subscription model." };
  return { ok: true, reason: c.paths.every(p => DOCS.test(p)) ? "Docs-only change: free local power is enough." : `Small ${c.kind ?? "fix"} in ${c.paths.length} file${c.paths.length > 1 ? "s" : ""}: free local power is enough.` };
}

/** Cheap pre-check before any file scope exists, used to recommend a plant on the first card. */
export const looksSmall = (c: { kind?: ItemKind; title: string; scars: number }) =>
  c.scars === 0 && (c.kind === "cleanup" || SMALL_WORDS.test(c.title));

/** The fixed rule the planner falls back to: cheapest plant the guard allows, else the first subscription. */
export function ruleRoute(c: RouteCase, available: Harness[]): { harness: Harness; why: string } | null {
  const guard = geothermalGuard(c);
  if (available.includes("local") && guard.ok) return { harness: "local", why: guard.reason };
  const sub = available.find(h => h !== "local");
  return sub ? { harness: sub, why: available.includes("local") ? guard.reason : `Built with ${harnessLabel(sub)}.` } : null;
}

/** Enforce the guard on whatever the planner picked. Returns the plant that will actually build. */
export function enforceRoute(pick: Harness, c: RouteCase, available: Harness[]): { harness: Harness; why: string; vetoed: boolean } | null {
  const guard = geothermalGuard(c);
  if (pick === "local" && available.includes("local") && guard.ok) return { harness: "local", why: guard.reason, vetoed: false };
  if (pick !== "local" && available.includes(pick)) return { harness: pick, why: "", vetoed: false };
  const sub = available.find(h => h !== "local");
  return sub ? { harness: sub, why: guard.reason, vetoed: pick === "local" } : null;
}
