// Foundry title screen: polished brass wordmark on a quiet petrol background.
// Authentication, CSRF and native form fallback stay in access.ts.
import { IRON_FONTS, IRON_TOKENS } from "./iron-page";

const CSS = `${IRON_FONTS}${IRON_TOKENS}
*{box-sizing:border-box}html{background:#090e10}body{margin:0;min-height:100vh;min-height:100dvh;color:#f2e4cc;font:400 14px/1.5 var(--mono);overflow-x:hidden;background:#090e10}
.world{position:fixed;inset:0;background:#081414}
.shade{position:fixed;inset:0;background:linear-gradient(180deg,rgba(5,10,12,.94),rgba(5,10,12,.15) 38%,rgba(5,10,12,.08) 62%,rgba(5,10,12,.95))}
.door{position:relative;z-index:2;min-height:100vh;min-height:100dvh;max-width:1200px;margin:auto;padding:clamp(32px,5vh,64px) 24px 30px;display:flex;flex-direction:column;align-items:center;justify-content:space-between;gap:clamp(120px,25vh,300px)}
.brand{text-align:center;width:min(940px,100%)}h1{margin:0;line-height:0}h1 img{display:block;width:100%;height:auto;filter:drop-shadow(0 5px 12px #000)}
.tag{margin:10px 0 0;font:400 clamp(20px,2.4vw,30px)/1.4 Georgia,serif;letter-spacing:.045em;color:#f5dfb5;text-wrap:balance;text-shadow:0 2px 12px #000}
.face{width:min(460px,100%);padding:23px 24px 20px;position:relative;background:rgba(9,16,18,.96);border:1px solid #967342;border-radius:6px;box-shadow:inset 0 1px 0 #f5dba533,0 12px 40px #0008;transition:opacity .25s}
.face::before,.face::after{content:'';position:absolute;left:14px;right:14px;height:9px;background:url(/brand/pipe-rail.svg) center/100% 9px no-repeat;pointer-events:none}.face::before{top:-5px}.face::after{bottom:-5px}
label{display:block;font:600 13px/1.4 Rajdhani,sans-serif;letter-spacing:.16em;text-transform:uppercase;color:#c7b795}
.slot{margin-top:8px}input{width:100%;height:54px;min-width:0;padding:0 14px;font:400 18px/1 var(--mono);letter-spacing:.12em;color:#f5dfb5;background:#080e10;border:1px solid #8e6d3e;border-radius:3px;caret-color:#e9bb70;box-shadow:inset 0 3px 8px #0008}
input:hover{border-color:#d7b57b}input:focus-visible,button:focus-visible,a:focus-visible{outline:3px solid #7af0d8;outline-offset:4px}
button{width:100%;min-height:56px;display:flex;align-items:center;justify-content:center;gap:16px;margin-top:16px;padding:12px 16px;border:1px solid #e5c18a;border-radius:3px;color:#21180d;background:linear-gradient(175deg,#f7dfae,#d4a35d 58%,#ad793c);font:600 17px/1.2 Rajdhani,sans-serif;letter-spacing:.13em;text-transform:uppercase;box-shadow:inset 0 1px 0 #fff8,inset 0 -3px 0 #67431d,0 4px 14px #0008;cursor:pointer}
button::after{content:'→';font-size:24px;line-height:1}button:hover{background:#f3d49d}button:active{transform:translateY(1px)}.busy button{opacity:.65;cursor:progress}
.err{margin:12px 0 0;color:#ff9c86;font-size:14px}.err:empty{display:none}.bad input{border-color:#ff806b}.foot{margin:17px 0 0;font-size:12px;text-align:center;color:#baa98f}.foot a{color:#82d0c2;text-underline-offset:4px}
.sr{position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0);white-space:nowrap}.open .face{opacity:0}.open .shade{background:rgba(229,176,95,.35);transition:background .8s}
@media(max-width:600px){.door{padding:52px 18px 26px;gap:clamp(160px,30vh,300px)}.face{padding:21px 18px 19px}.tag{margin-top:15px;font-size:20px}.foot{font-size:11px}}
@media(max-height:560px){.door{padding-top:18px;gap:45px}.brand{max-width:600px}}
@media(prefers-reduced-motion:reduce){*,*::before,*::after{transition:none!important}}
`;

const SCRIPT = `(()=>{const b=document.body,f=document.getElementById("gate"),e=document.getElementById("err"),s=document.getElementById("say");if(!f||!window.fetch||!window.DOMParser)return;const still=matchMedia("(prefers-reduced-motion: reduce)").matches,native=()=>HTMLFormElement.prototype.submit.call(f);f.addEventListener("submit",async(v)=>{v.preventDefault();if(b.classList.contains("busy")||b.classList.contains("open"))return;b.classList.remove("bad");b.classList.add("busy");e.textContent="";f.setAttribute("aria-busy","true");let r;try{r=await fetch(f.action,{method:"POST",body:new URLSearchParams(new FormData(f)),redirect:"manual",credentials:"same-origin"})}catch(x){return native()}if(r.type==="opaqueredirect"){b.classList.replace("busy","open");s.textContent="Password accepted. The gate is opening.";setTimeout(()=>location.assign("/access?check=1&next="+encodeURIComponent(f.elements.next.value)),still?250:1350);return}if(r.status!==401&&r.status!==403)return native();const d=new DOMParser().parseFromString(await r.text(),"text/html"),m=d.querySelector("[role=alert]"),c=d.querySelector("input[name=csrf]");if(c)f.elements.csrf.value=c.value;b.classList.remove("busy");f.removeAttribute("aria-busy");void b.offsetWidth;b.classList.add("bad");e.textContent=(m&&m.textContent)||"That password didn\\u2019t work.";f.elements.password.select()})})();`;

/** `error` is trusted server text; `next` and `csrf` are escaped by the caller. */
export const gatePage = (error: string, next: string, csrf: string, nonce: string) => `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="theme-color" content="#090e10"><meta name="robots" content="noindex"><title>Shiptorio · Enter the factory</title><link rel="icon" href="/brand/favicon.svg?v=foundry-s3" type="image/svg+xml"><style>${CSS}</style></head><body${error ? ' class="bad"' : ""}>
<div class="world" aria-hidden="true"></div><div class="shade" aria-hidden="true"></div>
<main class="door">
<header class="brand"><h1><img src="/brand/wordmark-polished.webp" alt="Shiptorio" width="2172" height="724"></h1><p class="tag">A little play. A lot shipped.</p></header>
<div class="face"><form id="gate" method="post" action="/access"><input type="hidden" name="csrf" value="${csrf}"><input type="hidden" name="next" value="${next}">
<label for="password">Password</label><div class="slot"><input id="password" name="password" type="password" autocomplete="current-password" autocapitalize="none" spellcheck="false" required autofocus></div>
<button type="submit">Enter the factory</button><p id="err" class="err" role="alert">${error}</p></form>
<p class="foot">No password yet? <a href="/">Join the waitlist</a></p></div>
</main><p id="say" class="sr" aria-live="polite"></p><script nonce="${nonce}">${SCRIPT}</script></body></html>`;
