// The preview password, asked at "create your own factory" (Justin 2026-10-29). shiptorio.dev shows the tutorial to
// anyone; real accounts still sit behind the password. This is the same form as the server's gate page
// (server/src/access.ts, POST /access): on success the server sets the preview cookie and we go on to GitHub sign-in.

export type Unlock = (password: string) => Promise<"ok" | "wrong" | "busy" | "error">;

/** POST the gate form. A redirect means the password was right and the preview cookie is set. */
export function previewUnlock(request: typeof fetch = fetch): Unlock {
  return async password => {
    let response: Response;
    try {
      response = await request("/access", { method: "POST", body: new URLSearchParams({ password, next: "/" }), redirect: "manual", credentials: "same-origin", cache: "no-store" });
    } catch { return "error"; }
    if (response.type === "opaqueredirect" || response.status === 303) return "ok";
    if (response.status === 429) return "busy";
    return response.status === 401 ? "wrong" : "error";
  };
}

const SAY = { wrong: "That password didn’t work.", busy: "Too many tries. Wait a minute, then try again.", error: "Couldn’t check that. Try again." };

/** One small popup over the deck: password, then on to `next` (the GitHub sign-in). */
export function askPassword(doc: Document, next: string, navigate: (url: string) => void, unlock: Unlock = previewUnlock()) {
  if (doc.getElementById("deck-password")) return;
  const box = doc.createElement("div");
  box.id = "deck-password"; box.className = "deck-password";
  box.setAttribute("role", "dialog"); box.setAttribute("aria-modal", "true"); box.setAttribute("aria-labelledby", "deck-password-title");
  box.innerHTML = `<form><h2 id="deck-password-title">Enter the password</h2><p>Shiptorio is invite-only for now. The password unlocks GitHub sign-in.</p>
<input name="password" type="password" autocomplete="current-password" autocapitalize="none" spellcheck="false" required aria-label="Password">
<p class="err" role="alert"></p><div class="row"><button type="button" class="later">Not now</button><button type="submit" class="approve">Enter the factory</button></div></form>`;
  const form = box.querySelector("form")!, input = form.elements.namedItem("password") as HTMLInputElement, err = box.querySelector<HTMLElement>(".err")!;
  const back = doc.activeElement as HTMLElement | null;
  const close = () => { box.remove(); doc.removeEventListener("keydown", onKey, true); back?.focus?.({ preventScroll: true }); };
  // The deck's own keys (Enter approves, Escape = later) must not fire under the popup.
  const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") { e.preventDefault(); close(); } e.stopPropagation(); };
  doc.addEventListener("keydown", onKey, true);
  box.querySelector<HTMLButtonElement>(".later")!.onclick = close;
  form.onsubmit = async e => {
    e.preventDefault();
    if (form.ariaBusy === "true") return;
    form.ariaBusy = "true"; err.textContent = "";
    const result = await unlock(input.value);
    form.ariaBusy = "false";
    if (result === "ok") { navigate(next); return; }
    err.textContent = SAY[result]; input.select();
  };
  doc.body.append(box);
  input.focus();
}
