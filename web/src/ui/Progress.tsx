// Progression (docs/PRODUCT.md "Progression"): level and streak in the top bar, XP pops when real things
// happen, a morning brief on the first open of the day, a progress sheet with today's tally, the deck trend
// (tomorrow's deck shrinking as trust grows) and unlocks. Plus an opt-in nudge when the bottleneck is you.
// Behind ?progress=1 until it's on by default. Rules live in shared/src/progression.ts.

import { useCallback, useEffect, useRef, useState } from "react";
import {
  achieved,
  answered,
  dayKey,
  levelOf,
  liveStreak,
  mergeProgress,
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
import { PressureGauge } from "./ironArt";
import { Icon, type IconName } from "./icons";
import { sound } from "../sound/engine";
import { PROGRESS, WORDS } from "../copy";

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
export const progressProfile = (kind: "sim" | "live", login?: string | null) => kind === "sim" ? "sim" : `github:${login?.toLowerCase() ?? "signed-out"}`;

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
  const loadedKey = useRef(key);
  cur.current = p;
  useEffect(() => {
    if (loadedKey.current === key) return;
    loadedKey.current = key;
    const next = parseProgress(store.get(key));
    cur.current = next;
    setP(next);
    setPop(null);
  }, [key]);

  // Signed in: progress follows you across devices. Pull once, merge, and push changes a few seconds later.
  const synced = on && profile.startsWith("github:") && profile !== "github:signed-out";
  const pushTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pull = useRef(false);
  const push = useCallback(() => {
    if (!synced) return;
    if (pushTimer.current) clearTimeout(pushTimer.current);
    pushTimer.current = setTimeout(() => {
      if (!pull.current) return; // never overwrite the server copy before reading it
      fetch("/api/me/progress", { method: "PUT", body: JSON.stringify(cur.current), headers: { "content-type": "application/json" } }).catch(() => {});
    }, 3000);
  }, [synced]);
  useEffect(() => {
    if (!synced) return;
    let live = true;
    pull.current = false;
    fetch("/api/me/progress")
      .then((r) => (r.ok ? r.json() : null))
      .then((body: { progress: Progress | null } | null) => {
        if (!live || !body) return;
        pull.current = true;
        const server = body.progress ? parseProgress(JSON.stringify(body.progress)) : null;
        const next = server ? mergeProgress(cur.current, server) : cur.current;
        cur.current = next;
        setP(next);
        store.set(key, JSON.stringify(next));
        push();
      })
      .catch(() => {});
    return () => {
      live = false;
    };
  }, [synced, key, push]);

  const apply = useCallback(
    (step: Step) => {
      cur.current = step.progress;
      setP(step.progress);
      store.set(key, JSON.stringify(step.progress));
      push();
      if (!step.gains.length && !step.unlocked.length) return;
      setPop({ id: ++seq.current, gains: step.gains, levelUp: step.levelUp, unlocked: step.unlocked });
      if (step.levelUp || step.unlocked.length) sound.play("level_up");
    },
    [key, push],
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
  // an achievement unlocked (ui/Achievements.tsx): its XP lands here
  const bonus = useCallback((xp: number, text: string) => on && apply(achieved(cur.current, Date.now(), xp, text)), [on, apply]);
  return { p, pop, card, equip, open, bonus };
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
    <button type="button" className="chip lvl-chip" onClick={onOpen} title={PROGRESS.chipTitle(lv.title, lv.have, lv.need, lv.level + 1)}>
      {/* the name is what the chip shows plus this, so voice control can say what it sees */}
      <span className="sr">{PROGRESS.chipLabel(lv.level, streak)}</span>
      <span className={`badge flame${today ? " lit" : ""}`}>
        <Icon name="flame" size={14} />
      </span>
      <span>
        {streak}
        <small>{PROGRESS.days(streak)}</small>
      </span>
      <span className="lvl">
        {PROGRESS.lv(lv.level)}
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
          <b>{PROGRESS.xp(xp)}</b>
          <span>{pop.gains.map((g) => g.text).join(" · ")}</span>
        </div>
      )}
      {pop.levelUp && (
        <div className="xp-level">
          <Icon name="up" size={16} /> {PROGRESS.levelUp(pop.levelUp.level, pop.levelUp.title)}
        </div>
      )}
      {pop.unlocked.map((u) => (
        <div className="xp-unlock" key={u.id}>
          <span className="rs-ico">
            <Icon name={u.icon as IconName} size={18} />
          </span>
          <span>
            <b>{PROGRESS.unlocked(u.name)}</b>
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
            <small>{i === s.trend.length - 1 ? PROGRESS.today : new Date(`${d.day}T12:00`).toLocaleDateString(undefined, { weekday: "narrow" })}</small>
          </span>
        ))}
      </div>
      <p className="empty">
        {s.shrink === null
          ? PROGRESS.trendEmpty
          : s.shrink > 0
            ? PROGRESS.trendDown(s.shrink, s.trend.length - 1)
            : s.shrink < 0
              ? PROGRESS.trendUp(-s.shrink, s.trend.length - 1)
              : PROGRESS.trendSame}
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
        <b>{t.ships}</b>{PROGRESS.tally.ships}
      </div>
      <div>
        <b>{t.cards}</b>{PROGRESS.tally.cards}
      </div>
      <div>
        <b>+{t.xp}</b>{PROGRESS.tally.xp}
      </div>
    </div>
  );
}

// ---- the morning brief ----

/** Show it once per day, on the first open, when there's something worth saying. */
export function useBrief(on: boolean, ready: boolean, profile = "me") {
  const key = `${BRIEF_KEY}:${profile}`;
  const [show, setShow] = useState(false);
  useEffect(() => {
    if (!on || !ready) return;
    const today = dayKey(Date.now());
    if (store.get(key) === today) return;
    store.set(key, today);
    setShow(true);
  }, [on, ready, key]);
  return { show, close: () => setShow(false) };
}

export function MorningBrief({ p, deck, onCheckin, onClose }: { p: Progress; deck: Move[]; onCheckin: () => void; onClose: () => void }) {
  const s = summary(p, Date.now());
  const streak = liveStreak(p, Date.now());
  const y = s.yesterday;
  const hour = new Date().getHours();
  const hello = PROGRESS.hello(hour);
  const keep = streak > 0 && p.last !== dayKey(Date.now());
  return (
    <section className="card nextmove brief" aria-label={PROGRESS.briefLabel}>
      <div className="nm-head">
        <span className="nm-kicker">
          <Icon name="sun" size={14} /> {hello}
        </span>
        {streak > 0 && (
          <span className="brief-streak">
            <Icon name="flame" size={12} /> {PROGRESS.streak(streak)}
          </span>
        )}
      </div>
      <h2 className="nm-title">
        {deck.length === 0
          ? PROGRESS.nothing
          : PROGRESS.cardsToday(deck.length)}
      </h2>
      {y && (
        <p className="nm-why">
          {PROGRESS.lastTime(y.ships, y.cards, Math.round((y.automated ?? 0) * 100))}
          {keep ? PROGRESS.keepStreak(streak + 1) : ""}
        </p>
      )}
      {!y && <p className="nm-why">{PROGRESS.startStreak}</p>}
      <DeckTrend p={p} />
      <div className="nm-options">
        {deck.length > 0 ? (
          <button type="button" className="btn rec" onClick={onCheckin}>
            {PROGRESS.checkin(deck.length)}
            <small>{PROGRESS.twoMinutes}</small>
          </button>
        ) : null}
        <button type="button" className="btn" onClick={onClose}>
          {deck.length > 0 ? PROGRESS.later : PROGRESS.back}
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
    <section className="card sheet progress" aria-label={PROGRESS.sheet}>
      <div className="sheet-top">
        <h2>{PROGRESS.sheetTitle(lv.level, lv.title)}</h2>
        <button type="button" className="hud-iconbtn" onClick={onClose} aria-label={WORDS.close}>
          <Icon name="cross" size={14} />
        </button>
      </div>
      <div className="pg-level">
        <PressureGauge into={lv.into} />
        <span className="pg-odo">
          <span className="iron-eyebrow">{PROGRESS.gauge}</span>
          <span className="pg-digits" aria-hidden="true">
            {String(lv.level).padStart(2, "0").split("").map((d, i) => <i key={i}>{d}</i>)}
          </span>
          <span>{PROGRESS.toLevel(lv.have, lv.need, lv.level + 1)}</span>
        </span>
      </div>
      <div className="pg-streak">
        <span className="badge flame lit">
          <Icon name="flame" size={18} />
        </span>
        <span>
          <b>{streak}</b>{PROGRESS.streakSuffix}
          <small>
            {PROGRESS.best(p.best)}
            {p.unlocked.includes("freeze") ? PROGRESS.shields(p.freezes) : ""}
          </small>
        </span>
        <span className="pg-week" aria-label={PROGRESS.week}>
          {week.map((w) => (
            <i key={w.d} className={`${w.lit ? "lit" : ""}${w.d === today ? " today" : ""}`} title={w.d} />
          ))}
        </span>
      </div>
      <h3>{PROGRESS.todayHead}</h3>
      <DayTally p={p} />
      <h3>{PROGRESS.waitingEachDay}</h3>
      <DeckTrend p={p} />
      <h3>{PROGRESS.unlocks}</h3>
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
                {p.equip[u.id] !== false ? WORDS.on : WORDS.off}
              </button>
            ) : have ? (
              <span className="pill rs-done">
                <Icon name="check" size={10} /> {PROGRESS.yours}
              </span>
            ) : (
              <span className="rs-why">{u.level !== undefined ? PROGRESS.needLevel(u.level) : PROGRESS.needStreak(u.streak ?? 0)}</span>
            )}
          </div>
        );
      })}
      {next && <p className="empty">{PROGRESS.next(next.unlock.name, next.gap.toLowerCase())}</p>}
      <h3>{PROGRESS.nudges}</h3>
      <div className="row2">
        <span>{PROGRESS.nudgeAsk}</span>
        <button type="button" className="toggle" aria-pressed={notify === "on"} disabled={notify === "unsupported" || notify === "blocked"} onClick={onNotify}>
          {PROGRESS.nudge[notify]}
        </button>
      </div>
      <p className="empty">
        {notify === "blocked"
          ? PROGRESS.nudgeBlocked
          : notify === "unsupported"
            ? PROGRESS.nudgeUnsupported
            : PROGRESS.nudgeWhat}
      </p>
      <p className="empty">{PROGRESS.xpRule}</p>
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
    if (!on || state !== "on" || !("serviceWorker" in navigator)) return;
    navigator.serviceWorker.register("/sw.js").catch(() => {});
  }, [on, state]);

  useEffect(() => {
    const was = lastCount.current;
    lastCount.current = deck.length;
    if (!on || state !== "on" || deck.length <= was || !document.hidden || Date.now() - lastAt.current < NOTIFY_GAP) return;
    lastAt.current = Date.now();
    const title = PROGRESS.notifyTitle(deck.length);
    const opts: NotificationOptions = { body: deck[0]?.title ?? PROGRESS.notifyBody, tag: "shiptorio-bottleneck", data: { url: location.href } };
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
