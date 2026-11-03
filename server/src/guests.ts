import { validProgress, type Progress } from "@shiptorio/shared";
import { isPrefKey, MAX_PROGRESS_BYTES, validPrefs, type AccountsEnv, type PrefKey, type User } from "./accounts";
import { toHex as hex } from "./encode";

/** A guest owns only a sample save. It is deliberately not a User/session or repository principal. */
export const GUEST_COOKIE = "shiptorio_guest";
export const GUEST_TTL = 30 * 86400_000;
const TOUCH_INTERVAL = 6 * 3600_000;
const encoder = new TextEncoder();
type GuestEnv = Pick<AccountsEnv, "DB" | "SESSION_SECRET">;
export interface GuestSave { progress: Progress | null; prefs: Partial<Record<PrefKey, string>> }
export interface Guest { id: string; createdAt: number; lastSeenAt: number; save: GuestSave }
const emptySave = (): GuestSave => ({ progress: null, prefs: {} });
async function key(secret: string) {
  return crypto.subtle.importKey("raw", encoder.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign", "verify"]);
}
async function signature(secret: string, id: string) {
  return hex(await crypto.subtle.sign("HMAC", await key(secret), encoder.encode(`guest:${id}`)));
}
export async function guestCookie(env: GuestEnv, id: string): Promise<string> {
  return `${GUEST_COOKIE}=${id}.${await signature(env.SESSION_SECRET, id)}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${GUEST_TTL / 1000}`;
}
export const clearGuestCookie = () => `${GUEST_COOKIE}=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0`;

export async function currentGuest(env: GuestEnv, cookies: string | null, now = Date.now()): Promise<Guest | null> {
  const value = cookies?.split(";").map(v => v.trim()).find(v => v.startsWith(`${GUEST_COOKIE}=`))?.slice(GUEST_COOKIE.length + 1);
  const match = value?.match(/^([a-f0-9-]{36})\.([a-f0-9]{64})$/);
  if (!match) return null;
  const [, id, sig] = match;
  if (!await crypto.subtle.verify("HMAC", await key(env.SESSION_SECRET), Uint8Array.from(sig.match(/../g)!, x => parseInt(x, 16)), encoder.encode(`guest:${id}`))) return null;
  const row = await env.DB.prepare("SELECT id, created_at, last_seen_at, progress_json FROM guests WHERE id = ? AND last_seen_at > ?")
    .bind(id, now - GUEST_TTL).first<{ id: string; created_at: number; last_seen_at: number; progress_json: string }>();
  if (!row) return null;
  let save = emptySave();
  try {
    const parsed = JSON.parse(row.progress_json);
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed) && validPrefs(parsed.prefs, true)) {
      const progress = parsed.progress === null ? null : validProgress(JSON.stringify(parsed.progress));
      if (parsed.progress === null || progress) save = { progress, prefs: parsed.prefs };
    }
  } catch { /* A bad save must never become trusted account data. */ }
  return { id: row.id, createdAt: row.created_at, lastSeenAt: row.last_seen_at, save };
}
export async function createGuest(env: GuestEnv, now = Date.now()): Promise<Guest> {
  const guest = { id: crypto.randomUUID(), createdAt: now, lastSeenAt: now, save: emptySave() };
  await env.DB.prepare("INSERT INTO guests(id, created_at, last_seen_at, progress_json) VALUES (?, ?, ?, ?)")
    .bind(guest.id, now, now, JSON.stringify(guest.save)).run();
  return guest;
}
/** At most one touch per six hours; page refreshes do not amplify D1 writes. */
export async function touchGuest(env: GuestEnv, guest: Guest, now = Date.now()): Promise<boolean> {
  if (guest.lastSeenAt > now - TOUCH_INTERVAL) return false;
  const changed = await env.DB.prepare("UPDATE guests SET last_seen_at = ? WHERE id = ? AND last_seen_at <= ? AND last_seen_at > ?")
    .bind(now, guest.id, now - TOUCH_INTERVAL, now - GUEST_TTL).run();
  return !!changed.meta.changes;
}
export async function writeGuestProgress(env: GuestEnv, guest: Guest, raw: string, now = Date.now()): Promise<boolean> {
  if (encoder.encode(raw).length > MAX_PROGRESS_BYTES) return false;
  const progress = validProgress(raw);
  if (!progress) return false;
  // json_set preserves a concurrent preference write instead of replacing the entire save.
  const changed = await env.DB.prepare("UPDATE guests SET progress_json = json_set(progress_json, '$.progress', json(?)), last_seen_at = ? WHERE id = ? AND last_seen_at > ?")
    .bind(JSON.stringify(progress), now, guest.id, now - GUEST_TTL).run();
  return !!changed.meta.changes;
}
export async function writeGuestPrefs(env: GuestEnv, guest: Guest, prefs: Record<string, unknown>, now = Date.now()): Promise<boolean> {
  if (!validPrefs(prefs)) return false;
  const entries = Object.entries(prefs).filter(([k]) => isPrefKey(k));
  const changed = await env.DB.prepare(`UPDATE guests SET progress_json = json_set(progress_json, ${entries.map(() => "?, ?").join(", ")}), last_seen_at = ? WHERE id = ? AND last_seen_at > ?`)
    .bind(...entries.flatMap(([k, v]) => [`$.prefs.${k}`, v]), now, guest.id, now - GUEST_TTL).run();
  return !!changed.meta.changes;
}
/** One transaction: existing account progress wins, then the guest is consumed even on callback retry. */
export async function mergeGuest(env: GuestEnv, cookies: string | null, user: User, now = Date.now()): Promise<boolean> {
  const guest = await currentGuest(env, cookies, now);
  if (!guest) return false;
  const condition = "EXISTS (SELECT 1 FROM guests WHERE id = ? AND last_seen_at > ?) AND NOT EXISTS (SELECT 1 FROM user_progress WHERE user_id = ?)";
  const statements = Object.entries(guest.save.prefs).map(([name, value]) => env.DB.prepare(
    `INSERT INTO user_prefs(user_id, key, value, updated_at) SELECT ?, ?, ?, ? WHERE ${condition} ON CONFLICT(user_id, key) DO NOTHING`,
  ).bind(user.id, name, value, now, guest.id, now - GUEST_TTL, user.id));
  if (guest.save.progress) statements.push(env.DB.prepare(
    `INSERT INTO user_progress(user_id, value, updated_at) SELECT ?, ?, ? WHERE ${condition} ON CONFLICT(user_id) DO NOTHING`,
  ).bind(user.id, JSON.stringify(guest.save.progress), now, guest.id, now - GUEST_TTL, user.id));
  statements.push(env.DB.prepare("DELETE FROM guests WHERE id = ?").bind(guest.id));
  await env.DB.batch(statements);
  return true;
}
export async function sweepGuests(env: GuestEnv, now = Date.now()): Promise<void> {
  await env.DB.prepare("DELETE FROM guests WHERE last_seen_at <= ?").bind(now - GUEST_TTL).run();
}
