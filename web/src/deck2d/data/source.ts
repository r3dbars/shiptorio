// A DeckSource (../contract.ts) over the real factory: the live server with ?source=live, the simulator otherwise. It
// folds protocol messages the same way the React store does (../../store.ts), and Approve / Later send the same
// messages the task tray sends (ui/TaskTray.tsx), so the server and the sim learn from them the same way
// (docs/LEARN.md: Approve fills a dot, Later empties them).

import { continueOption, type FactoryState, type Move, type ServerToWeb, type WebToServer } from "@shiptorio/shared";
import { connect as connectFactory, readConfig, type Source, type SourceConfig } from "../../source";
import { applyPatch } from "../../store";
import { openUnlockLink } from "../rules/unlockLink";
import type { DeckSource, StopId } from "../contract";
import { cardStop, deckView, isSetupCard, itemStop, type LiveDeckView } from "./view";
import { createJourney } from "./journey";
import { connectReplay, type ReplayOptions } from "./replay";

type Connect = (cfg: SourceConfig, onMessage: (m: ServerToWeb) => void, onStatus: (s: "connecting" | "live" | "offline") => void) => Source;

export interface LiveDeckSource extends DeckSource {
  view(): LiveDeckView;
  state(): FactoryState | null;
  status(): "connecting" | "live" | "offline";
  close(): void;
  selectStop(stop: StopId): void;
  arrive(id: string, stop: StopId): void;
  focusItem(id: string): void;
}

// The live outbox gives up on a decision after 60s (decision-outbox.ts). A card the server still holds after this long
// was never applied, so it comes back instead of staying hidden until a reload.
export const UNCONFIRMED_MS = 75_000;

export function fold(s: FactoryState | null, msg: ServerToWeb): FactoryState | null {
  if (msg.type === "snapshot") return msg.state;
  if (!s) return s;
  if (msg.type === "patch") return applyPatch(s, msg.patch);
  if (msg.type === "move") return { ...s, move: msg.move };
  if (msg.type === "deck") return { ...s, deck: msg.deck };
  if (msg.type === "move_resolved") return { ...s, move: s.move?.id === msg.moveId ? null : s.move, deck: s.deck?.filter((m) => m.id !== msg.moveId) };
  return s;
}

export function createLiveSource(cfg: SourceConfig = readConfig(), opts: { onPower?: () => void; connect?: Connect; now?: () => number; replay?: ReplayOptions } = {}): LiveDeckSource {
  const replay = opts.replay ?? (typeof location !== "undefined" && new URLSearchParams(location.search).get("source") === "replay" ? {} : undefined);
  if (replay) cfg = { ...cfg, kind: "live" };
  const connect: Connect = replay ? (_cfg, message, status) => connectReplay(message, status, replay) : opts.connect ?? connectFactory;
  const now = opts.now ?? Date.now;
  let state: FactoryState | null = null;
  let status: "connecting" | "live" | "offline" = "connecting";
  let pulled: { stop: StopId; at: number } | null = null;
  let completed: { stop: StopId; at: number } | null = null;
  let selectedStop: StopId | null = null;
  const hidden = new Set<string>(); // answered here, gone before the server agrees
  const hiddenAt = new Map<string, number>();
  const hide = (id: string) => { hidden.add(id); hiddenAt.set(id, now()); };
  const journey = createJourney();
  let activeItemId: string | null = null;
  const fns = new Set<() => void>();
  const changed = () => fns.forEach((fn) => fn());
  const src = connect(cfg, (msg) => {
    const next = fold(state, msg);
    if (next === state) return;
    if (state && next) {
      const shippy = deckView(state, { now: now(), hidden }).shippy;
      const attended = state.items.filter(it => (it.state === "working" || it.state === "inspecting") && itemStop(it) === shippy.at);
      if (attended.some(it => next.items.some(done => done.id === it.id && ["passed", "on_pad", "launched"].includes(done.state))))
        completed = { stop: shippy.at as StopId, at: now() };
    }
    state = next;
    // forget answers the server has dropped, so the set never grows
    const open = new Set([...(state?.deck ?? []), ...(state?.move ? [state.move] : [])].map((m) => m.id));
    for (const id of hidden) if (!open.has(id)) { hidden.delete(id); hiddenAt.delete(id); }
    changed();
  }, (s) => { status = s; changed(); });
  const find = (id: string): Move | undefined => state?.deck?.find((m) => m.id === id) ?? (state?.move?.id === id ? state.move : undefined);
  const send = (msg: WebToServer) => src.send(msg);

  return {
    view: () => {
      for (const [id, at] of hiddenAt) if (now() - at >= UNCONFIRMED_MS) { hidden.delete(id); hiddenAt.delete(id); }
      if (activeItemId && journey.finished() === activeItemId) activeItemId = null;
      const picked = state?.liveBottleneck?.itemId;
      // A new focus may take over only after the current cargo reaches its machine.
      if (picked && !journey.transferring()) activeItemId = picked;
      const base = deckView(state, { now: now(), pulled, completed, hidden, selectedStop, activeItemId, visualFlow: cfg.kind === "live" });
      activeItemId = base.work?.id ?? null;
      return cfg.kind === "live" ? journey.view(base) : base;
    },
    step: dt => journey.step(dt),
    arrive: (id, stop) => journey.arrive(id, stop),
    focusItem: id => { activeItemId = id; changed(); },
    selectStop(stop) { selectedStop = stop; changed(); },
    state: () => state,
    status: () => status,
    approve(id) {
      if (replay) return;
      const move = find(id);
      if (!move || !state || hidden.has(id)) return;
      if (isSetupCard(move) && opts.onPower) return opts.onPower(); // a local agent is set up in Power, never via a connector
      const option = continueOption(move);
      openUnlockLink(move, option);
      hide(id);
      pulled = { stop: cardStop(state, move), at: now() };
      send({ type: "choose_move", moveId: id, optionId: option.id });
      changed();
    },
    later(id) {
      if (replay) return;
      if (!find(id) || hidden.has(id)) return;
      hide(id);
      send({ type: "defer_move", moveId: id });
      changed();
    },
    subscribe(fn) {
      fns.add(fn);
      return () => fns.delete(fn);
    },
    close: () => src.close(),
  };
}
