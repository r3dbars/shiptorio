// The activity tray (top-right bell): what you should do, then what the factory just did.
// Tap any card for the details; "Show on map" flies the camera there. Stats and settings live at the bottom,
// so the main screen can stay nearly empty (docs/VISION.md: simple, mobile first).

import { useState, type ReactNode } from "react";
import type { Item, Move, WebToServer } from "@shiptorio/shared";
import type { LogLine } from "../store";
import { Icon, type IconName } from "./icons";
import { ACTIVITY, STAGE_LABEL, WORDS } from "../copy";

const UNDO_MS = 5 * 60_000;
const FEED_MAX = 40;

function ago(at: number) {
  const s = Math.max(0, Math.round((Date.now() - at) / 1000));
  if (s < 60) return "now";
  const m = Math.round(s / 60);
  return m < 60 ? `${m}m` : `${Math.round(m / 60)}h`;
}

const LEVEL_ICON: Record<LogLine["level"], { icon: IconName; tone: string }> = {
  info: { icon: "bot", tone: "info" },
  success: { icon: "check", tone: "ok" },
  warn: { icon: "eye", tone: "warn" },
  error: { icon: "cross", tone: "bad" },
};

interface Props {
  deck: Move[];
  pad: Item[];
  log: LogLine[];
  live: boolean; // undo only works against a live source
  send: (msg: WebToServer) => void;
  onShow: (focus: string) => void;
  onLaunch: (item: Item) => void;
  onCheckin?: () => void;
  onClose: () => void;
  header: ReactNode; // repo + connection status
  stats?: ReactNode;
  settings: ReactNode;
}

export function ActivityTray({ deck, pad, log, live, send, onShow, onLaunch, onCheckin, onClose, header, stats, settings }: Props) {
  const [open, setOpen] = useState<string | null>(null);
  const toggle = (id: string) => setOpen((v) => (v === id ? null : id));
  const ready = pad.filter((i) => i.state === "on_pad");
  const feed = log.slice(-FEED_MAX).reverse();

  return (
    <>
      <div className="tray-scrim" onClick={onClose} aria-hidden="true" />
      <aside className="tray" aria-label={ACTIVITY.title}>
        <div className="tray-top">
          <div>
            <h2>{ACTIVITY.title}</h2>
            <div className="tray-sub">{header}</div>
          </div>
          <button type="button" className="hud-iconbtn" onClick={onClose} aria-label={ACTIVITY.close}>
            <Icon name="cross" size={14} />
          </button>
        </div>

        <h3>{ACTIVITY.yourMove}</h3>
        {onCheckin && deck.length > 1 && (
          <button type="button" className="btn rec tray-checkin" onClick={onCheckin}>
            {ACTIVITY.checkin(deck.length)}
          </button>
        )}
        {deck.length === 0 && ready.length === 0 && <p className="tray-empty">{ACTIVITY.nothing}</p>}
        {deck.map((m) => {
          const id = `m:${m.id}`;
          const on = open === id;
          return (
            <div key={id} className={`tcard todo${on ? " on" : ""}`}>
              <button type="button" className="tcard-head" aria-expanded={on} onClick={() => toggle(id)}>
                <span className="tdot warn"><Icon name="star" size={14} /></span>
                <span className="tt">
                  {m.title}
                  {m.stage && <code>{STAGE_LABEL[m.stage]}</code>}
                </span>
              </button>
              {on && (
                <div className="tmore">
                  <p>{m.why}</p>
                  <div className="tbtns">
                    {m.options.map((o) => (
                      <button key={o.id} type="button" className={o.recommended ? "btn rec" : "btn"} onClick={() => send({ type: "choose_move", moveId: m.id, optionId: o.id })}>
                        {o.label}
                        {o.recommended && <span className="sugg">{WORDS.suggested}</span>}
                      </button>
                    ))}
                  </div>
                  {m.focus && (
                    <button type="button" className="btn ghost" onClick={() => onShow(m.focus!)}>
                      {ACTIVITY.showOnMap}
                    </button>
                  )}
                </div>
              )}
            </div>
          );
        })}
        {ready.map((i) => {
          const id = `p:${i.id}`;
          const on = open === id;
          return (
            <div key={id} className={`tcard todo${on ? " on" : ""}`}>
              <button type="button" className="tcard-head" aria-expanded={on} onClick={() => toggle(id)}>
                <span className="tdot warn"><Icon name="rocket" size={14} /></span>
                <span className="tt">
                  {ACTIVITY.launchRow(`#${i.prNumber}`, i.title)}
                  {i.district && <code>{i.district}</code>}
                </span>
              </button>
              {on && (
                <div className="tmore">
                  <p>{ACTIVITY.launchWhy}</p>
                  <div className="tbtns">
                    <button type="button" className="btn rec" onClick={() => onLaunch(i)}>
                      {ACTIVITY.launch}
                    </button>
                    {i.prUrl && (
                      <a className="btn" href={i.prUrl} target="_blank" rel="noreferrer">
                        {WORDS.openPr}
                      </a>
                    )}
                  </div>
                </div>
              )}
            </div>
          );
        })}

        <h3>{ACTIVITY.feed}</h3>
        {feed.length === 0 && <p className="tray-empty">{ACTIVITY.feedEmpty}</p>}
        {feed.map((l, n) => {
          const id = `l:${l.at}-${n}`;
          const on = open === id;
          const look = LEVEL_ICON[l.level];
          const canUndo = live && l.actionId && Date.now() - l.at < UNDO_MS;
          const detail = l.reason || l.tool || l.approvedBy === "autonomy" || canUndo;
          return (
            <div key={id} className={`tcard${on ? " on" : ""}`}>
              <button type="button" className="tcard-head" aria-expanded={on} onClick={() => detail && toggle(id)}>
                <span className={`tdot ${look.tone}`}><Icon name={look.icon} size={14} /></span>
                <span className="tt">{l.text}</span>
                <span className="twhen">{ago(l.at)}</span>
              </button>
              {on && (
                <div className="tmore">
                  {l.reason && <p>{ACTIVITY.why(l.reason)}</p>}
                  {l.tool && <code>{l.tool}</code>}
                  {l.approvedBy === "autonomy" && <p>{ACTIVITY.onItsOwn}</p>}
                  {canUndo && (
                    <button type="button" className="btn ghost" onClick={() => send({ type: "undo", actionId: l.actionId! })}>
                      {ACTIVITY.undo}
                    </button>
                  )}
                </div>
              )}
            </div>
          );
        })}

        {stats && (
          <>
            <h3>{ACTIVITY.stats}</h3>
            {stats}
          </>
        )}
        <h3>{ACTIVITY.settings}</h3>
        <div className="tray-settings">{settings}</div>
      </aside>
    </>
  );
}
