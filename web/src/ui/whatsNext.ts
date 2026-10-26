// "What's next" when the factory has no Next Move card open (issue #105). The game never goes quiet: after
// every rocket there is always one clear thing to do, picked here from what the state already shows.
// Pure, so it's unit tested (web/test/whatsNext.test.ts) and works the same in sim and live.

import { sciencePacks, techById, techStatus, TECHS, type FactoryState } from "@shiptorio/shared";
import { ghostSpots } from "../map/ghosts";
import { lc } from "../sim/engine";

export type NudgeAction =
  | { do: "launch"; itemId: string } // simulator only; live uses existing server-approved check-in controls
  | { do: "checkin" } // open the check-in deck
  | { do: "station"; id: string } // open a station's panel
  | { do: "research" } // open the research tree
  | { do: "connect"; source: string } // open the connect sheet for an empty mine
  | { do: "place" } // place another assembler
  | { do: "sheet"; sheet: "line" | "yours" | "guide" };

export interface Nudge {
  id: string; // stable per reason, so the card doesn't flicker as numbers tick
  kicker: string; // "Next move · research"
  title: string;
  why: string;
  grows?: string; // what doing it adds to the loop: "+1 CHECK"
  cta: { label: string; action: NudgeAction };
  alt?: { label: string; action: NudgeAction };
}

export interface NudgeContext {
  canPlace?: boolean; // a free slot and a signed-in subscription (sim only today)
  live?: boolean;
}

const MINE_NAME: Record<string, string> = { sentry: "Sentry", posthog: "PostHog" };
const MINE_WHY: Record<string, string> = {
  sentry: "Live errors become ore, so the next fix comes from what's actually breaking.",
  posthog: "User signals weigh what gets built first, so the next fix is the one people feel.",
};
const IN_FLIGHT = new Set(["ore", "queued", "working", "inspecting", "rejected"]);
const dir = (d: string) => (d === "/" ? "/" : `/${d}`);

/** Always returns a move. Ordered by what most often unblocks the loop, then what grows it. */
export function whatsNext(state: FactoryState, ctx: NudgeContext = {}): Nudge {
  const rockets = state.metrics?.rockets ?? 0;

  // 1. A PR is ready: the fastest rocket there is.
  const onPad = state.items.find((i) => i.state === "on_pad");
  if (onPad) {
    const mergeGate = state.stations?.find(st => st.kind === "merge");
    return {
      id: `launch:${onPad.id}`,
      kicker: "Next move · launch pad",
      title: ctx.live ? `Review #${onPad.prNumber ?? "PR"} at the merge gate` : `#${onPad.prNumber ?? "PR"} passed every check`,
      why: `"${onPad.title}" is on the pad. ${ctx.live ? "Open the merge gate to review its checks and approved launch options." : "Launch it."}`,
      cta: ctx.live
        ? { label: mergeGate ? "Open the merge gate" : "Open check-in", action: mergeGate ? { do: "station", id: mergeGate.id } : { do: "checkin" } }
        : { label: "Launch it", action: { do: "launch", itemId: onPad.id } },
    };
  }

  // 2. Decisions are waiting on you.
  const deck = state.deck?.length ?? 0;
  if (deck > 0) {
    return {
      id: "checkin",
      kicker: "Next move · check in",
      title: `${deck} ${deck === 1 ? "card is" : "cards are"} waiting on you`,
      why: "You're the slow part of the loop right now. Two minutes of swipes moves it all forward.",
      cta: { label: "Check in", action: { do: "checkin" } },
    };
  }

  // 3. Something is stuck at a station.
  const stuck = state.bottleneck && state.stations?.find((st) => st.id === state.bottleneck!.stationId);
  if (state.bottleneck && stuck) {
    return {
      id: `station:${stuck.id}`,
      kicker: `Bottleneck · ${stuck.name}`,
      title: `Clear the ${lc(stuck.name)}`,
      why: state.bottleneck.summary,
      cta: { label: `Open the ${lc(stuck.name)}`, action: { do: "station", id: stuck.id } },
    };
  }

  // 4. Science packs to spend: a new check on every PR.
  const ready = TECHS.filter((t) => techStatus(t, state).state === "ready");
  if (ready.length) {
    const pick = (state.research?.suggest && ready.find((t) => t.id === state.research!.suggest!.tech)) ?? ready[0];
    const have = sciencePacks(state);
    return {
      id: "research",
      kicker: "Next move · research",
      title: `Research ${techById(pick.id)?.name ?? "a new check"}`,
      why: `Your rockets earned ${have} science ${have === 1 ? "pack" : "packs"}. Spend them on a check that runs on every PR, so more can ship on its own.`,
      grows: "+1 CHECK",
      cta: { label: "Open research", action: { do: "research" } },
    };
  }

  // 5. An empty mine on the island: more ore, from the real world.
  const ghost = rockets > 0 ? ghostSpots(state)[0] : undefined;
  const pendingSource = state.sources?.find((x) => (x.kind === "sentry" || x.kind === "posthog") && x.state === "needs_action");
  const mine = pendingSource?.kind ?? ghost?.kind;
  if (mine) {
    return {
      id: `connect:${mine}`,
      kicker: "Next move · new mine",
      title: `Connect ${MINE_NAME[mine]}`,
      why: MINE_WHY[mine],
      grows: "+1 SOURCE",
      cta: { label: `Connect ${MINE_NAME[mine]}`, action: { do: "connect", source: mine } },
    };
  }

  // 6. A lane close to its launch permit: the next step toward lights out.
  const close = state.autonomy?.districts.filter((d) => !d.permit && d.risk !== "high" && d.score >= 0.5).sort((a, b) => b.score - a.score)[0];
  const gate = state.stations?.find((st) => st.kind === "merge");
  if (close && gate && rockets > 0) {
    return {
      id: `permit:${close.district}`,
      kicker: "Next move · automate",
      title: `${dir(close.district)} is close to a launch permit`,
      why: `${Math.round(close.score * 100)}% trust. Clean ships here earn a permit, and then its PRs launch without you.`,
      grows: "+1 PERMIT",
      cta: { label: `Open the ${lc(gate.name)}`, action: { do: "station", id: gate.id } },
    };
  }

  // 7. Room for another builder.
  const builders = state.machines.filter((m) => m.type === "assembler").length;
  if (ctx.canPlace && builders < 3) {
    return {
      id: "place",
      kicker: "Next move · build",
      title: builders < 2 ? "Add a second assembler" : "Add another assembler",
      why: "Two builders work two fixes at once. The line ships faster when ore lands.",
      grows: "+1 BUILDER",
      cta: { label: "Place it", action: { do: "place" } },
    };
  }

  // 8. Work is moving: watch it, or tune the line while it runs.
  const moving = state.items.filter((i) => IN_FLIGHT.has(i.state)).length;
  if (moving) {
    return {
      id: "line",
      kicker: "Next move · the line",
      title: `${moving} ${moving === 1 ? "fix is" : "fixes are"} on the line`,
      why: "Nothing needs you yet. Follow them through the checks, or make the factory yours while they build.",
      cta: { label: "See the line", action: { do: "sheet", sheet: "line" } },
      alt: rockets > 0 ? { label: "Make it yours", action: { do: "sheet", sheet: "yours" } } : undefined,
    };
  }

  // 9. All caught up. Still a move: grow the factory.
  return {
    id: "caught-up",
    kicker: "Next move · grow",
    title: rockets > 0 ? "All caught up. Grow the factory" : "Waiting for the first ore",
    why:
      rockets > 0
        ? "The line is clear. Add a check, a builder or a new input so the next round ships more on its own."
        : "New issues land at the deposit and ride the belt in. Learn the parts while you wait.",
    cta: rockets > 0 ? { label: "Make it yours", action: { do: "sheet", sheet: "yours" } } : { label: "Open the field guide", action: { do: "sheet", sheet: "guide" } },
  };
}
