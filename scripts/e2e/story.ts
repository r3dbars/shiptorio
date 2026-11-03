#!/usr/bin/env bun
// Turns real-loop.ts run folders into one self-contained page: every card Shippy recommended, its screenshot,
// and the thinking behind it (each decision, the agent's tool calls, what it picked and why).
//
//   bun scripts/e2e/story.ts <run-dir> [<run-dir> ...] > story.html
import { existsSync, readFileSync } from "node:fs";
import { basename, join } from "node:path";

type Step = { tool: string; reason: string; result: string };
type Thought = { at: string; decision: string; by: string; model: string; ms: number; title: string; outcome: string; reason: string; steps: Step[] };
type Rec = { at: string; shot: string; card: { id: string; title: string; yes: string; no: string; line: string }; why?: string; actions?: { label: string; actions: { tool: string; args: unknown }[] }[]; holdingBack: { title?: string; severity?: number } | null; thoughts: Thought[] };

const esc = (s: unknown) => String(s ?? "").replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);
const dirs = process.argv.slice(2);
if (!dirs.length) { console.error("usage: bun scripts/e2e/story.ts <run-dir>..."); process.exit(1); }

const sections = dirs.map(dir => {
  const file = join(dir, "recommendations.jsonl");
  const recs: Rec[] = existsSync(file) ? readFileSync(file, "utf8").split("\n").filter(Boolean).map(l => JSON.parse(l)) : [];
  const result = existsSync(join(dir, "report.md")) ? /\*\*(.+?)\*\*/.exec(readFileSync(join(dir, "report.md"), "utf8"))?.[1] ?? "" : "";
  const cards = recs.map(r => {
    const img = join(dir, "shots", r.shot);
    const src = existsSync(img) ? `data:image/png;base64,${readFileSync(img).toString("base64")}` : "";
    const thoughts = r.thoughts.map(t => `
      <div class="thought">
        <div class="meta"><b>${esc(t.decision)}</b> by ${t.by === "spark" ? esc(t.model) : "backup rule"} · ${t.ms} ms · ${esc(t.at.slice(11, 19))}Z</div>
        <div class="looked">Looked at: ${esc(t.title)}</div>
        ${t.steps.length ? `<ol class="steps">${t.steps.map(s => `<li><code>${esc(s.tool)}</code> ${esc(s.reason)}<div class="res">→ ${esc(s.result)}</div></li>`).join("")}</ol>` : `<div class="nosteps">No tool calls (${t.by === "spark" ? "one-shot answer" : "the rule picked the heaviest signal"})</div>`}
        <div class="out"><b>Picked:</b> ${esc(t.outcome)}</div>
        <div class="why">${esc(t.reason)}</div>
      </div>`).join("");
    const acts = (r.actions ?? []).map(o => `<li><b>${esc(o.label)}</b>: ${o.actions.length ? o.actions.map(a => `<code>${esc(a.tool)}</code> ${esc(JSON.stringify(a.args))}`).join(", ") : "no action"}</li>`).join("");
    return `
    <article>
      <h3>${esc(r.card.title)}</h3>
      <div class="sub">${esc(r.at.slice(11, 19))}Z · card <code>${esc(r.card.id)}</code>${r.holdingBack?.title ? ` · holding back: ${esc(r.holdingBack.title)} (${(r.holdingBack.severity ?? 0).toFixed(2)})` : ""}</div>
      <div class="grid">
        ${src ? `<img src="${src}" alt="Deck showing ${esc(r.card.title)}">` : "<div class=\"noimg\">no screenshot</div>"}
        <div>
          ${r.why ? `<p class="cardwhy"><b>Why on the card:</b> ${esc(r.why)}</p>` : ""}
          ${acts ? `<ul class="acts">${acts}</ul>` : ""}
          ${thoughts || `<div class="nosteps">No new thinking since the last card.</div>`}
        </div>
      </div>
    </article>`;
  }).join("");
  return `<section><h2>${esc(basename(dir))}</h2>${result ? `<p class="result">${esc(result)}</p>` : ""}${cards || "<p>No cards recorded.</p>"}</section>`;
}).join("");

console.log(`<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Shippy Loop Proof</title>
<style>
:root{--bg:#fbfaf7;--fg:#1d1c1a;--mut:#6b675f;--line:#e4e0d8;--card:#fff;--acc:#b8560f}
@media (prefers-color-scheme:dark){:root:not([data-theme="light"]){--bg:#161513;--fg:#ece9e3;--mut:#a29d93;--line:#2e2b27;--card:#1f1d1a;--acc:#f0a050}}
:root[data-theme="dark"]{--bg:#161513;--fg:#ece9e3;--mut:#a29d93;--line:#2e2b27;--card:#1f1d1a;--acc:#f0a050}
body{margin:0;background:var(--bg);color:var(--fg);font:15px/1.5 system-ui,sans-serif;padding:24px 16px}
main{max-width:1100px;margin:0 auto}h1{margin:0 0 4px}h2{border-bottom:1px solid var(--line);padding-bottom:6px;margin-top:40px}
article{background:var(--card);border:1px solid var(--line);border-radius:10px;padding:16px;margin:16px 0}
h3{margin:0}.sub,.meta,.res,.nosteps{color:var(--mut);font-size:13px}.grid{display:grid;grid-template-columns:minmax(0,1.2fr) minmax(0,1fr);gap:16px;margin-top:12px}
img{width:100%;border:1px solid var(--line);border-radius:6px;image-rendering:pixelated}
.thought{border-left:3px solid var(--acc);padding:4px 0 4px 10px;margin:10px 0}.steps{padding-left:20px;margin:6px 0}.steps li{margin:4px 0}
code{font-size:12px;background:var(--line);padding:1px 4px;border-radius:4px;word-break:break-word}.result{font-weight:600}
@media (max-width:720px){.grid{grid-template-columns:1fr}}
</style></head><body><main>
<h1>Shippy loop proof</h1><p class="sub">Every card Shippy put on the deck during real runs on shiptorio.dev against r3dbars/Testing, with the thinking behind it.</p>
${sections}
</main></body></html>`);
