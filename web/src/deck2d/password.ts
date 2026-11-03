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

// shiptorio.com is the public tutorial (Justin 2026-11-03): no accounts and no model calls there, so "create your own
// factory" asks for an email for the waitlist instead (POST /api/waitlist, server/src/waitlist.ts). The password is
// one tap away for anyone who has it.
export const WAITLIST_HOSTS = new Set(["shiptorio.com", "www.shiptorio.com"]);

export type Join = (email: string) => Promise<"ok" | "bad" | "busy" | "error">;

export function joinWaitlist(request: typeof fetch = fetch): Join {
  return async email => {
    try {
      const response = await request("/api/waitlist", { method: "POST", redirect: "error", credentials: "same-origin", cache: "no-store", headers: { "content-type": "application/json", accept: "application/json" }, body: JSON.stringify({ email, website: "" }) });
      if (response.status === 429) return "busy";
      if (response.status === 400) return "bad";
      const body = await response.json().catch(() => null) as { ok?: boolean } | null;
      return response.ok && body?.ok === true ? "ok" : "error";
    } catch { return "error"; }
  };
}

const JOIN_SAY = { bad: "That email doesn’t look right.", busy: "Too many tries from here. Give it an hour.", error: "Couldn’t join right now. Try again." };

/** The waitlist popup: an email, then a thank-you. "I have a password" switches to askPassword. */
export function askWaitlist(doc: Document, onPassword: () => void, join: Join = joinWaitlist()) {
  if (doc.getElementById("deck-password")) return;
  const box = doc.createElement("div");
  box.id = "deck-password"; box.className = "deck-password";
  box.setAttribute("role", "dialog"); box.setAttribute("aria-modal", "true"); box.setAttribute("aria-labelledby", "deck-password-title");
  box.innerHTML = `<form><h2 id="deck-password-title">Join the waitlist</h2><p>Put your email in and I’ll send you more info once Shiptorio becomes a real thing.</p>
<input name="email" type="email" autocomplete="email" autocapitalize="none" spellcheck="false" required aria-label="Email" placeholder="you@example.com">
<p class="err" role="alert"></p><div class="row"><button type="button" class="later">Not now</button><button type="submit" class="approve">Join the waitlist</button></div>
<p class="alt"><a href="#" class="has-password">I have a password</a></p></form>`;
  const form = box.querySelector("form")!, input = form.elements.namedItem("email") as HTMLInputElement, err = box.querySelector<HTMLElement>(".err")!;
  const back = doc.activeElement as HTMLElement | null;
  const close = () => { box.remove(); doc.removeEventListener("keydown", onKey, true); back?.focus?.({ preventScroll: true }); };
  const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") { e.preventDefault(); close(); } e.stopPropagation(); };
  doc.addEventListener("keydown", onKey, true);
  box.querySelector<HTMLButtonElement>(".later")!.onclick = close;
  box.querySelector<HTMLAnchorElement>(".has-password")!.onclick = e => { e.preventDefault(); close(); onPassword(); };
  form.onsubmit = async e => {
    e.preventDefault();
    if (form.ariaBusy === "true") return;
    const email = input.value.trim();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { err.textContent = JOIN_SAY.bad; input.select(); return; }
    form.ariaBusy = "true"; err.textContent = "";
    const result = await join(email);
    form.ariaBusy = "false";
    if (result === "ok") {
      form.innerHTML = `<h2 id="deck-password-title">You’re on the list</h2><p>Thanks! I’ll email you once there’s more to share.</p><div class="row"><button type="button" class="approve">Back to the factory</button></div>`;
      const done = form.querySelector<HTMLButtonElement>("button")!;
      done.onclick = close; done.focus();
      return;
    }
    err.textContent = JOIN_SAY[result]; input.select();
  };
  doc.body.append(box);
  input.focus();
}
