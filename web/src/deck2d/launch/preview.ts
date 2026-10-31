// Controls for the launch preview page (/launch.html): a play button and a scrubber pinned bottom-left. It plays on
// its own; ?at=0.4 parks at that progress instead (screenshots), ?play=0 waits for the button.

export interface Preview {
  /** Advance by dp if playing; returns the progress to show (0..1). */
  step(dp: number): number;
}

export function mountPreview(): Preview {
  const q = new URLSearchParams(location.search);
  let p = Math.max(0, Math.min(1, Number(q.get("at")) || 0)), playing = !q.has("at") && q.get("play") !== "0";
  const bar = document.createElement("div");
  bar.setAttribute("style", [
    "position:fixed", "left:calc(12px + env(safe-area-inset-left,0px))", "bottom:calc(12px + env(safe-area-inset-bottom,0px))", "z-index:20",
    "display:flex", "gap:8px", "align-items:center", "padding:8px 10px", "font:12px Silkscreen,monospace", "color:#f6e3c0",
    "background:linear-gradient(180deg,#2b2526,#1d1a1c)", "border:3px solid #0c0a0b", "border-radius:4px", "box-shadow:inset 0 0 0 2px #c98a32",
  ].join(";"));
  const btn = document.createElement("button");
  btn.type = "button";
  btn.setAttribute("style", "font:inherit;color:inherit;background:#7a2a1a;border:2px solid #c84a2a;border-radius:3px;padding:6px 10px;cursor:pointer");
  const range = document.createElement("input");
  range.type = "range"; range.min = "0"; range.max = "1000"; range.setAttribute("aria-label", "Launch build progress");
  range.setAttribute("style", "width:min(40vw,220px);accent-color:#ffc35a");
  const label = () => { btn.textContent = playing ? "❚❚ Pause" : p >= 1 ? "↺ Build launch" : "▶ Build launch"; };
  btn.addEventListener("click", () => { if (!playing && p >= 1) p = 0; playing = !playing; label(); });
  range.addEventListener("input", () => { p = Number(range.value) / 1000; playing = false; label(); });
  bar.append(btn, range);
  document.body.append(bar);
  label();
  return {
    step(dp) {
      if (playing) { p = Math.min(1, p + dp); if (p >= 1) { playing = false; label(); } }
      range.value = String(Math.round(p * 1000));
      return p;
    },
  };
}
