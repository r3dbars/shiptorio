// Signs in to the password-gated preview as the owner, from existing gitignored server/.dev.vars secrets.
// Returns the cookie header for /api/repos/* calls. Never prints credentials.
import { makeSessionCookie } from "../src/session";

export const BASES = ["https://shiptorio.com", "https://shiptorio.dev", "http://localhost:8787"];

export async function previewSession(base: string, login = "r3dbars"): Promise<string> {
  if (!BASES.includes(base)) throw new Error("Unsupported destination");
  if (!process.env.APP_PASSWORD || !process.env.SESSION_SECRET) throw new Error("Existing server/.dev.vars credentials required");
  const gate = await fetch(`${base}/access`, { method: "POST", headers: { origin: base }, body: new URLSearchParams({ password: process.env.APP_PASSWORD }), redirect: "manual" });
  if (gate.status !== 303) throw new Error("Preview login failed");
  return gate.headers.get("set-cookie")!.split(";")[0] + "; " + (await makeSessionCookie(process.env.SESSION_SECRET, login)).split(";")[0];
}
