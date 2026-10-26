import { createHash } from "node:crypto";
import { makeSessionCookie } from "../src/session";
import type { BrowserSocketAuth, BrowserSocketEnv } from "../src/browser-socket";

// Explicit authentication for tests of unrelated player actions. Production sockets
// must get this attachment from a verified upgrade; missing attachments are denied.
export const browserEnv: BrowserSocketEnv = { SESSION_SECRET: "test-browser-session", APP_PASSWORD: "test-browser-preview", ALLOWED_LOGINS: "test-player" };
export function authorizedSocket(send: (raw: string) => void = () => {}) {
  let auth: unknown = { login: "test-player", expiresAt: Date.now() + 60000, epoch: createHash("sha256").update(JSON.stringify(["browser-socket-v1", browserEnv.SESSION_SECRET, browserEnv.APP_PASSWORD, browserEnv.ALLOWED_LOGINS])).digest("hex") } satisfies BrowserSocketAuth;
  return { send, close() {}, deserializeAttachment: () => structuredClone(auth), serializeAttachment(value: unknown) { auth = structuredClone(value); } } as unknown as WebSocket;
}
export async function browserCookies() {
  return (await makeSessionCookie(browserEnv.SESSION_SECRET, "test-player")).split(";")[0] + "; " + (await makeSessionCookie(`${browserEnv.SESSION_SECRET}:${browserEnv.APP_PASSWORD}`, "preview")).split(";")[0].replace("shiptorio_session=", "shiptorio_access=");
}
