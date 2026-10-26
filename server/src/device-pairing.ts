// Device records live in isolated instances of the existing Factory binding. The human code
// locates a record; only the runner's random secret can retrieve its repo-scoped credential.
export interface DeviceRecord { secret: string; expires: number; approved?: { repo: string; token: string; expires: number }; ready?: boolean; delivered?: boolean; lastPoll?: number }
export const DEVICE_TTL = 10 * 60_000;
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
export const runnerPage = (title: string, body: string) => `<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${htmlEscape(title)} · Shiptorio</title><style>body{background:#1b2448;color:#eee;font:17px system-ui;line-height:1.6;margin:0}main{max-width:680px;margin:8vh auto;padding:24px}a{color:#6fb2ff}button,input,select{font:inherit;padding:12px;max-width:100%;box-sizing:border-box}button{background:#f2a93b;border:0;border-radius:6px;cursor:pointer}code,pre{overflow-wrap:anywhere;white-space:pre-wrap;background:#111a34;padding:6px}label{display:block;margin:16px 0}</style><main><a href="/">Shiptorio</a><h1>${htmlEscape(title)}</h1>${body}</main></html>`;
