// Shiptorio docs: search over /docs/search.json (fetched on first focus), copy buttons, "/" to search.
(() => {
  const q = document.getElementById("q");
  const box = document.getElementById("results");
  let index = null;
  let picked = -1;
  const esc = (s) => s.replace(/[&<>"]/g, (c) => `&#${c.charCodeAt(0)};`);
  const load = () => index || (index = fetch("/docs/search.json").then((r) => r.json()).catch(() => []));

  function snippet(text, terms) {
    const lower = text.toLowerCase();
    const at = Math.max(0, Math.min(...terms.map((t) => lower.indexOf(t)).filter((i) => i >= 0)) - 40);
    let s = esc((at ? "…" : "") + text.slice(at, at + 140) + (text.length > at + 140 ? "…" : ""));
    for (const t of terms) s = s.replace(new RegExp(`(${t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")})`, "gi"), "<mark>$1</mark>");
    return s;
  }

  async function search() {
    const terms = q.value.toLowerCase().split(/\s+/).filter((t) => t.length > 1);
    if (!terms.length) { box.hidden = true; return; }
    const entries = await load();
    const hits = [];
    for (const e of entries) {
      const head = `${e.page} ${e.heading}`.toLowerCase();
      const body = e.text.toLowerCase();
      if (!terms.every((t) => head.includes(t) || body.includes(t))) continue;
      hits.push({ e, score: terms.reduce((n, t) => n + (head.includes(t) ? 10 : 0) + (body.split(t).length - 1), 0) });
    }
    hits.sort((a, b) => b.score - a.score);
    picked = -1;
    box.innerHTML = hits.length
      ? hits.slice(0, 8).map(({ e }) => `<a href="${e.url}" role="option"><b>${esc(e.heading)}</b><small>${e.heading === e.page ? "" : esc(e.page) + " · "}${snippet(e.text, terms)}</small></a>`).join("")
      : `<p>Nothing for “${esc(q.value)}”. Try fewer words.</p>`;
    box.hidden = false;
  }

  if (q && box) {
    q.addEventListener("focus", load);
    q.addEventListener("input", search);
    q.addEventListener("keydown", (ev) => {
      const links = [...box.querySelectorAll("a")];
      if (ev.key === "Escape") { box.hidden = true; q.blur(); return; }
      if (!links.length) return;
      if (ev.key === "ArrowDown" || ev.key === "ArrowUp") {
        ev.preventDefault();
        picked = (picked + (ev.key === "ArrowDown" ? 1 : -1) + links.length) % links.length;
        links.forEach((a, i) => a.setAttribute("aria-selected", String(i === picked)));
      } else if (ev.key === "Enter") {
        (links[picked] || links[0]).click();
      }
    });
    document.addEventListener("click", (ev) => { if (!ev.target.closest(".search")) box.hidden = true; });
    document.addEventListener("keydown", (ev) => {
      if (ev.key === "/" && document.activeElement !== q && !/INPUT|TEXTAREA/.test(document.activeElement.tagName)) { ev.preventDefault(); q.focus(); }
    });
  }

  for (const btn of document.querySelectorAll(".copy")) {
    btn.addEventListener("click", () => {
      const code = btn.parentElement.querySelector("code").textContent;
      navigator.clipboard?.writeText(code).then(() => { btn.textContent = "copied"; setTimeout(() => (btn.textContent = "copy"), 1500); });
    });
  }

  // phones start with the menu folded away
  const side = document.querySelector(".side");
  if (side && matchMedia("(max-width: 760px)").matches) side.open = false;
})();
