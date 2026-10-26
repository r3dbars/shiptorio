// The private-preview password gate (/access), Black Iron style: the factory's riveted blast door at night,
// with the real Black Iron line running behind it. The form is a plain POST and works with JS off; the tiny
// nonce'd script only adds the unlock (bolts retract, door splits, furnace light) and the in-place alarm.
import { IRON_FONTS, IRON_TOKENS } from "./iron-page";

const svg = (body: string) => `url("data:image/svg+xml,${encodeURIComponent(body)}")`;
// A row of 4px brass rivets (with a 1px dark shadow), tiled along the door leaves.
const RIVET_ROW = svg(`<svg xmlns="http://www.w3.org/2000/svg" width="22" height="6" shape-rendering="crispEdges"><rect x="9" y="2" width="4" height="4" fill="#5a3a14"/><rect x="8" y="1" width="4" height="4" fill="#d0a24e"/><rect x="8" y="1" width="2" height="1" fill="#f4d48a"/></svg>`);
const RIVET_COL = svg(`<svg xmlns="http://www.w3.org/2000/svg" width="6" height="26" shape-rendering="crispEdges"><rect x="2" y="12" width="4" height="4" fill="#5a3a14"/><rect x="1" y="11" width="4" height="4" fill="#d0a24e"/><rect x="1" y="11" width="2" height="1" fill="#f4d48a"/></svg>`);
// Riveted iron with a few rust streaks (decor only).
const GRIME = svg(`<svg xmlns="http://www.w3.org/2000/svg" width="96" height="120" shape-rendering="crispEdges"><g fill="#8a3a20" opacity=".22"><rect x="14" y="8" width="2" height="34"/><rect x="16" y="20" width="2" height="12"/><rect x="62" y="56" width="2" height="40"/><rect x="60" y="70" width="2" height="16"/><rect x="80" y="10" width="2" height="18"/></g><g fill="#000" opacity=".18"><rect x="30" y="90" width="20" height="2"/><rect x="40" y="30" width="8" height="2"/><rect x="4" y="66" width="12" height="2"/></g><g fill="#ffdcaa" opacity=".05"><rect x="44" y="12" width="14" height="2"/><rect x="20" y="104" width="10" height="2"/></g></svg>`);

// 16x16 pixel gear for the lock dial.
const GEAR = `<svg class="gear" viewBox="0 0 16 16" width="72" height="72" shape-rendering="crispEdges" aria-hidden="true"><g fill="#000"><rect x="5" y="-1" width="6" height="18"/><rect x="-1" y="5" width="18" height="6"/><rect x="1" y="1" width="4" height="4"/><rect x="11" y="1" width="4" height="4"/><rect x="1" y="11" width="4" height="4"/><rect x="11" y="11" width="4" height="4"/><rect x="3" y="2" width="10" height="12"/><rect x="2" y="3" width="12" height="10"/></g><g fill="#a07a34"><rect x="6" y="0" width="4" height="16"/><rect x="0" y="6" width="16" height="4"/><rect x="2" y="2" width="2" height="2"/><rect x="12" y="2" width="2" height="2"/><rect x="2" y="12" width="2" height="2"/><rect x="12" y="12" width="2" height="2"/><rect x="4" y="3" width="8" height="10"/><rect x="3" y="4" width="10" height="8"/></g><g fill="#d0a24e"><rect x="6" y="0" width="4" height="2"/><rect x="0" y="6" width="2" height="3"/><rect x="2" y="2" width="2" height="1"/><rect x="4" y="3" width="7" height="2"/><rect x="3" y="4" width="2" height="6"/></g><g fill="#f4d48a"><rect x="6" y="0" width="2" height="1"/><rect x="4" y="3" width="3" height="1"/></g><rect x="5" y="5" width="6" height="6" fill="#1a110b"/><rect x="5" y="5" width="6" height="1" fill="#000"/></svg>`;
// Brass keyhole escutcheon beside the password slot.
const KEYHOLE = `<svg viewBox="0 0 10 14" width="30" height="42" shape-rendering="crispEdges" aria-hidden="true"><rect x="0" y="0" width="10" height="14" fill="#000"/><rect x="1" y="1" width="8" height="12" fill="#b08638"/><rect x="1" y="1" width="8" height="1" fill="#f4d48a"/><rect x="1" y="12" width="8" height="1" fill="#6a4a1c"/><rect x="3" y="3" width="4" height="4" fill="#0b0806"/><rect x="4" y="7" width="2" height="4" fill="#0b0806"/><rect x="3" y="9" width="4" height="2" fill="#0b0806"/></svg>`;
// Pixel lever on the button: pivots when you pull it.
const LEVER = `<svg class="lever" viewBox="0 0 12 12" width="24" height="24" shape-rendering="crispEdges" aria-hidden="true"><rect x="5" y="1" width="2" height="8" fill="#140c02"/><rect x="4" y="0" width="4" height="3" fill="#140c02"/><rect x="5" y="1" width="2" height="1" fill="#ff4a32"/><rect x="2" y="9" width="8" height="3" fill="#140c02"/></svg>`;

const EMBERS = [
  [6, 7.5, 0, 14, "f"], [14, 9, 2.4, -10, "a"], [23, 8, 5.1, 18, "f"], [31, 10.5, 1.2, -6, "f"], [42, 8.5, 3.8, 12, "t"],
  [51, 11, 0.6, -14, "f"], [60, 9.5, 4.4, 8, "a"], [68, 8, 2, -18, "f"], [77, 10, 6, 10, "f"], [85, 9, 1.6, -8, "a"],
  [93, 11.5, 3, 16, "f"], [36, 12, 7, 6, "f"], [72, 12.5, 8.2, -12, "t"], [18, 13, 9, 4, "a"],
].map(([x, d, w, dx, c]) => `<i class="${c}" style="--x:${x}%;--d:${d}s;--w:-${w}s;--dx:${dx}px"></i>`).join("");
const STEAM = [[-6, 18, 0, -26], [4, 34, 0.08, 24], [-2, 52, 0.16, -30], [2, 70, 0.04, 28], [-4, 86, 0.12, -22]]
  .map(([x, y, w, dx]) => `<i style="--sx:${x}px;--y:${y}%;--w:${w}s;--dx:${dx}px"></i>`).join("");

const CSS = `${IRON_FONTS}${IRON_TOKENS}
*{box-sizing:border-box}
html{background:var(--bg)}
body{margin:0;min-height:100vh;min-height:100dvh;color:var(--ink);font:400 15px/1.55 var(--mono);background:var(--bg);display:grid;place-items:center;padding:40px 16px;overflow-x:hidden}
.world{position:fixed;inset:0;z-index:0;background:#1c120c url(/brand/gate-poster.webp) center/cover no-repeat;image-rendering:pixelated}
.world video{display:block;width:100%;height:100%;object-fit:cover;image-rendering:pixelated;pointer-events:none}.world video::-webkit-media-controls{display:none!important}
.shade{position:fixed;inset:0;z-index:1;background:radial-gradient(ellipse 46% 62% at 50% 50%,rgba(11,8,6,.62),rgba(11,8,6,.42) 70%,rgba(11,8,6,.72)),linear-gradient(180deg,rgba(11,8,6,.5),rgba(11,8,6,0) 35%,rgba(122,58,22,.22))}
.shade::after{content:"";position:absolute;inset:0;opacity:0;background:radial-gradient(ellipse at 50% 50%,rgba(255,40,16,.42),rgba(255,40,16,.12) 60%,transparent)}
.bad .shade::after{animation:alarm .5s steps(1) 3}
.embers{position:fixed;inset:0;z-index:2;pointer-events:none;overflow:hidden}.embers i{position:absolute;bottom:-8px;left:var(--x);width:3px;height:3px;background:var(--furnace);opacity:0;animation:rise var(--d) linear var(--w) infinite;pointer-events:none}
.embers i.a{background:var(--amber);width:2px;height:2px}.embers i.t{background:var(--aether);width:2px;height:2px}
.flood{position:fixed;inset:-25%;z-index:2;pointer-events:none;opacity:0;background:radial-gradient(closest-side,#fff6d2 0,#ffd27a 14%,#ffb020 30%,#ff7a2a 52%,rgba(160,64,20,.8) 74%,rgba(28,18,12,0) 100%)}
.door{position:relative;z-index:3;width:min(440px,calc(100vw - 64px));padding:34px 30px 38px;isolation:isolate}
.door::before{content:"";position:absolute;inset:-14px;z-index:-3;border:12px solid #17100b;outline:2px solid #000;box-shadow:inset 0 0 0 2px #000,inset 0 0 0 4px var(--line),0 0 0 2px var(--line),0 24px 60px rgba(0,0,0,.7);background:${RIVET_ROW} 0 -1px repeat-x,${RIVET_ROW} 0 calc(100% + 1px) repeat-x}
.door::after{content:"";position:absolute;left:-16px;right:-16px;bottom:-30px;height:12px;z-index:-3;background:repeating-linear-gradient(-45deg,var(--amber) 0 7px,var(--on-amber) 7px 14px);border:2px solid #000}
.leaf{position:absolute;top:0;bottom:0;width:50%;z-index:-1;border:2px solid var(--line);outline:2px solid #000;background:${RIVET_ROW} 0 6px repeat-x,${RIVET_ROW} 0 calc(100% - 6px) repeat-x,${GRIME},linear-gradient(180deg,#30261f 0,#211913 10%,#18110d 88%,#0e0906 100%);box-shadow:inset 0 2px 0 rgba(255,220,170,.08),inset 0 -4px 0 rgba(0,0,0,.45);transition:transform .7s cubic-bezier(.6,0,.3,1) .28s}
.leaf.l{left:0;border-right:2px solid #000;background-position:0 6px,0 calc(100% - 6px),0 0,0 0}
.leaf.r{right:0;border-left:2px solid #3a2c22;background-position:-11px 6px,-11px calc(100% - 6px),-40px -30px,0 0}
.leaf.l::before{content:"";position:absolute;top:18px;bottom:18px;left:6px;width:6px;background:${RIVET_COL} 0 0 repeat-y}
.leaf.r::before{content:"";position:absolute;top:18px;bottom:18px;right:6px;width:6px;background:${RIVET_COL} 0 0 repeat-y}
.bar{position:absolute;right:-46px;width:92px;height:12px;z-index:2;background:linear-gradient(180deg,#f4d48a 0 2px,#d0a24e 2px 7px,#8a6a2c 7px);border:2px solid #000;transition:transform .26s steps(4)}
.bar::after{content:"";position:absolute;right:6px;top:2px;width:4px;height:4px;background:#5a3a14}
.bar.t{top:22px}.bar.b{bottom:22px}
.steam i{position:absolute;left:calc(50% - 7px + var(--sx));top:var(--y);width:14px;height:14px;z-index:4;background:#e9e1d4;opacity:0;pointer-events:none;box-shadow:6px -6px 0 -2px #cfc6b8,-7px 4px 0 -3px #fff}
.face{position:relative;z-index:3;text-align:center;transition:opacity .22s steps(3)}
.eyebrow{display:inline-flex;align-items:center;gap:8px;margin:0;font:400 10px/1 var(--pixel);letter-spacing:.16em;text-transform:uppercase;color:var(--dim)}
.eyebrow b{width:8px;height:8px;background:var(--amber);box-shadow:0 0 0 2px #000,0 0 10px rgba(255,176,32,.7)}
h1{margin:16px auto 6px;line-height:0;max-width:330px}
h1 img{width:100%;height:auto;image-rendering:pixelated}
h1 .alt{line-height:1}
.tag{margin:0 0 14px;font-size:15px;color:var(--ink)}
.dial{position:relative;width:72px;height:72px;margin:0 auto 16px;filter:drop-shadow(0 3px 0 rgba(0,0,0,.6))}
.gear{display:block}
.lamp{position:absolute;left:27px;top:27px;width:18px;height:18px;background:var(--amber);border:2px solid #000;box-shadow:0 0 14px 2px rgba(255,176,32,.55),inset 0 3px 0 rgba(255,255,255,.35)}
form{margin:0;text-align:left}
label{display:block;font:400 11px/1.3 var(--pixel);letter-spacing:.12em;text-transform:uppercase;color:var(--dim)}
.slot{display:flex;gap:10px;align-items:stretch;margin-top:8px}
.slot svg{flex:none;align-self:center}
input{flex:1;min-width:0;height:50px;padding:0 14px;font:500 16px/1 var(--mono);letter-spacing:.12em;color:var(--ink);background:#0d0907;border:2px solid var(--line);border-radius:0;caret-color:var(--amber);box-shadow:inset 0 3px 0 rgba(0,0,0,.65),inset 0 -2px 0 rgba(255,220,170,.05),0 0 0 2px #000}
input:hover{border-color:var(--line-hi)}
input:focus-visible{outline:3px solid var(--focus);outline-offset:2px;border-color:var(--brass)}
.bad input{border-color:var(--bad)}
button{display:flex;align-items:center;justify-content:center;gap:12px;width:100%;min-height:56px;margin-top:16px;padding:0 16px;font:700 15px/1 var(--pixel);letter-spacing:.1em;text-transform:uppercase;color:var(--on-amber);background:var(--amber);border:2px solid #000;border-radius:0;cursor:pointer;box-shadow:inset 0 2px 0 rgba(255,255,255,.35),inset 0 -4px 0 rgba(0,0,0,.28),0 0 0 2px #000,0 6px 0 #3a1c0e,0 0 26px rgba(255,140,32,.35)}
button:hover{background:var(--amber-hi)}
button:active{transform:translateY(3px);box-shadow:inset 0 2px 0 rgba(0,0,0,.2),0 0 0 2px #000,0 3px 0 #3a1c0e}
button:focus-visible{outline:3px solid var(--focus);outline-offset:4px}
.lever{transform-origin:50% 90%;transform:rotate(-28deg);transition:transform .18s steps(3)}
button:active .lever,.busy .lever,.open .lever{transform:rotate(28deg)}
.err{margin:12px 0 0;min-height:0;font-size:14px;line-height:1.45;color:#ff6a52;text-align:left}
.err:not(:empty){padding:8px 10px 8px 12px;background:#1e0a06;border-left:4px solid var(--bad)}
.foot{margin:18px 0 0;font-size:13px;color:var(--dim)}
.foot a{color:var(--aether);text-underline-offset:3px}
.foot a:hover{color:#b2fff0}
.foot a:focus-visible{outline:3px solid var(--focus);outline-offset:2px}
.pipe{position:absolute;top:-14px;bottom:-14px;width:6px;z-index:-4;background:#0e2a26;border:2px solid #000;overflow:hidden}
.pipe.l{left:-30px}.pipe.r{right:-30px}
.pipe::after{content:"";position:absolute;left:0;right:0;height:28px;background:linear-gradient(180deg,transparent,var(--aether),transparent);animation:pulse 2.4s steps(24) infinite}
.pipe.r::after{animation-delay:-1.2s}
.sr{position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0);white-space:nowrap}
/* states */
.busy .gear{animation:spin 1.2s steps(8) infinite}
.busy .lamp{animation:blink .4s steps(1) infinite}
.bad .lamp{background:var(--bad);box-shadow:0 0 18px 4px rgba(255,74,50,.7),inset 0 3px 0 rgba(255,255,255,.35);animation:blink .4s steps(1) 5}
.bad .eyebrow b{background:var(--bad)}
.bad .door{animation:shake .48s steps(8) 1}
.open .lamp{background:var(--ok);box-shadow:0 0 22px 6px rgba(70,224,122,.7),inset 0 3px 0 rgba(255,255,255,.35)}
.open .gear{animation:spin .5s steps(8) 2}
.open .bar{transform:translateX(-58px)}
.open .face{opacity:0;transition-delay:.18s}
.open .leaf.l{transform:translateX(-60vw)}
.open .leaf.r{transform:translateX(60vw)}
.open .steam i{animation:puff .9s ease-out calc(.3s + var(--w)) both}
.open .flood{opacity:1;transform:scale(2.6);animation:flood 1.1s cubic-bezier(.5,0,.6,1) .3s both}
.open .door::after,.open .pipe{opacity:.6}
@keyframes rise{0%{transform:translate(0,0);opacity:0}8%{opacity:1}80%{opacity:.9}100%{transform:translate(var(--dx),-105vh);opacity:0}}
@keyframes alarm{0%{opacity:1}50%{opacity:0}}
@keyframes blink{50%{opacity:.25}}
@keyframes spin{to{transform:rotate(360deg)}}
@keyframes shake{0%,100%{transform:translateX(0)}15%{transform:translateX(-10px)}30%{transform:translateX(9px)}45%{transform:translateX(-7px)}60%{transform:translateX(5px)}75%{transform:translateX(-3px)}}
@keyframes pulse{from{top:-28px}to{top:100%}}
@keyframes puff{0%{opacity:0;transform:scale(.3)}20%{opacity:.9}100%{opacity:0;transform:translate(var(--dx),-36px) scale(2.4)}}
@keyframes flood{0%{opacity:0;transform:scale(.2)}30%{opacity:.95}100%{opacity:1;transform:scale(2.6)}}
@media (max-width:520px){body{padding:36px 16px 44px}.door{width:calc(100vw - 60px);padding:30px 18px 34px}.pipe{display:none}h1{margin-top:14px}.dial{transform:scale(.85);margin:-4px auto 10px}button{font-size:14px;gap:10px}}
@media (max-height:700px) and (min-width:521px){.dial{display:none}}
@media (prefers-reduced-motion:reduce){*,*::before,*::after{animation:none!important;transition:none!important}.embers,.world video{display:none}.open .leaf,.open .bar{opacity:0}.bad .shade::after{opacity:.5}}`;

// Progressive: intercepts submit, posts with fetch, and either opens the door (then follows the normal
// cookie check at /access?check=1) or sounds the alarm in place. Anything unexpected falls back to the
// native form POST, so the page behaves exactly as without JS.
const SCRIPT = `(()=>{const b=document.body,f=document.getElementById("gate"),e=document.getElementById("err"),s=document.getElementById("say");if(!f||!window.fetch||!window.DOMParser)return;const still=matchMedia("(prefers-reduced-motion: reduce)").matches,native=()=>HTMLFormElement.prototype.submit.call(f);f.addEventListener("submit",async(v)=>{v.preventDefault();if(b.classList.contains("busy")||b.classList.contains("open"))return;b.classList.remove("bad");b.classList.add("busy");e.textContent="";f.setAttribute("aria-busy","true");let r;try{r=await fetch(f.action,{method:"POST",body:new URLSearchParams(new FormData(f)),redirect:"manual",credentials:"same-origin"})}catch(x){return native()}if(r.type==="opaqueredirect"){b.classList.replace("busy","open");s.textContent="Password accepted. The gate is opening.";setTimeout(()=>location.assign("/access?check=1&next="+encodeURIComponent(f.elements.next.value)),still?250:1350);return}if(r.status!==401&&r.status!==403)return native();const d=new DOMParser().parseFromString(await r.text(),"text/html"),m=d.querySelector("[role=alert]"),c=d.querySelector("input[name=csrf]");if(c)f.elements.csrf.value=c.value;b.classList.remove("busy");f.removeAttribute("aria-busy");void b.offsetWidth;b.classList.add("bad");e.textContent=(m&&m.textContent)||"That password didn\\u2019t work.";f.elements.password.select()})})();`;

/** `error` is trusted server text (fixed messages), `next`/`csrf` are escaped by the caller. */
export const gatePage = (error: string, next: string, csrf: string, nonce: string) => `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="theme-color" content="#0b0806"><meta name="robots" content="noindex"><title>Shiptorio · Private preview</title><link rel="icon" href="/brand/favicon.svg" type="image/svg+xml"><link rel="preload" href="/fonts/silkscreen-700.woff2" as="font" type="font/woff2" crossorigin><style>${CSS}</style></head><body${error ? ' class="bad"' : ""}>
<div class="world" aria-hidden="true"><video autoplay muted loop playsinline disablepictureinpicture preload="auto" poster="/brand/gate-poster.webp" tabindex="-1"><source src="/brand/gate-loop.webm" type="video/webm"><source src="/brand/gate-loop.mp4" type="video/mp4"></video></div>
<div class="shade" aria-hidden="true"></div><div class="embers" aria-hidden="true">${EMBERS}</div><div class="flood" aria-hidden="true"></div>
<main class="door">
<div class="pipe l" aria-hidden="true"></div><div class="pipe r" aria-hidden="true"></div>
<div class="leaf l" aria-hidden="true"><div class="bar t"></div><div class="bar b"></div></div><div class="leaf r" aria-hidden="true"></div>
<div class="steam" aria-hidden="true">${STEAM}</div>
<div class="face">
<p class="eyebrow"><b aria-hidden="true"></b>Private preview</p>
<h1><img src="/brand/wordmark.svg" alt="Shiptorio" width="297" height="50"></h1>
<p class="tag">The factory must grow.</p>
<div class="dial" aria-hidden="true">${GEAR}<span class="lamp"></span></div>
<form id="gate" method="post" action="/access"><input type="hidden" name="csrf" value="${csrf}"><input type="hidden" name="next" value="${next}">
<label for="password">Password</label>
<div class="slot">${KEYHOLE}<input id="password" name="password" type="password" autocomplete="current-password" autocapitalize="none" spellcheck="false" required autofocus></div>
<button type="submit">${LEVER}Enter the factory</button>
<p id="err" class="err" role="alert">${error}</p>
</form>
<p class="foot">No password yet? <a href="/">Join the waitlist</a></p>
</div>
</main>
<p id="say" class="sr" aria-live="polite"></p>
<script nonce="${nonce}">${SCRIPT}</script>
</body></html>`;
