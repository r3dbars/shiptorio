import { createHash } from "node:crypto";
import { makeSessionCookie } from "../src/session";
import type { BrowserSocketAuth, BrowserSocketEnv } from "../src/browser-socket";

export const unlimitedFactory = { idFromName: (name: string) => name, get: () => ({ securityLimit: async () => ({ allowed: true, retryAfter: 0 }) }) };

// Explicit authentication for tests of unrelated player actions. Production sockets
// must get this attachment from a verified upgrade; missing attachments are denied.
export const browserEnv: BrowserSocketEnv & { FACTORY: typeof unlimitedFactory } = { SIGNUP_GATE_MODE:"password", SESSION_SECRET: "test-browser-session", APP_PASSWORD: "test-browser-preview", ALLOWED_LOGINS: "test-player", FACTORY: unlimitedFactory };
export function authorizedSocket(send: (raw: string) => void = () => {}, repo = "r3dbars/demo") {
  let auth: unknown = { repo, user: fixtureUser(), login: "test-player", expiresAt: Date.now() + 60000, epoch: createHash("sha256").update(JSON.stringify(["browser-socket-v1", browserEnv.SESSION_SECRET, browserEnv.APP_PASSWORD, browserEnv.ALLOWED_LOGINS])).digest("hex") } satisfies BrowserSocketAuth;
  return { send, close() {}, deserializeAttachment: () => structuredClone(auth), serializeAttachment(value: unknown) { auth = structuredClone(value); } } as unknown as WebSocket;
}
export async function browserCookies() {
  return (await makeSessionCookie(browserEnv.SESSION_SECRET, "test-player", Date.now(), { sid: "fixture-session", uid: 1 })).split(";")[0] + "; " + (await makeSessionCookie(`${browserEnv.SESSION_SECRET}:${browserEnv.APP_PASSWORD}`, "preview")).split(";")[0].replace("shiptorio_session=", "shiptorio_access=");
}

export const membershipCache = { get: async (key: string) => key.startsWith("access:v2:") ? { expiresAt: Date.now() + 59000 } : null, put: async () => {} };
export function authorizedDB(original: any) { return { ...original, prepare(sql: string) {
  if (sql.includes("github_authorization_revocations") || sql.includes("token_version") || sql.includes("SELECT archived_at") || sql.startsWith("SELECT permissions")) return { bind: () => ({ first: async () => null }) };
  if (sql.startsWith('SELECT') && (sql.startsWith('SELECT u.id, u.login FROM sessions') || sql.includes('FROM user_repos WHERE') || sql.includes('FROM user_installations WHERE') || sql === 'SELECT installation_id FROM repos WHERE full_name = ?' || sql === 'SELECT id FROM installations WHERE id = ?')) return { bind: () => ({ first: async () => ({ installation_id: 1, id: 1, login: "test-player", enabled:1, runs_daily:20, count:1 }) }) };

  if (sql.startsWith('SELECT enabled')) return {bind:()=>({first:async()=>null})};
  if (sql.startsWith('SELECT login FROM signup_resources')) return {bind:()=>({first:async()=>({login:'test-player'})})};
  if (sql.startsWith('SELECT runs_daily')) return {bind:()=>({first:async()=>({runs_daily:20})})};
  if (sql.startsWith('INSERT INTO signup_counters')) return {bind:()=>({first:async()=>({count:1})})};

  return original.prepare(sql);
} }; }

export const fixtureUser = () => ({ id: 1, login: "test-player", expiresAt: Date.now() + 60000, sessionHash: createHash("sha256").update("fixture-session").digest("hex") });
