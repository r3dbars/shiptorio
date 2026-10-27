// Black Iron shell for the Worker's utility pages (connect, settings, admin, sign-in errors, runner pairing).
// Shares fonts with iron-page.ts (the gate and waitlist plate); this one adds options for wide/doc/alarm
// plates and a font-free mode (docs/art/IRON-STYLE.md): one riveted iron plate on the furnace sky.
// Inline CSS only, so it works under `style-src 'unsafe-inline'`. Fonts come from the
// self-hosted /fonts/*.woff2 (public past the preview gate); pages whose own CSP forbids fonts pass
// `fonts: false` and fall back to a monospace stack with the same colors and plates.

import { IRON_FONTS } from "./iron-page";

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);



/** The shared Black Iron CSS for server pages. Same hex values as web/src/iron.css. */
export const IRON_CSS = `*{box-sizing:border-box}
html{background:#0b0806;color-scheme:dark}
body{margin:0;min-height:100vh;display:grid;grid-template-columns:minmax(0,1fr);place-items:center;padding:28px 16px;color:#f4ead8;font:400 15px/1.6 "JetBrains Mono",ui-monospace,Menlo,Consolas,monospace;
background:repeating-linear-gradient(0deg,rgba(0,0,0,.16) 0 2px,transparent 2px 4px),radial-gradient(120% 60% at 50% 100%,rgba(255,122,42,.28),transparent 70%),linear-gradient(180deg,#1c120c 0%,#4a2412 60%,#7a3a16 100%) fixed,#0b0806;background-attachment:fixed}
.iron{position:relative;min-width:0;width:min(540px,100%);background:#140e0a;border:2px solid #5a4434;outline:2px solid #000;box-shadow:inset 0 2px 0 rgba(255,220,170,.06),inset 0 -3px 0 rgba(0,0,0,.35),0 8px 0 rgba(0,0,0,.45)}
.iron.wide{width:min(1100px,100%)}
.iron::before{content:"";position:absolute;inset:5px;pointer-events:none;z-index:1;filter:drop-shadow(1px 1px 0 #3a2410);background:linear-gradient(#d0a24e,#d0a24e) top left/4px 4px no-repeat,linear-gradient(#d0a24e,#d0a24e) top right/4px 4px no-repeat,linear-gradient(#d0a24e,#d0a24e) bottom left/4px 4px no-repeat,linear-gradient(#d0a24e,#d0a24e) bottom right/4px 4px no-repeat}
.iron-head{display:flex;align-items:center;gap:10px;padding:12px 20px;background:#2a211b;border-bottom:2px solid #5a4434;box-shadow:inset 0 2px 0 rgba(255,220,170,.08)}
.iron-head.alarm{border-bottom:0;box-shadow:none}
.iron-stripe{height:8px;background:repeating-linear-gradient(-45deg,#ffb020 0 6px,#140c02 6px 12px);border-bottom:2px solid #000}
.iron-head svg{flex:none;width:20px;height:20px;shape-rendering:crispEdges}
.iron-head a,.iron-eyebrow{font:400 10px/1.2 Rajdhani,"Arial Narrow",sans-serif;letter-spacing:.14em;text-transform:uppercase;color:#b8a48a;text-decoration:none}
.iron-head a:hover{color:#f4ead8}
.iron-nav+.iron-eyebrow{margin-left:16px}
.iron-head .iron-eyebrow{margin-left:auto;text-align:right}
.iron-body{padding:22px 22px 24px}
h1{margin:0 0 14px;font:600 32px/1.15 Teko,"Arial Narrow",sans-serif;letter-spacing:.08em;text-transform:uppercase;color:#f4ead8;overflow-wrap:anywhere}
h2{margin:26px 0 8px;font:700 13px/1.3 Rajdhani,"Arial Narrow",sans-serif;letter-spacing:.1em;text-transform:uppercase;color:#d0a24e}
h3{margin:22px 0 6px;font:400 11px/1.4 Rajdhani,"Arial Narrow",sans-serif;letter-spacing:.08em;color:#d0a24e;overflow-wrap:anywhere}
h1+h2{margin-top:8px}
p{margin:0 0 12px}
a{color:#7af0d8;text-underline-offset:3px;text-decoration-thickness:2px}
a:hover{color:#f4ead8}
b,strong{color:#f4ead8;font-weight:700}
small{font-size:12px;color:#b8a48a;font-weight:400;text-transform:none;letter-spacing:0}
ol{list-style:none;counter-reset:step;margin:14px 0;padding:0;color:#b8a48a}
ol>li{counter-increment:step;position:relative;padding:0 0 0 38px;margin:0 0 12px;min-height:24px}
ol>li::before{content:counter(step);position:absolute;left:0;top:1px;width:24px;height:24px;display:grid;place-items:center;font:700 11px/1 Rajdhani,"Arial Narrow",sans-serif;color:#140c02;background:#d0a24e;border:2px solid #000;box-shadow:inset 0 -2px 0 rgba(0,0,0,.3)}
code{font:400 13px/1.5 "JetBrains Mono",ui-monospace,Menlo,monospace;background:#1e1814;border:2px solid #3a2c22;padding:1px 6px;color:#ffd9a0;overflow-wrap:anywhere;word-break:break-all}
h2 code{font:700 22px/1.3 "JetBrains Mono",ui-monospace,Menlo,monospace;display:inline-block;padding:8px 14px;letter-spacing:.08em;color:#ffb020;border-color:#5a4434;word-break:normal}
pre{margin:0 0 12px;padding:12px 14px;font:400 13px/1.5 "JetBrains Mono",ui-monospace,Menlo,monospace;color:#f4ead8;background:#1e1814;border:2px solid #5a4434;box-shadow:inset 0 2px 0 rgba(0,0,0,.5);white-space:pre-wrap;overflow-wrap:anywhere;max-height:60vh;overflow:auto}
label{display:block;margin-top:16px;font:400 10px/1.4 Rajdhani,"Arial Narrow",sans-serif;letter-spacing:.12em;text-transform:uppercase;color:#b8a48a}
input,select{display:block;width:100%;min-height:48px;margin-top:6px;padding:0 12px;font:400 16px/1.3 "JetBrains Mono",ui-monospace,Menlo,monospace;color:#f4ead8;background:#1e1814;border:2px solid #5a4434;border-radius:0;box-shadow:inset 0 2px 0 rgba(0,0,0,.5);caret-color:#ffb020;letter-spacing:0;text-transform:none}
label code,label small{text-transform:none;letter-spacing:0}
input[type=checkbox]{display:inline-block;width:20px!important;height:20px;min-height:0!important;margin:0 10px 0 0;padding:0;vertical-align:-4px;accent-color:#ffb020;box-shadow:none}
label:has(input[type=checkbox]){font:400 14px/1.5 "JetBrains Mono",ui-monospace,Menlo,monospace;letter-spacing:0;text-transform:none;color:#f4ead8}
input::placeholder{color:#8a7a66}
input:hover,select:hover{border-color:#8a6a4c}
button,.btn{display:block;width:100%;min-height:48px;margin-top:20px;padding:12px 14px;font:400 12px/1.2 Rajdhani,"Arial Narrow",sans-serif;letter-spacing:.08em;text-transform:uppercase;text-align:center;text-decoration:none;color:#140c02;background:#ffb020;border:2px solid #000;border-radius:0;box-shadow:inset 0 -3px 0 rgba(0,0,0,.3),inset 0 2px 0 rgba(255,255,255,.25);cursor:pointer}
button:hover,.btn:hover{background:#ffc24a;color:#140c02}
button:active,.btn:active{transform:translateY(1px);box-shadow:none}
button.ghost,.btn.ghost{color:#f4ead8;background:#2a211b;border-color:#5a4434;box-shadow:inset 0 -2px 0 rgba(0,0,0,.4)}
button.ghost:hover,.btn.ghost:hover{border-color:#8a6a4c;background:#2a211b;color:#f4ead8}
button.danger{color:#ff4a32;background:#2a211b;border-color:#ff4a32;box-shadow:inset 0 -2px 0 rgba(0,0,0,.4)}
button.danger:hover{background:#3a1a12;color:#ff7a66}
:focus-visible{outline:3px solid #6fb2ff;outline-offset:2px}
.ok{color:#46e07a}
.ok-lamp{display:flex;align-items:center;gap:8px;font:700 12px/1.3 Rajdhani,"Arial Narrow",sans-serif;letter-spacing:.06em;text-transform:uppercase;color:#46e07a}
.ok-lamp::before{content:"";flex:none;width:10px;height:10px;background:#46e07a;border:2px solid #000}
.ok-lamp.idle{color:#8fa2c8}.ok-lamp.idle::before{background:#8fa2c8}
.err{margin:16px 0 0;padding:10px 12px 10px 14px;color:#f4ead8;background:#2a120c;border:2px solid #ff4a32;box-shadow:inset 4px 0 0 #ff4a32}
.err::before{content:"FAULT";display:block;margin-bottom:2px;font:700 10px/1.2 Rajdhani,"Arial Narrow",sans-serif;letter-spacing:.14em;color:#ff4a32}
.note{margin-top:20px;padding-top:14px;border-top:2px dotted #5a4434}
.row{display:flex;flex-wrap:wrap;gap:10px;align-items:end}
.row>*{margin-top:0}
.row button,.row .btn{width:auto}
table{width:100%;border-collapse:collapse;margin:12px 0}
th{padding:8px 10px;text-align:left;font:400 10px/1.3 Rajdhani,"Arial Narrow",sans-serif;letter-spacing:.12em;text-transform:uppercase;color:#b8a48a;background:#2a211b;border-bottom:2px solid #5a4434}
td{padding:10px;border-bottom:2px solid #2a211b;vertical-align:middle}
td form{display:flex;flex-wrap:wrap;gap:8px;align-items:center}
td form>*{margin:0;width:auto;min-width:0;flex:1 1 120px}
td form button{flex:0 0 auto;min-width:96px}
.scroll{overflow-x:auto}
section{margin:22px 0}
.iron.doc{width:min(800px,100%)}
.doc .iron-body>section{margin:18px 0;padding:16px 18px 18px;background:#1a130f;border:2px solid #3a2c22;box-shadow:inset 0 2px 0 rgba(255,220,170,.04)}
.doc .iron-body>section>h2:first-child{margin-top:0}
.doc button,.doc .btn{display:inline-block;width:auto;margin:10px 10px 0 0}
.muted{color:#b8a48a}
h2.danger{color:#ff4a32}
.draft{padding:10px 12px;color:#f4ead8;background:#2a1f0a;border:2px solid #ffb020;box-shadow:inset 4px 0 0 #ffb020}
.item{padding:12px 0;border-top:2px solid #2a211b;overflow-wrap:anywhere}
.item p{margin:4px 0 0}
.iron-nav{margin-left:auto;display:flex;gap:16px}
.iron-foot{display:flex;flex-wrap:wrap;gap:12px 24px;margin-top:24px;padding-top:14px;border-top:2px dotted #5a4434;font-size:13px}
@media (max-width:520px){body{padding:16px 12px;place-items:start center}.iron-body{padding:18px 16px 20px}h1{font-size:17px}.iron-head .iron-eyebrow{display:none}}
@media (prefers-reduced-motion:reduce){*{transition:none!important;animation:none!important}}`;

// A pixel cog in brass on an integer grid, inline so it renders under `img-src 'none'` too.
const COG = `<svg viewBox="0 0 13 13" aria-hidden="true" focusable="false"><path fill="#3a2410" fill-rule="evenodd" transform="translate(1 1)" d="M5 0h2v2h3v3h2v2h-2v3H7v2H5v-2H2V7H0V5h2V2h3zM5 5v2h2V5z"/><path fill="#d0a24e" fill-rule="evenodd" d="M5 0h2v2h3v3h2v2h-2v3H7v2H5v-2H2V7H0V5h2V2h3zM5 5v2h2V5z"/><path fill="#ffd9a0" d="M5 0h2v1H5zM2 2h3v1H2z"/></svg>`;

export interface IronPageOptions {
  /** <title> text, before " · Shiptorio". Escaped here. */
  title: string;
  /** Trusted HTML for the plate body. Callers escape their own values. */
  body: string;
  /** Small stamp at the right of the plate header, e.g. "Runner · pairing". Escaped here. */
  eyebrow?: string;
  /** Load the self-hosted pixel fonts. Pass false where the page's CSP forbids fonts. */
  fonts?: boolean;
  /** A wide plate for internal tables and logs. */
  wide?: boolean;
  /** A reading-width plate for long documents; top-level <section>s become inset sub-plates. */
  doc?: boolean;
  /** Trusted header links shown at the right of the plate header. */
  nav?: string;
  /** Caution stripe on top: something failed or needs the player. */
  alarm?: boolean;
  /** Where the SHIPTORIO stamp in the header links. */
  home?: string;
  /** Extra trusted markup for <head> (e.g. a same-origin module script). */
  head?: string;
}

/** A full Black Iron HTML page: one riveted iron plate on the furnace sky. */
export function ironPage(o: IronPageOptions): string {
  const head = `<header class="iron-head${o.alarm ? " alarm" : ""}">${COG}<a href="${esc(o.home ?? "/")}">Shiptorio</a>${o.nav ? `<nav class="iron-nav">${o.nav}</nav>` : ""}${o.eyebrow ? `<span class="iron-eyebrow">${esc(o.eyebrow)}</span>` : ""}</header>`;
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="theme-color" content="#1c120c"><link rel="icon" href="/brand/favicon.svg" type="image/svg+xml"><title>${esc(o.title)} · Shiptorio</title>
<style>${o.fonts === false ? "" : IRON_FONTS}
${IRON_CSS}</style>${o.head ?? ""}</head>
<body><main class="iron${o.wide ? " wide" : ""}${o.doc ? " doc" : ""}">${o.alarm ? `<div class="iron-stripe" aria-hidden="true"></div>` : ""}${head}<div class="iron-body">${o.body}</div></main></body></html>`;
}
