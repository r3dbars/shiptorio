// Achievements (shared/src/achievements.ts): badges for real outcomes. The hook folds every factory state into the
// player's record and queues an unlock toast with its own sound; the sheet shows every badge and how close you are.
//
// Live: the record lives in this browser and in the account's `achievements` pref, merged on load (earliest unlock
// wins), so it follows the player across browsers. Sim: kept in memory only, so every demo run unlocks them again
// and a sim never writes fake wins onto a real account.

import { useCallback, useEffect, useRef, useState } from "react";
import { ACHIEVEMENTS, board, check, emptyEarned, markDay, mergeEarned, parseEarned, type Achievement, type Earned, type FactoryState, type WebToServer } from "@shiptorio/shared";
import { savePref } from "../account";
import { sound } from "../sound/engine";
import { SHIP_EVENT, SHIP_TIMING } from "../sound/ship";
import { Icon, type IconName } from "./icons";

const KEY = "shiptorio:achievements";
const TOAST_MS = 4200;
const AFTER_SHIP_MS = SHIP_TIMING.doneMs + 3200; // let the ship card have its moment first
const MAX_WAIT_MS = 6000; // ...but back-to-back ships (a permit lane) never starve the toasts
const MAX_TOASTS = 3; // opening a factory that already shipped a lot: three toasts, then one "and N more"

const TIER_LABEL: Record<Achievement["tier"], string> = { bronze: "Bronze", silver: "Silver", gold: "Gold" };
const rocketsOf = (s: FactoryState) => Math.max(s.metrics?.rockets ?? 0, s.science.red + s.science.green + s.science.grey + s.science.blue);

function readLocal(): Earned {
  try {
    return parseEarned(localStorage.getItem(KEY));
  } catch {
    return emptyEarned();
  }
}

export interface Toast {
  key: number; // also when it was queued
  a?: Achievement;
  more?: number;
}

/** Folds the factory in and hands back the record plus the toast showing right now. `send` comes back wrapped so a card answered counts as a real move for the day. */
// link: filled in by the caller after progression is set up: its best streak, and where an unlock's XP goes.
export interface ProgressLink {
  streak: number;
  onUnlock?: (a: Achievement) => void;
}

export function useAchievements(state: FactoryState | null, live: boolean, quiet: boolean, sendRaw: (m: WebToServer) => void, link?: { current: ProgressLink }) {
  const [earned, setEarned] = useState<Earned>(() => (live ? readLocal() : emptyEarned()));
  const [toast, setToast] = useState<Toast | null>(null);
  const queue = useRef<Toast[]>([]);
  const quietUntil = useRef(0);
  const rockets = useRef<number | null>(null);
  const ref = useRef(earned);
  ref.current = earned;
  const [synced, setSynced] = useState(!live);

  const save = (e: Earned) => {
    ref.current = e;
    setEarned(e);
    if (!live) return;
    const raw = JSON.stringify(e);
    try {
      localStorage.setItem(KEY, raw);
    } catch {
      // the account copy still holds it
    }
    savePref("achievements", raw);
  };

  // Live: pull the account's copy once and merge, so a new browser doesn't re-toast what you already have.
  useEffect(() => {
    if (!live) return;
    let done = false;
    fetch("/api/me")
      .then((r) => (r.ok ? (r.json() as Promise<{ prefs?: { achievements?: string } }>) : Promise.reject()))
      .then((me) => {
        if (done) return;
        const merged = mergeEarned(ref.current, parseEarned(me.prefs?.achievements));
        if (JSON.stringify(merged) !== JSON.stringify(ref.current)) save(merged);
      })
      .catch(() => {})
      .finally(() => !done && setSynced(true));
    return () => {
      done = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [live]);

  // The ship card goes first; toasts wait until it's done.
  useEffect(() => {
    const onShip = () => (quietUntil.current = Date.now() + AFTER_SHIP_MS);
    window.addEventListener(SHIP_EVENT, onShip);
    return () => window.removeEventListener(SHIP_EVENT, onShip);
  }, []);

  // Fold each state in.
  useEffect(() => {
    if (!state || !synced) return;
    let e = ref.current;
    const now = Date.now();
    const r = rocketsOf(state);
    if (rockets.current !== null && r > rockets.current) e = markDay(e, now); // shipped today: a real move
    rockets.current = r;
    const { earned: next, fresh } = check(e, state.repo, state, now, link?.current.streak ?? 0);
    if (next !== ref.current) save(next);
    if (!fresh.length || quiet) return;
    for (const a of fresh) link?.current.onUnlock?.(a);
    const shown: Toast[] = fresh.slice(0, MAX_TOASTS).map((a, i) => ({ key: now + i, a }));
    if (fresh.length > MAX_TOASTS) shown.push({ key: now + MAX_TOASTS, more: fresh.length - MAX_TOASTS });
    queue.current.push(...shown);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state, synced, quiet]);

  // One toast at a time, one clock for all of them.
  const shownAt = useRef(0);
  useEffect(() => {
    const tick = setInterval(() => {
      const now = Date.now();
      if (shownAt.current) {
        if (now - shownAt.current < TOAST_MS) return;
        shownAt.current = 0;
        setToast(null);
        return; // a beat between toasts
      }
      const head = queue.current[0];
      if (!head || (now < quietUntil.current && now - head.key < MAX_WAIT_MS)) return;
      queue.current.shift();
      shownAt.current = now;
      setToast(head);
      if (head.a) sound.play("achievement");
    }, 250);
    return () => clearInterval(tick);
  }, []);

  // A card answered or skipped is a real decision too: it counts for the day's streak.
  const saveRef = useRef(save);
  saveRef.current = save;
  const send = useCallback(
    (m: WebToServer) => {
      if (m.type === "choose_move" || m.type === "defer_move" || m.type === "dismiss_move") {
        const e = markDay(ref.current, Date.now());
        if (e !== ref.current) saveRef.current(e);
      }
      sendRaw(m);
    },
    [sendRaw],
  );

  return { earned, toast, dismiss: () => { shownAt.current = 0; setToast(null); }, send, count: Object.keys(earned.got).length };
}

function Badge({ a, got, size = 22 }: { a: Achievement; got: boolean; size?: number }) {
  return (
    <span className={`ach-badge ${a.tier}${got ? " got" : ""}`} aria-hidden="true">
      <Icon name={(got ? a.icon : "lock") as IconName} size={size} />
    </span>
  );
}

export function AchievementToast({ toast, onOpen, onDismiss }: { toast: Toast | null; onOpen: () => void; onDismiss: () => void }) {
  if (!toast) return null;
  return (
    <div className="ach-toast-wrap" role="status" aria-live="polite">
      <button type="button" key={toast.key} className={`card ach-toast${toast.a ? ` ${toast.a.tier}` : ""}`} onClick={() => { onDismiss(); onOpen(); }}>
        {toast.a ? (
          <>
            <Badge a={toast.a} got size={26} />
            <span className="ach-tbody">
              <span className="ach-kicker">Achievement unlocked</span>
              <span className="ach-tname">{toast.a.name}</span>
              <span className="ach-twhat">{toast.a.what}</span>
            </span>
            <span className="ach-xp">+{toast.a.xp} XP</span>
          </>
        ) : (
          <span className="ach-tbody">
            <span className="ach-kicker">And {toast.more} more</span>
            <span className="ach-twhat">Tap to see every badge you've earned.</span>
          </span>
        )}
      </button>
    </div>
  );
}

const fmtDay = (t: number) => new Date(t).toLocaleDateString(undefined, { month: "short", day: "numeric" });

export function AchievementsSheet({ earned, state, streak = 0, onClose }: { earned: Earned; state: FactoryState | null; streak?: number; onClose: () => void }) {
  const rows = board(earned, state, streak);
  const got = rows.filter((r) => r.got).length;
  return (
    <section className="card sheet achievements" aria-label="Achievements">
      <div className="sheet-top">
        <h2>Achievements</h2>
        <button type="button" className="hud-iconbtn" onClick={onClose} aria-label="Close">
          <Icon name="cross" size={14} />
        </button>
      </div>
      <div className="rs-packs">
        <span className="rs-flask ach-head">
          <Icon name="medal" size={22} />
        </span>
        <span>
          <b>{got}</b>of {ACHIEVEMENTS.length} earned
          <small>Each one is something that really happened in your repo.</small>
        </span>
      </div>
      <div className="ach-list">
        {rows.map(({ a, got, have }) => (
          <div key={a.id} className={`ach-row${got ? " got" : ""}`}>
            <Badge a={a} got={!!got} />
            <span className="rs-body">
              <span className="rs-name">
                {a.name}
                <span className={`ach-tier ${a.tier}`}>{TIER_LABEL[a.tier]}</span>
              </span>
              <span className="rs-what">{a.what}</span>
              {!got && a.need > 1 && (
                <span className="meter ach-meter" role="meter" aria-valuemin={0} aria-valuemax={a.need} aria-valuenow={have} aria-label={`${have} of ${a.need}`}>
                  <i style={{ width: `${Math.round((have / a.need) * 100)}%` }} />
                </span>
              )}
            </span>
            <span className="ach-side">{got ? fmtDay(got.at) : a.need > 1 ? `${have}/${a.need}` : `+${a.xp} XP`}</span>
          </div>
        ))}
      </div>
    </section>
  );
}
