// Public waitlist for the landing page (web/public/welcome/). Emails land in KV as
// `waitlist:email:<email>`; the signup/invites work (Codex goal 12, PR #161) can read these
// into its D1 waitlist and take this route over.

export interface WaitlistEnv { CACHE: KVNamespace }

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PER_IP_PER_HOUR = 5;

async function sha256(value: string): Promise<string> {
  const bytes = new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value)));
  return [...bytes].map((b) => b.toString(16).padStart(2, "0")).join("");
}

export async function joinWaitlist(request: Request, env: WaitlistEnv, now = Date.now()): Promise<Response> {
  const url = new URL(request.url);
  const isJson = (request.headers.get("content-type") ?? "").includes("application/json");
  const reply = (status: number, body: Record<string, unknown>) => isJson || status !== 200
    ? Response.json(body, { status, headers: { "cache-control": "no-store" } })
    // The no-JS form gets sent back to the page with a thank-you.
    : new Response(null, { status: 303, headers: { location: "/?joined=1#join", "cache-control": "no-store" } });

  const origin = request.headers.get("origin");
  if ((origin && origin !== url.origin) || request.headers.get("sec-fetch-site") === "cross-site") return reply(403, { error: "Please sign up from shiptorio.com." });
  if (Number(request.headers.get("content-length") ?? 0) > 2048) return reply(413, { error: "Too large." });
  const raw = await request.text();
  if (raw.length > 2048) return reply(413, { error: "Too large." });

  let fields: Record<string, unknown> = {};
  try {
    fields = isJson ? JSON.parse(raw) : Object.fromEntries(new URLSearchParams(raw));
  } catch {
    return reply(400, { error: "Couldn't read that." });
  }
  const text = (key: string) => (typeof fields[key] === "string" ? (fields[key] as string) : "");
  // Bots fill the hidden field; tell them it worked and keep nothing.
  if (text("website")) return reply(200, { ok: true });
  const email = text("email").trim().toLowerCase();
  if (email.length > 254 || !EMAIL.test(email)) return reply(400, { error: "That email doesn't look right." });

  const hour = Math.floor(now / 3_600_000);
  const ipKey = `waitlist:ip:${(await sha256(request.headers.get("cf-connecting-ip") ?? "unknown")).slice(0, 24)}:${hour}`;
  const tries = Number(await env.CACHE.get(ipKey)) || 0;
  if (tries >= PER_IP_PER_HOUR) return reply(429, { error: "Too many tries from here. Give it an hour." });
  await env.CACHE.put(ipKey, String(tries + 1), { expirationTtl: 7200 });

  const key = `waitlist:email:${email}`;
  if (!(await env.CACHE.get(key))) {
    await env.CACHE.put(key, JSON.stringify({ email, at: new Date(now).toISOString(), ref: text("ref").slice(0, 200) }));
  }
  return reply(200, { ok: true });
}
