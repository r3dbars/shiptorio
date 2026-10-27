import { ironPage } from "./ironPage";
// Device records live in isolated instances of the existing Factory binding. The human code
// locates a record; only the runner's random secret can retrieve its repo-scoped credential.
export interface DeviceRecord { secret: string; expires: number; approved?: { repo: string; token: string; expires: number }; ready?: boolean; delivered?: boolean; lastPoll?: number }
export const DEVICE_TTL = 10 * 60_000;
// One-paste setup: the signed-in Power panel mints a join code that rides in the install command. It lands in shell
// history and screen shares, so it is single use, lives ten minutes and is bound to one account and one repo.
export interface JoinRecord { repo: string; user: import("./authorization").AccessUser; expires: number }
export const JOIN_RE = /^[a-f0-9]{48}$/;
export const newJoinCode = () => (crypto.randomUUID() + crypto.randomUUID()).replace(/-/g, "").slice(0, 48);
export const CODE_RE = /^[A-F0-9]{4}-[A-F0-9]{4}-[A-F0-9]{4}$/;
export const normalizeCode = (code: string) => code.trim().toUpperCase();
export async function secretHash(secret: string) {
  return [...new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(secret)))].map(b => b.toString(16).padStart(2, "0")).join("");
}
export function pollDevice(record: DeviceRecord | undefined, secret: string, now = Date.now()) {
  if (!record || record.expires <= now || record.delivered || record.secret !== secret) return { status: "expired" as const };
  if (record.lastPoll && now - record.lastPoll < 2000) return { status: "slow_down" as const };
  record.lastPoll = now;
  if (!record.approved || !record.ready) return { status: "pending" as const };
  const pairing = record.approved;
  record.delivered = true;
  delete record.approved;
  return { status: "approved" as const, ...pairing };
}
export const htmlEscape = (value: string) => value.replace(/[&<>"']/g, c => `&#${c.charCodeAt(0)};`);
// Keep pairing font-free under its strict route CSP; the shared plate provides a monospace fallback.
export const runnerPage = (title: string, body: string) => ironPage({ title, eyebrow: "Runner · pairing", fonts: false, alarm: /expired|unavailable/i.test(title), body: `<h1>${htmlEscape(title)}</h1>${body}` });
