// Black Iron look for the few pages the Worker renders itself (password gate, waitlist, runner pairing).
// Same tokens as web/src/iron.css (docs/art/IRON-STYLE.md); fonts and brand files are public past the gate.

export const IRON_FONTS = `@font-face{font-family:Rajdhani;font-weight:600;font-display:swap;src:url(/fonts/rajdhani-600.woff2) format("woff2")}@font-face{font-family:Teko;font-weight:300 700;font-display:swap;src:url(/fonts/teko.woff2) format("woff2")}@font-face{font-family:Silkscreen;font-weight:400;font-display:swap;src:url(/fonts/silkscreen-400.woff2) format("woff2")}@font-face{font-family:Silkscreen;font-weight:700;font-display:swap;src:url(/fonts/silkscreen-700.woff2) format("woff2")}@font-face{font-family:"JetBrains Mono";font-weight:400 700;font-display:swap;src:url(/fonts/jetbrains-mono.woff2) format("woff2")}`;

export const IRON_TOKENS = `:root{color-scheme:dark;--bg:#0b0806;--soot:#1e1814;--panel:#140e0a;--plate:#2a211b;--line:#5a4434;--line-hi:#8a6a4c;--ink:#f4ead8;--dim:#b8a48a;--amber:#ffb020;--amber-hi:#ffc24a;--on-amber:#140c02;--ok:#46e07a;--bad:#ff4a32;--focus:#6fb2ff;--brass:#d0a24e;--copper:#c06a3a;--aether:#7af0d8;--furnace:#ff7a2a;--pixel:Rajdhani,"Arial Narrow",sans-serif;--mono:"JetBrains Mono",ui-monospace,Menlo,monospace}`;

/** 4px brass rivets in the four corners of a positioned plate (the `.iron-rivets` helper, inlined). */
const RIVETS = `.rv::before{content:"";position:absolute;inset:6px;pointer-events:none;background:linear-gradient(var(--brass),var(--brass)) top left/4px 4px no-repeat,linear-gradient(var(--brass),var(--brass)) top right/4px 4px no-repeat,linear-gradient(var(--brass),var(--brass)) bottom left/4px 4px no-repeat,linear-gradient(var(--brass),var(--brass)) bottom right/4px 4px no-repeat;filter:drop-shadow(1px 1px 0 #3a2410)}`;

/** Base CSS for a flat Black Iron page: furnace sky, one riveted plate, pixel headings, amber buttons. */
export const IRON_SHELL_CSS = `${IRON_TOKENS}${RIVETS}
*{box-sizing:border-box}
html{background:var(--bg)}
body{margin:0;min-height:100vh;min-height:100dvh;color:var(--ink);font:400 15px/1.6 var(--mono);background:var(--bg) linear-gradient(180deg,#1c120c 0%,#3a1c0e 62%,#7a3a16 100%) fixed;display:grid;place-items:center;padding:24px 16px}
.plate{position:relative;width:100%;max-width:560px;background:var(--panel);border:2px solid var(--line);outline:2px solid #000;box-shadow:inset 0 2px 0 rgba(255,220,170,.06),inset 0 -3px 0 rgba(0,0,0,.35),0 0 0 6px rgba(0,0,0,.35);padding:28px 24px 24px}
.plate::after{content:"";position:absolute;left:0;right:0;bottom:0;height:4px;background:linear-gradient(90deg,transparent,var(--aether) 30%,var(--aether) 70%,transparent);opacity:.55}
.brand{display:inline-block;line-height:0}
.brand img{width:178px;height:auto;image-rendering:auto}
.eyebrow{font:400 10px/1.2 var(--pixel);letter-spacing:.14em;text-transform:uppercase;color:var(--dim);margin:14px 0 6px}
h1{font:600 30px/1.15 Teko,sans-serif;letter-spacing:.08em;text-transform:uppercase;margin:0 0 12px}
h2{font:600 25px/1.2 Teko,sans-serif;letter-spacing:.06em;margin:18px 0 8px}
p{margin:10px 0}
a{color:var(--aether);text-underline-offset:3px}
a:hover{color:#b2fff0}
label{display:block;margin:16px 0 0;font:400 11px/1.4 var(--pixel);letter-spacing:.1em;text-transform:uppercase;color:var(--dim)}
input,select{display:block;width:100%;margin-top:6px;font:400 16px/1.3 var(--mono);color:var(--ink);background:var(--soot);border:2px solid var(--line);border-radius:0;padding:11px 12px;caret-color:var(--amber);box-shadow:inset 0 2px 0 rgba(0,0,0,.5)}
input::placeholder{color:#8d7c66}
button{display:block;width:100%;min-height:48px;margin-top:14px;font:700 13px/1 var(--pixel);letter-spacing:.08em;text-transform:uppercase;color:var(--on-amber);background:var(--amber);border:2px solid #000;border-radius:0;cursor:pointer;box-shadow:inset 0 -3px 0 rgba(0,0,0,.3),inset 0 2px 0 rgba(255,255,255,.25)}
button:hover{background:var(--amber-hi)}
button:active{transform:translateY(1px);box-shadow:none}
button.alt{background:var(--plate);color:var(--ink);border-color:var(--line)}
button.alt:hover{border-color:var(--line-hi)}
:focus-visible{outline:3px solid var(--focus);outline-offset:2px}
hr{border:0;border-top:2px dotted var(--line);margin:22px 0}
code,pre{font-family:var(--mono);overflow-wrap:anywhere;white-space:pre-wrap;background:var(--soot);border:2px solid var(--line);padding:2px 6px}
h2 code{display:inline-block;font-size:22px;letter-spacing:.12em;color:var(--amber);padding:8px 14px}
.note{color:var(--dim);font-size:13px}
.cf-turnstile{margin-top:14px;min-height:65px}
.status:empty{display:none}
.status{border-left:4px solid var(--amber);background:var(--soot);padding:8px 12px}
@media (max-width:480px){.plate{padding:24px 16px 20px}}`;

/** A flat Black Iron page: the wordmark (linking home), then one riveted plate of content. */
export const ironShell = (title: string, body: string, head = "") =>
  `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="theme-color" content="#0b0806"><title>${title}</title><link rel="icon" href="/brand/favicon.svg?v=foundry-s3" type="image/svg+xml">${head}<style>${IRON_FONTS}${IRON_SHELL_CSS}</style></head><body><main class="plate rv"><a class="brand" href="/"><img src="/brand/wordmark.svg?v=foundry-s3" alt="Shiptorio" width="297" height="50"></a>${body}</main></body></html>`;
