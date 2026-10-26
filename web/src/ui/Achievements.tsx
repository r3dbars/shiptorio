// Achievements (shared/src/achievements.ts): badges for real outcomes. The hook folds every factory state into the
// player's record and queues an unlock toast with its own sound; the sheet shows every badge and how close you are.
//
// Live: the record lives in this browser and in the account's `achievements` pref, merged on load (earliest unlock
// wins), so it follows the player across browsers. Sim: kept in memory only, so every demo run unlocks them again
// and a sim never writes fake wins onto a real account.

import { useEffect, useRef, useState } from "react";
import { ACHIEVEMENTS, board, check, emptyEarned, markDay, mergeEarned, parseEarned, type Achievement, type Earned, type FactoryState, type WebToServer } from "@shiptorio/shared";
import { savePref } from "../account";
import { sound } from "../sound/engine";
import { SHIP_EVENT, SHIP_TIMING } from "../sound/ship";
import { Icon, type IconName } from "./icons";
import { Medallion } from "./ironArt";
import { ACHIEVE, WORDS } from "../copy";

import { achievementStorageKey, shipBaseline, shippedSince, type ShipBaseline } from "./achievementState";
const TOAST_MS = 4200;
const AFTER_SHIP_MS = SHIP_TIMING.doneMs + 3200; // let the ship card have its moment first
const MAX_WAIT_MS = 6000; // ...but back-to-back ships (a permit lane) never starve the toasts
const MAX_TOASTS = 3; // opening a factory that already shipped a lot: three toasts, then one "and N more"

function readLocal(profile: string): Earned {
  try {
    return parseEarned(localStorage.getItem(achievementStorageKey(profile)));
  } catch {
    return emptyEarned();
  }
}

export interface Toast {
  key: number; // also when it was queued
  a?: Achievement;
  more?: number;
}

/** Folds the factory in and hands back the record plus the toast showing right now. Accepted card decisions use progression’s authoritative streak; attempted sends earn nothing. */
// link: filled in by the caller after progression is set up: its best streak, and where an unlock's XP goes.
export interface ProgressLink {
  streak: number;
  onUnlock?: (a: Achievement) => void;
  /** true while something owns the top of the screen (the first-run coach card): unlocks queue until it's gone */
  hold?: boolean;
}

export function useAchievements(state: FactoryState | null, live: boolean, quiet: boolean, sendRaw: (m: WebToServer) => void, link: { current: ProgressLink } | undefined, profile: string) {
  const [earned, setEarned] = useState<Earned>(() => (live ? readLocal(profile) : emptyEarned()));
  const [toast, setToast] = useState<Toast | null>(null);
  const queue = useRef<Toast[]>([]);
  const quietUntil = useRef(0);
  const rockets = useRef<ShipBaseline | null>(null);
  const ref = useRef(earned);
  ref.current = earned;
  const [synced, setSynced] = useState<string | null>(live ? null : profile);

  const save = (e: Earned) => {
    ref.current = e;
    setEarned(e);
    if (!live) return;
    const raw = JSON.stringify(e);
    try {
      localStorage.setItem(achievementStorageKey(profile), raw);
    } catch {
      // the account copy still holds it
    }
    savePref("achievements", raw);
  };

  // Live: pull the account's copy once and merge, so a new browser doesn't re-toast what you already have.
  useEffect(() => {
    queue.current = [];
    setToast(null);
    rockets.current = null;
    const local = live ? readLocal(profile) : emptyEarned();
    ref.current = local;
    setEarned(local);
    setSynced(live ? null : profile);
    if (!live) return;
    let done = false;
    fetch("/api/me")
      .then((r) => (r.ok ? (r.json() as Promise<{ login: string; prefs?: { achievements?: string } }>) : Promise.reject()))
      .then((me) => {
        if (done || profile !== `github:${me.login.toLowerCase()}`) return;
        const merged = mergeEarned(ref.current, parseEarned(me.prefs?.achievements));
        if (JSON.stringify(merged) !== JSON.stringify(ref.current)) save(merged);
        setSynced(profile);
      })
      .catch(() => {});
    return () => {
      done = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [live, profile]);

  // The ship card goes first; toasts wait until it's done.
  useEffect(() => {
    const onShip = () => (quietUntil.current = Date.now() + AFTER_SHIP_MS);
    window.addEventListener(SHIP_EVENT, onShip);
    return () => window.removeEventListener(SHIP_EVENT, onShip);
  }, []);

  // Fold each state in.
  useEffect(() => {
    if (!state || synced !== profile) return;
    let e = ref.current;
    const now = Date.now();
    const r = shipBaseline(state);
    if (shippedSince(rockets.current, r)) e = markDay(e, now); // shipped today: a real move
    rockets.current = r;
    const { earned: next, fresh } = check(e, state.repo, state, now, link?.current.streak ?? 0);
    if (next !== ref.current) save(next);
    if (!fresh.length || quiet) return;
    for (const a of fresh) link?.current.onUnlock?.(a);
    const shown: Toast[] = fresh.slice(0, MAX_TOASTS).map((a, i) => ({ key: now + i, a }));
    if (fresh.length > MAX_TOASTS) shown.push({ key: now + MAX_TOASTS, more: fresh.length - MAX_TOASTS });
    queue.current.push(...shown);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state, synced, quiet, profile]);

  // One toast at a time, one clock for all of them.
  const shownAt = useRef(0);
  useEffect(() => {
    const tick = setInterval(() => {
      const now = Date.now();
      if (shownAt.current) {
        // a coach card taking the top of the screen clears the toast early; the badge is in the sheet either way
        if (now - shownAt.current < TOAST_MS && !link?.current.hold) return;
        shownAt.current = 0;
        setToast(null);
        return; // a beat between toasts
      }
      const head = queue.current[0];
      if (!head || link?.current.hold || (now < quietUntil.current && now - head.key < MAX_WAIT_MS)) return;
      queue.current.shift();
      shownAt.current = now;
      setToast(head);
      if (head.a) sound.play("achievement");
    }, 250);
    return () => clearInterval(tick);
  }, []);

  // Accepted decisions already advance progression's streak. Sending a gesture does not
  // prove the server accepted it, so this hook never awards a day for an attempted send.

  return { earned, toast, dismiss: () => { shownAt.current = 0; setToast(null); }, send: sendRaw, count: Object.keys(earned.got).length };
}

function Badge({ a, got, size = 40 }: { a: Achievement; got: boolean; size?: number }) {
  return (
    <span className={`ach-badge ${a.tier}${got ? " got" : ""}`} aria-hidden="true">
      <Medallion tier={a.tier} icon={a.icon as IconName} got={got} size={size} />
    </span>
  );
}

export function AchievementToast({ toast, onOpen, onDismiss }: { toast: Toast | null; onOpen: () => void; onDismiss: () => void }) {
  if (!toast) return null;
  return (
    <div className="ach-toast-wrap" role="status" aria-live="polite">
      <button type="button" key={toast.key} className={`card ach-toast${toast.a ? ` ${toast.a.tier}` : " more"}`} onClick={() => { onDismiss(); onOpen(); }}>
        <span className="ach-sparks" aria-hidden="true" />
        {toast.a ? (
          <>
            <Badge a={toast.a} got size={56} />
            <span className="ach-tbody">
              <span className="ach-kicker">{ACHIEVE.unlocked}</span>
              <span className="ach-tname">{toast.a.name}</span>
              <span className="ach-twhat">{toast.a.what}</span>
            </span>
            <span className="ach-xp">{ACHIEVE.xp(toast.a.xp)}</span>
          </>
        ) : (
          <span className="ach-tbody">
            <span className="ach-kicker">{ACHIEVE.more(toast.more ?? 0)}</span>
            <span className="ach-twhat">{ACHIEVE.moreSub}</span>
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
    <section className="card sheet achievements" aria-label={ACHIEVE.title}>
      <div className="sheet-top">
        <div className="sheet-head">
          <span className="iron-eyebrow">{ACHIEVE.eyebrow}</span>
          <h2>{ACHIEVE.title}</h2>
        </div>
        <button type="button" className="hud-iconbtn" onClick={onClose} aria-label={WORDS.close}>
          <Icon name="cross" size={14} />
        </button>
      </div>
      <div className="rs-packs">
        <span className="rs-flask ach-head">
          <Icon name="medal" size={22} />
        </span>
        <span>
          <b>{got}</b>{ACHIEVE.earned(ACHIEVEMENTS.length)}
          <small>{ACHIEVE.earnedSub}</small>
        </span>
      </div>
      <div className="ach-list">
        {rows.map(({ a, got, have }) => (
          <div key={a.id} className={`ach-row${got ? " got" : ""}`}>
            <Badge a={a} got={!!got} />
            <span className="rs-body">
              <span className="rs-name">
                {a.name}
                <span className={`ach-tier ${a.tier}`}>{ACHIEVE.tier[a.tier]}</span>
              </span>
              <span className="rs-what">{a.what}</span>
              {!got && a.need > 1 && (
                <span className="meter ach-meter" role="meter" aria-valuemin={0} aria-valuemax={a.need} aria-valuenow={have} aria-label={`${have} of ${a.need}`}>
                  <i style={{ width: `${Math.round((have / a.need) * 100)}%` }} />
                </span>
              )}
            </span>
            <span className="ach-side">{got ? fmtDay(got.at) : a.need > 1 ? `${have}/${a.need}` : ACHIEVE.xp(a.xp)}</span>
          </div>
        ))}
      </div>
    </section>
  );
}
