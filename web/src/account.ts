// The signed-in player's settings that follow them across browsers (server: /api/me/prefs).
// localStorage stays the fast local copy; the server copy only matters in live mode, and every
// call fails quietly so the sim, private windows and signed-out visits behave as before.

/** The demo shop signed-out players start in (web/src/main.tsx). */
export const SANDBOX_REPO = "you/demo-shop";

/** Sign in with GitHub, then pick a repo. Where the sandbox's "Use your repo" goes. */
export const signInUrl = () => `/auth/login?next=${encodeURIComponent("/?onboard=repo&source=live")}`;

// Is the real Worker behind this page? On shiptorio.com (and `bun run dev`) /api/version answers JSON;
// the UI-only dev server (`bun run dev:web`) has no API, so there's nothing to sign in to. Asked once.
let up: Promise<boolean> | null = null;
export function serverUp(): Promise<boolean> {
  up ??= fetch("/api/version", { cache: "no-store" })
    .then((res) => res.ok && (res.headers.get("content-type") ?? "").includes("json"))
    .catch(() => false);
  return up;
}

/** Who /api/me says this browser is: a login when signed in, guest when it's a guest session. Asked once. */
export interface Me { login: string | null; guest?: boolean }
let me: Promise<Me | null> | null = null;
export function whoAmI(): Promise<Me | null> {
  me ??= fetch("/api/me", { cache: "no-store" })
    .then((r) => (r.ok ? (r.json() as Promise<Me>) : null))
    .catch(() => null);
  return me;
}

/** Progress syncs to the guest session only for a signed-out guest playing the demo shop. A signed-in
 *  player's sim play, or any other scenario, stays in the browser so it never lands on the real account. */
export function isGuestPlay(repo: string | undefined, me: Me | null): boolean {
  return repo === SANDBOX_REPO && !!me && !me.login;
}

export type PrefKey = "intro" | "guideSeen" | "achievements"; // achievements: web/src/ui/Achievements.tsx reads and merges its own

const LOCAL: Record<Exclude<PrefKey, "achievements">, string> = { intro: "shiptorio:intro", guideSeen: "shiptorio:guide-seen" };
// Live, a bare visit (the tour before the demo shop), or the demo shop itself: a signed-out player's prefs go
// to their guest session (server: guests), so they're kept when they sign in. Other sim scenarios stay local.
const live = () => {
  const q = new URLSearchParams(location.search);
  return q.get("source") === "live" || !q.has("source") || (q.get("source") === "sim" && q.get("repo") === SANDBOX_REPO);
};

/** Copies the account's settings into this browser. Guide progress only moves forward. */
export function seedPrefs(prefs: Partial<Record<PrefKey, string>> | undefined) {
  if (!prefs) return;
  try {
    if (prefs.intro === "1") localStorage.setItem(LOCAL.intro, "1");
    const seen = Number(prefs.guideSeen);
    if (seen > (Number(localStorage.getItem(LOCAL.guideSeen)) || 0)) localStorage.setItem(LOCAL.guideSeen, String(seen));
  } catch {
    // storage off: the account copy still holds it
  }
}

export function savePref(key: PrefKey, value: string) {
  if (!live()) return;
  fetch("/api/me/prefs", { method: "PUT", body: JSON.stringify({ [key]: value }) }).catch(() => {});
}
