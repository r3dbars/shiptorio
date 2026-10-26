// Repo-scoped, expiring runner pairing. This is never a browser session token.
const enc = new TextEncoder();
const encode = (s: string) => btoa(s).replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");
export interface RunnerIdentity { repo: string; pairId: string; expires: number }
async function signature(secret: string, text: string) {
  const key = await crypto.subtle.importKey("raw", enc.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return encode(String.fromCharCode(...new Uint8Array(await crypto.subtle.sign("HMAC", key, enc.encode(text)))));
}
export async function pairToken(secret: string, identity: RunnerIdentity): Promise<string> {
  if (!secret) throw new Error("Missing signing secret");
  const body = encode(JSON.stringify({ ...identity, purpose: "runner" }));
  return `${body}.${await signature(secret, body)}`;
}
export async function readRunnerToken(secret: string, token: string, now = Date.now()): Promise<RunnerIdentity | null> {
  if (!secret || token.length > 2048) return null;
  try {
    const [body, given, extra] = token.split(".");
    if (!body || !given || extra) return null;
    const expected = await signature(secret, body);
    if (given.length !== expected.length) return null;
    let diff = 0;
    for (let i = 0; i < expected.length; i++) diff |= expected.charCodeAt(i) ^ given.charCodeAt(i);
    if (diff) return null;
    const data = JSON.parse(atob(body.replace(/-/g, "+").replace(/_/g, "/")));
    if (data.purpose !== "runner" || typeof data.repo !== "string" || !/^[\w.-]+\/[\w.-]+$/.test(data.repo) || typeof data.pairId !== "string" || !Number.isFinite(data.expires) || data.expires <= now) return null;
    return { repo: data.repo, pairId: data.pairId, expires: data.expires };
  } catch { return null; }
}
