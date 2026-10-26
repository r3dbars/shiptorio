// Progression (docs/PRODUCT.md "Progression"): level and streak in the top bar, XP pops when real things
// happen, a morning brief on the first open of the day, a progress sheet with today's tally, the deck trend
// (tomorrow's deck shrinking as trust grows) and unlocks. Plus an opt-in nudge when the bottleneck is you.
// Behind ?progress=1 until it's on by default. Rules live in shared/src/progression.ts.

import { useCallback, useEffect, useRef, useState } from "react";
import {
  answered,
  dayKey,
  levelOf,
  liveStreak,
  nextUnlock,
  observe,
  openDay,
  parseProgress,
  summary,
  UNLOCKS,
  type FactoryState,
  type Gain,
  type Move,
  type Progress,
  type Step,
  type Unlock,
} from "@shiptorio/shared";
import { Icon, type IconName } from "./icons";
import { sound } from "../sound/engine";

const ON_KEY = "shiptorio:progress-on";
const BRIEF_KEY = "shiptorio:brief-day";
const NOTIFY_KEY = "shiptorio:notify";
const store = {
  get: (k: string) => {
    try {
      return localStorage.getItem(k);
    } catch {
      return null;
    }
  },
  set: (k: string, v: string | null) => {
    try {
      if (v === null) localStorage.removeItem(k);
      else localStorage.setItem(k, v);
    } catch {
      // this visit only
    }
  },
};

/** ?progress=1 turns progression on for this browser (and remembers it); ?progress=0 turns it back off. */
export function progressOn(): boolean {
  const q = new URLSearchParams(location.search).get("progress");
  if (q === "1" || q === "demo") store.set(ON_KEY, "1");
  if (q === "0") store.set(ON_KEY, null);
  return store.get(ON_KEY) === "1";
}

export interface Pop {
  id: number;
  gains: Gain[];
  levelUp?: { level: number; title: string };
  unlocked: Unlock[];
}

/** One player's progress, kept per browser profile ("sim" playtests never touch the real one). */
export function useProgress(state: FactoryState | null, profile: string, repo: string, on: boolean) {
  const key = `shiptorio:progress:${profile}`;
  // ?progress=demo in the sim: a week of play already behind you, to see the streak, unlocks and trend
  const [p, setP] = useState<Progress>(() =>
    profile === "sim" && new URLSearchParams(location.search).get("progress") === "demo" ? demoProgress(Date.now()) : parseProgress(store.get(key)),
  );
  const [pop, setPop] = useState<Pop | null>(null);
  const seq = useRef(0);
  const cur = useRef(p);
  cur.current = p;

  const apply = useCallback(
    (step: Step) => {
      cur.current = step.progress;
      setP(step.progress);
      store.set(key, JSON.stringify(step.progress));
      if (!step.gains.length && !step.unlocked.length) return;
      setPop({ id: ++seq.current, gains: step.gains, levelUp: step.levelUp, unlocked: step.unlocked });
      if (step.levelUp || step.unlocked.length) sound.play("level_up");
    },
    [key],
  );

  useEffect(() => {
    if (on && state) apply(observe(cur.current, repo, state, Date.now()));
  }, [on, state, repo, apply]);

  useEffect(() => {
    if (!pop) return;
    const t = setTimeout(() => setPop(null), pop.levelUp || pop.unlocked.length ? 4200 : 2400);
    return () => clearTimeout(t);
  }, [pop]);

  const card = useCallback((left: number) => on && apply(answered(cur.current, Date.now(), left)), [on, apply]);
  const equip = useCallback(
    (id: string, v: boolean) => {
      const next = { ...cur.current, equip: { ...cur.current.equip, [id]: v } };
      apply({ progress: next, gains: [], unlocked: [] });
    },
    [apply],
  );
  // the first open of a new day: the day log remembers the deck you walked in to
  const open = useCallback((deck: number) => apply({ progress: openDay(cur.current, Date.now(), deck), gains: [], unlocked: [] }), [apply]);
  return { p, pop, card, equip, open };
}

function demoProgress(now: number): Progress {
  const decks = [12, 11, 11, 9, 8, 7];
  const days = decks.map((deck, i) => ({ day: dayKey(now - (decks.length - i) * 86_400_000), xp: 40 + i * 9, ships: 2 + (i % 3), cards: deck - 1, deck, automated: 0.1 + i * 0.05 }));
  return { ...parseProgress(null), xp: 290, streak: 4, best: 4, last: days[days.length - 1].day, days, unlocked: ["lanterns", "glass-lake"], equip: { lanterns: true, "glass-lake": true } };
}

/** What the map draws for the cosmetics you've switched on. */
export function cosmeticsOf(p: Progress, on: boolean) {
  if (!on) return undefined;
  const has = (id: string) => p.unlocked.includes(id) && p.equip[id] !== false;
  return { glassLake: has("glass-lake"), lanterns: has("lanterns") ? Math.max(1, Math.min(14, liveStreak(p, Date.now()))) : 0, goldPad: has("gold-pad") };
}

// ---- top bar ----

export function ProgressChip({ p, onOpen }: { p: Progress; onOpen: () => void }) {
  const lv = levelOf(p.xp);
  const streak = liveStreak(p, Date.now());
  const today = p.last === dayKey(Date.now());
  return (
    <button type="button" className="chip lvl-chip" onClick={onOpen} aria-label={`Level ${lv.level}, ${streak}-day streak. Open progress`} title={`${lv.title} · ${lv.have}/${lv.need} XP to level ${lv.level + 1}`}>
      <span className={`badge flame${today ? " lit" : ""}`}>
        <Icon name="flame" size={14} />
      </span>
      <span>
        {streak}
        <small>{streak === 1 ? "day" : "days"}</small>
      </span>
      <span className="lvl">
        Lv {lv.level}
        <i style={{ width: `${Math.round(lv.into * 100)}%` }} />
      </span>
    </button>
  );
}

/** "+15 XP · PR shipped", then a bigger moment for a level-up or an unlock. */
export function XpPop({ pop }: { pop: Pop | null }) {
  if (!pop) return null;
  const xp = pop.gains.reduce((n, g) => n + g.xp, 0);
  const big = pop.levelUp || pop.unlocked.length > 0;
  return (
    <div key={pop.id} className={`xp-pop card${big ? " big" : ""}`} role="status" aria-live="polite">
      {xp > 0 && (
        <div className="xp-line">
          <b>+{xp} XP</b>
          <span>{pop.gains.map((g) => g.text).join(" · ")}</span>
        </div>
      )}
      {pop.levelUp && (
        <div className="xp-level">
          <Icon name="up" size={16} /> Level {pop.levelUp.level} · {pop.levelUp.title}
        </div>
      )}
      {pop.unlocked.map((u) => (
        <div className="xp-unlock" key={u.id}>
          <span className="rs-ico">
            <Icon name={u.icon as IconName} size={18} />
          </span>
          <span>
            <b>Unlocked: {u.name}</b>
            <small>{u.what}</small>
          </span>
        </div>
      ))}
    </div>
  );
}

// ---- the deck trend: the score is how few need you tomorrow ----

export function DeckTrend({ p }: { p: Progress }) {
  const s = summary(p, Date.now());
  const max = Math.max(1, ...s.trend.map((d) => d.deck));
  return (
    <div className="pg-trend">
      <div className="pg-bars" aria-hidden="true">
        {s.trend.map((d, i) => (
          <span key={d.day} className={i === s.trend.length - 1 ? "now" : ""}>
            <i style={{ height: `${Math.max(6, Math.round((d.deck / max) * 100))}%` }} />
            <small>{i === s.trend.length - 1 ? "today" : new Date(`${d.day}T12:00`).toLocaleDateString(undefined, { weekday: "narrow" })}</small>
          </span>
        ))}
      </div>
      <p className="empty">
        {s.shrink === null
          ? "Cards waiting on you each morning. Play a few days and watch it shrink as trust grows."
          : s.shrink > 0
            ? `${s.shrink} fewer card${s.shrink === 1 ? "" : "s"} waiting on you than ${s.trend.length - 1} day${s.trend.length === 2 ? "" : "s"} ago. Trust is growing.`
            : s.shrink < 0
              ? `${-s.shrink} more than ${s.trend.length - 1} day${s.trend.length === 2 ? "" : "s"} ago. New work came in. Clean ships and new checks shrink it.`
              : "Same as before. Clean ships, new checks and launch permits shrink it."}
      </p>
    </div>
  );
}

/** Today's tally: used in the progress sheet and at the end of a check-in. */
export function DayTally({ p }: { p: Progress }) {
  const t = summary(p, Date.now()).today;
  return (
    <div className="pg-tally">
      <div>
        <b>{t.ships}</b>shipped
      </div>
      <div>
        <b>{t.cards}</b>cards answered
      </div>
      <div>
        <b>+{t.xp}</b>XP today
      </div>
    </div>
  );
}

// ---- the morning brief ----

/** Show it once per day, on the first open, when there's something worth saying. */
export function useBrief(on: boolean, ready: boolean) {
  const [show, setShow] = useState(false);
  useEffect(() => {
    if (!on || !ready) return;
    const today = dayKey(Date.now());
    if (store.get(BRIEF_KEY) === today) return;
    store.set(BRIEF_KEY, today);
    setShow(true);
  }, [on, ready]);
  return { show, close: () => setShow(false) };
}

export function MorningBrief({ p, deck, onCheckin, onClose }: { p: Progress; deck: Move[]; onCheckin: () => void; onClose: () => void }) {
  const s = summary(p, Date.now());
  const streak = liveStreak(p, Date.now());
  const y = s.yesterday;
  const hour = new Date().getHours();
  const hello = hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening";
  const keep = streak > 0 && p.last !== dayKey(Date.now());
  return (
    <section className="card nextmove brief" aria-label="Today">
      <div className="nm-head">
        <span className="nm-kicker">
          <Icon name="sun" size={14} /> {hello}
        </span>
        {streak > 0 && (
          <span className="brief-streak">
            <Icon name="flame" size={12} /> {streak}-day streak
          </span>
        )}
      </div>
      <h2 className="nm-title">
        {deck.length === 0
          ? "Nothing is waiting on you. The factory's running."
          : `${deck.length} card${deck.length === 1 ? "" : "s"} waiting on you today.`}
      </h2>
      {y && (
        <p className="nm-why">
          Last time: {y.ships} shipped, {y.cards} cards answered{y.automated ? `, ${Math.round(y.automated * 100)}% launched on their own` : ""}.
          {keep ? ` One move today keeps your streak at ${streak + 1}.` : ""}
        </p>
      )}
      {!y && <p className="nm-why">Answer a card or ship a PR every day to start a streak. Streaks unlock things for your island.</p>}
      <DeckTrend p={p} />
      <div className="nm-options">
        {deck.length > 0 ? (
          <button type="button" className="btn rec" onClick={onCheckin}>
            Check in · {deck.length}
            <small>about two minutes</small>
          </button>
        ) : null}
        <button type="button" className="btn" onClick={onClose}>
          {deck.length > 0 ? "Later" : "Back to the floor"}
        </button>
      </div>
    </section>
  );
}

// ---- the progress sheet ----

export function ProgressSheet({ p, notify, onNotify, onEquip, onClose }: { p: Progress; notify: NotifyState; onNotify: () => void; onEquip: (id: string, on: boolean) => void; onClose: () => void }) {
  const lv = levelOf(p.xp);
  const streak = liveStreak(p, Date.now());
  const next = nextUnlock(p);
  const today = dayKey(Date.now());
  // the last 7 days, lit where you played
  const week = Array.from({ length: 7 }, (_, i) => dayKey(Date.now() - (6 - i) * 86_400_000)).map((d) => ({ d, lit: p.days.some((x) => x.day === d && (x.cards > 0 || x.ships > 0)) }));
  return (
    <section className="card sheet progress" aria-label="Progress">
      <div className="sheet-top">
        <h2>
          Level {lv.level} · {lv.title}
        </h2>
        <button type="button" className="hud-iconbtn" onClick={onClose} aria-label="Close">
          <Icon name="cross" size={14} />
        </button>
      </div>
      <div className="pg-level">
        <div className="pg-bar">
          <i style={{ width: `${Math.round(lv.into * 100)}%` }} />
        </div>
        <span>
          {lv.have}/{lv.need} XP to level {lv.level + 1}
        </span>
      </div>
      <div className="pg-streak">
        <span className="badge flame lit">
          <Icon name="flame" size={18} />
        </span>
        <span>
          <b>{streak}</b>-day streak
          <small>
            Best {p.best}
            {p.unlocked.includes("freeze") ? ` · ${p.freezes} shield${p.freezes === 1 ? "" : "s"}` : ""}
          </small>
        </span>
        <span className="pg-week" aria-label="This week">
          {week.map((w) => (
            <i key={w.d} className={`${w.lit ? "lit" : ""}${w.d === today ? " today" : ""}`} title={w.d} />
          ))}
        </span>
      </div>
      <h3>Today</h3>
      <DayTally p={p} />
      <h3>Waiting on you each day</h3>
      <DeckTrend p={p} />
      <h3>Unlocks</h3>
      {UNLOCKS.map((u) => {
        const have = p.unlocked.includes(u.id);
        return (
          <div key={u.id} className={`rs-node ${have ? "done" : "locked"}`}>
            <span className="rs-ico" aria-hidden="true">
              <Icon name={(have ? u.icon : "lock") as IconName} size={22} />
            </span>
            <span className="rs-body">
              <span className="rs-name">{u.name}</span>
              <span className="rs-what">{u.what}</span>
            </span>
            {have && u.cosmetic ? (
              <button type="button" className="toggle" aria-pressed={p.equip[u.id] !== false} onClick={() => onEquip(u.id, p.equip[u.id] === false)}>
                {p.equip[u.id] !== false ? "On" : "Off"}
              </button>
            ) : have ? (
              <span className="pill rs-done">
                <Icon name="check" size={10} /> Yours
              </span>
            ) : (
              <span className="rs-why">{u.level !== undefined ? `Level ${u.level}` : `${u.streak}-day streak`}</span>
            )}
          </div>
        );
      })}
      {next && <p className="empty">Next: {next.unlock.name} at {next.gap.toLowerCase()}.</p>}
      <h3>Nudges</h3>
      <div className="row2">
        <span>Tell me when I'm the bottleneck</span>
        <button type="button" className="toggle" aria-pressed={notify === "on"} disabled={notify === "unsupported" || notify === "blocked"} onClick={onNotify}>
          {notify === "on" ? "On" : notify === "blocked" ? "Blocked" : notify === "unsupported" ? "n/a" : "Off"}
        </button>
      </div>
      <p className="empty">
        {notify === "blocked"
          ? "Notifications are blocked for this site in your browser settings."
          : notify === "unsupported"
            ? "This browser can't show notifications. On iPhone, add Shiptorio to your home screen first."
            : "One quiet notification when new cards land and you're not looking. Never more than one every 15 minutes."}
      </p>
      <p className="empty">XP only comes from real results: ships, clean ships, launches that hold, checks you add, cards you answer.</p>
    </section>
  );
}

// ---- "the bottleneck is you" nudge ----

export type NotifyState = "on" | "off" | "blocked" | "unsupported";
const NOTIFY_GAP = 15 * 60_000;

function readNotify(): NotifyState {
  if (typeof Notification === "undefined") return "unsupported";
  if (Notification.permission === "denied") return "blocked";
  return Notification.permission === "granted" && store.get(NOTIFY_KEY) === "1" ? "on" : "off";
}

/** Opt-in, while the tab is open in the background: one notification when new cards wait on you. */
export function useBottleneckNudge(deck: Move[], on: boolean) {
  const [state, setState] = useState<NotifyState>(readNotify);
  const lastCount = useRef(deck.length);
  const lastAt = useRef(0);

  useEffect(() => {
    if (state !== "on" || !("serviceWorker" in navigator)) return;
    navigator.serviceWorker.register("/sw.js").catch(() => {});
  }, [state]);

  useEffect(() => {
    const was = lastCount.current;
    lastCount.current = deck.length;
    if (!on || state !== "on" || deck.length <= was || !document.hidden || Date.now() - lastAt.current < NOTIFY_GAP) return;
    lastAt.current = Date.now();
    const title = `${deck.length} card${deck.length === 1 ? "" : "s"} waiting on you`;
    const opts: NotificationOptions = { body: deck[0]?.title ?? "The factory needs a decision.", tag: "shiptorio-bottleneck", data: { url: location.href } };
    const show = async () => {
      const reg = "serviceWorker" in navigator ? await navigator.serviceWorker.getRegistration() : undefined;
      if (reg) return reg.showNotification(title, opts);
      new Notification(title, opts);
    };
    show().catch(() => {});
  }, [deck, on, state]);

  const toggle = async () => {
    if (state === "on") {
      store.set(NOTIFY_KEY, null);
      return setState("off");
    }
    if (typeof Notification === "undefined") return;
    const perm = Notification.permission === "granted" ? "granted" : await Notification.requestPermission();
    if (perm === "granted") store.set(NOTIFY_KEY, "1");
    setState(readNotify());
  };
  return { notify: state, toggleNotify: toggle };
}
