// The signed-in player's settings that follow them across browsers (server: /api/me/prefs).
// localStorage stays the fast local copy; the server copy only matters in live mode, and every
// call fails quietly so the sim, private windows and signed-out visits behave as before.

export type PrefKey = "intro" | "guideSeen" | "achievements"; // achievements: web/src/ui/Achievements.tsx reads and merges its own

const LOCAL: Record<Exclude<PrefKey, "achievements">, string> = { intro: "shiptorio:intro", guideSeen: "shiptorio:guide-seen" };
const live = () => new URLSearchParams(location.search).get("source") === "live";

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
