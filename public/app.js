// Shiptorio map client: draws the repo as a factory map and keeps PRs live over a websocket.

const TILE = 14;
const CATEGORIES = [
  { name: "Code", color: "#8fb4d8", test: (t) => /^(ts|tsx|js|jsx|mjs|cjs|py|go|rs|swift|kt|rb|java|c|cc|cpp|h|hpp|cs|php|m|mm|scala|ex|exs|lua|sh)$/.test(t.ext) },
  { name: "Tests", color: "#b98cff", test: (t) => /(^|\/)(tests?|__tests__|spec)\/|\.(test|spec)\./.test(t.path) },
  { name: "Markup + styles", color: "#d7743b", test: (t) => /^(html|css|scss|sass|less|svg|vue|svelte|astro)$/.test(t.ext) },
  { name: "Config + data", color: "#a8a498", test: (t) => /^(json|jsonc|yml|yaml|toml|lock|xml|ini|env|sql|csv)$/.test(t.ext) || t.path.split("/").pop().startsWith(".") },
  { name: "Docs", color: "#e6d3a3", test: (t) => /^(md|mdx|txt|rst|adoc)$/.test(t.ext) },
  { name: "Assets", color: "#4fb3a9", test: (t) => /^(png|jpg|jpeg|gif|webp|ico|woff2?|ttf|otf|mp3|mp4|wav|pdf)$/.test(t.ext) },
  { name: "Other", color: "#6e6b62", test: () => true },
];
// Tests first so foo.test.ts reads as a test, not code.
const ORDER = [1, 0, 2, 3, 4, 5, 6];
const CI_COLORS = { pending: "#ffa200", success: "#6ccb3c", failure: "#e04b3a" };

const $ = (id) => document.getElementById(id);
const canvas = $("map");
const ctx = canvas.getContext("2d");

const state = {
  repo: null,
  map: null,
  prs: [],
  selected: null, // PR number whose files are highlighted
  view: { x: 20, y: 40, zoom: 1 },
  ws: null,
};

function categoryOf(tile) {
  for (const i of ORDER) if (CATEGORIES[i].test(tile)) return CATEGORIES[i];
  return CATEGORIES[6];
}

// ---------- data ----------

async function api(path) {
  const res = await fetch(`/api/repos/${state.repo}/${path}`);
  if (res.status === 401) throw Object.assign(new Error("login"), { login: true });
  if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || res.statusText);
  return res.json();
}

async function loadRepo(repo) {
  state.repo = repo;
  state.selected = null;
  $("repo-input").value = repo;
  try { localStorage.setItem("shiptorio:repo", repo); } catch {}
  const u = new URL(location.href);
  u.searchParams.set("repo", repo);
  history.replaceState(null, "", u);

  showOverlay(`Surveying ${repo}…`);
  try {
    const [map, prs] = await Promise.all([api("map"), api("prs")]);
    state.map = map;
    state.prs = prs;
    hideOverlay();
    fitView();
    renderAll();
    connectLive();
  } catch (err) {
    if (err.login) showOverlay("Log in to see your factory.", true);
    else showOverlay(`Couldn't load ${repo}: ${err.message}`);
  }
}

async function refreshPrs() {
  state.prs = await api("prs");
  renderAll();
}

async function refreshMap() {
  state.map = await api("map?fresh");
  renderAll();
}

function connectLive() {
  state.ws?.close();
  const proto = location.protocol === "https:" ? "wss" : "ws";
  const repo = state.repo;
  const ws = new WebSocket(`${proto}://${location.host}/api/repos/${repo}/live`);
  state.ws = ws;
  let ping;
  ws.onopen = () => {
    setLive(true);
    ping = setInterval(() => ws.send("ping"), 30000);
  };
  ws.onmessage = (e) => {
    if (e.data === "pong") return;
    const msg = JSON.parse(e.data);
    if (msg.type === "push") refreshMap();
    else refreshPrs();
  };
  ws.onclose = () => {
    clearInterval(ping);
    setLive(false);
    if (state.ws === ws && state.repo === repo) setTimeout(() => state.repo === repo && connectLive(), 5000);
  };
}

// ---------- UI ----------

function showOverlay(text, login = false) {
  $("overlay").hidden = false;
  $("overlay-text").textContent = text;
  $("login-btn").hidden = !login;
  $("login-btn").href = `/auth/login?next=${encodeURIComponent(location.pathname + location.search)}`;
}
function hideOverlay() { $("overlay").hidden = true; }
function setLive(on) {
  $("live").classList.toggle("off", !on);
  $("live").textContent = on ? "● live" : "● offline";
}

function renderAll() {
  renderStats();
  renderPrLists();
  draw();
}

function renderStats() {
  const open = state.prs.filter((p) => p.state === "open");
  $("stat-files").textContent = state.map ? state.map.map.tiles.length + (state.map.truncated ? "+" : "") : "–";
  $("stat-zones").textContent = state.map ? state.map.map.zones.length : "–";
  $("stat-open").textContent = open.length;
  $("stat-green").textContent = open.length ? `${open.filter((p) => p.ci_status === "success").length}/${open.length}` : "–";
}

function prItem(pr) {
  const li = document.createElement("li");
  const btn = document.createElement("button");
  btn.type = "button";
  btn.setAttribute("aria-pressed", String(state.selected === pr.number));
  const status = pr.state === "merged" ? "merged" : pr.ci_status || "pending";
  btn.innerHTML = `<span class="ci ${status}" aria-hidden="true"></span><span class="num"></span><span class="ttl"></span>`;
  btn.querySelector(".num").textContent = `#${pr.number}`;
  btn.querySelector(".ttl").textContent = pr.title;
  btn.title = `${pr.title} · ${pr.files.length} files · ${status}`;
  btn.onclick = () => {
    state.selected = state.selected === pr.number ? null : pr.number;
    renderAll();
  };
  li.append(btn);
  return li;
}

function renderPrLists() {
  const open = state.prs.filter((p) => p.state === "open");
  const shipped = state.prs.filter((p) => p.state === "merged");
  fillList($("open-prs"), open, "Chest is empty. No open PRs.");
  fillList($("shipped-prs"), shipped, "Nothing merged in the last 7 days.");
}

function fillList(el, prs, emptyText) {
  el.replaceChildren(...(prs.length ? prs.map(prItem) : [Object.assign(document.createElement("li"), { className: "empty", textContent: emptyText })]));
}

function renderLegend() {
  const items = CATEGORIES.map((c) => [c.color, c.name]).concat([
    [CI_COLORS.pending, "In an open PR · CI pending"],
    [CI_COLORS.success, "In an open PR · CI green"],
    [CI_COLORS.failure, "In an open PR · CI red"],
  ]);
  $("legend").replaceChildren(
    ...items.map(([color, name]) => {
      const li = document.createElement("li");
      li.innerHTML = `<span class="swatch" aria-hidden="true"></span>`;
      li.firstChild.style.background = color;
      li.append(name);
      return li;
    }),
  );
}

// ---------- drawing ----------

function fileStatus() {
  // path -> worst CI status among open PRs touching it (or only the selected PR)
  const rank = { failure: 3, pending: 2, success: 1 };
  const out = new Map();
  for (const pr of state.prs) {
    if (pr.state !== "open") continue;
    if (state.selected != null && pr.number !== state.selected) continue;
    const s = pr.ci_status || "pending";
    for (const f of pr.files) if ((rank[s] || 0) > (rank[out.get(f)] || 0)) out.set(f, s);
  }
  return out;
}

function resize() {
  const r = canvas.getBoundingClientRect();
  const dpr = window.devicePixelRatio || 1;
  canvas.width = Math.round(r.width * dpr);
  canvas.height = Math.round(r.height * dpr);
  draw();
}

function fitView() {
  const m = state.map?.map;
  if (!m || !m.width) return;
  const r = canvas.getBoundingClientRect();
  const zoom = Math.min(2.5, Math.max(0.2, Math.min((r.width - 40) / (m.width * TILE), (r.height - 60) / ((m.height + 2) * TILE))));
  state.view = { zoom, x: (r.width - m.width * TILE * zoom) / 2, y: 30 + Math.max(0, (r.height - 30 - (m.height + 1) * TILE * zoom) / 2) };
}

function draw() {
  const dpr = window.devicePixelRatio || 1;
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  const m = state.map?.map;
  if (!m) return;

  const { x, y, zoom } = state.view;
  ctx.setTransform(dpr * zoom, 0, 0, dpr * zoom, dpr * x, dpr * y);
  const statuses = fileStatus();
  const pad = 0.5;

  for (const z of m.zones) {
    const zx = (z.x - pad) * TILE, zy = (z.y - pad) * TILE, zw = (z.w + pad * 2) * TILE, zh = (z.h + pad * 2) * TILE;
    ctx.fillStyle = "rgba(0,0,0,.35)";
    ctx.fillRect(zx + 4, zy + 5, zw, zh);
    ctx.fillStyle = "#4b4944";
    ctx.fillRect(zx, zy, zw, zh);
    ctx.strokeStyle = "#34322e";
    ctx.lineWidth = 1;
    ctx.strokeRect(zx + 0.5, zy + 0.5, zw - 1, zh - 1);
  }

  for (const t of m.tiles) {
    const tx = t.x * TILE, ty = t.y * TILE;
    ctx.fillStyle = categoryOf(t).color;
    ctx.fillRect(tx + 1.5, ty + 1.5, TILE - 3, TILE - 3);
    ctx.fillStyle = "rgba(255,255,255,.25)";
    ctx.fillRect(tx + 1.5, ty + 1.5, TILE - 3, 1.5);
    const s = statuses.get(t.path);
    if (s) {
      ctx.strokeStyle = CI_COLORS[s];
      ctx.lineWidth = 2.5;
      ctx.strokeRect(tx + 0.5, ty + 0.5, TILE - 1, TILE - 1);
    }
  }

  // zone labels stay readable at any zoom
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.font = "600 12px 'Titillium Web', sans-serif";
  ctx.textBaseline = "bottom";
  for (const z of m.zones) {
    const lx = x + (z.x - 0.5) * TILE * zoom, ly = y + (z.y - 0.5) * TILE * zoom - 3;
    const label = z.name === "/" ? "(root)" : z.name;
    const w = ctx.measureText(label).width + 10;
    ctx.fillStyle = "rgba(0,0,0,.65)";
    ctx.fillRect(lx, ly - 16, w, 16);
    ctx.fillStyle = "#ffe6c0";
    ctx.fillText(label, lx + 5, ly - 1);
  }
}

function tileAt(clientX, clientY) {
  const m = state.map?.map;
  if (!m) return null;
  const r = canvas.getBoundingClientRect();
  const gx = Math.floor((clientX - r.left - state.view.x) / (TILE * state.view.zoom));
  const gy = Math.floor((clientY - r.top - state.view.y) / (TILE * state.view.zoom));
  return m.tiles.find((t) => t.x === gx && t.y === gy) || null;
}

// ---------- pan + zoom ----------

let drag = null;
canvas.addEventListener("pointerdown", (e) => {
  drag = { x: e.clientX, y: e.clientY, vx: state.view.x, vy: state.view.y };
  canvas.setPointerCapture(e.pointerId);
  canvas.classList.add("dragging");
});
canvas.addEventListener("pointermove", (e) => {
  if (drag) {
    state.view.x = drag.vx + e.clientX - drag.x;
    state.view.y = drag.vy + e.clientY - drag.y;
    draw();
    return;
  }
  const t = tileAt(e.clientX, e.clientY);
  const tip = $("tooltip");
  if (!t) return void (tip.hidden = true);
  const prs = state.prs.filter((p) => p.state === "open" && p.files.includes(t.path)).map((p) => `#${p.number}`);
  tip.textContent = t.path + (prs.length ? ` · in ${prs.join(", ")}` : "");
  const r = canvas.getBoundingClientRect();
  tip.style.left = `${Math.min(e.clientX - r.left + 14, r.width - tip.offsetWidth - 4)}px`;
  tip.style.top = `${e.clientY - r.top + 14}px`;
  tip.hidden = false;
});
canvas.addEventListener("pointerup", () => {
  drag = null;
  canvas.classList.remove("dragging");
});
canvas.addEventListener("pointerleave", () => ($("tooltip").hidden = true));
canvas.addEventListener(
  "wheel",
  (e) => {
    e.preventDefault();
    const r = canvas.getBoundingClientRect();
    const px = e.clientX - r.left, py = e.clientY - r.top;
    const next = Math.min(6, Math.max(0.15, state.view.zoom * Math.exp(-e.deltaY * 0.0015)));
    const k = next / state.view.zoom;
    state.view = { zoom: next, x: px - (px - state.view.x) * k, y: py - (py - state.view.y) * k };
    draw();
  },
  { passive: false },
);

// ---------- boot ----------

$("repo-form").addEventListener("submit", (e) => {
  e.preventDefault();
  const v = $("repo-input").value.trim().replace(/^https?:\/\/github\.com\//, "").replace(/\/$/, "");
  if (/^[\w.-]+\/[\w.-]+$/.test(v)) loadRepo(v);
});
new ResizeObserver(resize).observe(canvas);
renderLegend();

(async () => {
  const me = await fetch("/api/me").then((r) => r.json()).catch(() => ({}));
  if (!me.allowed) return showOverlay(me.login ? `${me.login} isn't on the allow list.` : "Log in to see your factory.", !me.login);
  let saved = null;
  try { saved = localStorage.getItem("shiptorio:repo"); } catch {}
  const repo = new URL(location.href).searchParams.get("repo") || saved;
  if (repo) loadRepo(repo);
  else showOverlay("Type a repo up top to survey it.");
})();
