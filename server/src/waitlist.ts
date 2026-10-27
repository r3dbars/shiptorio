// Public waitlist for the landing page (web/public/welcome/). Emails go into the same D1 waitlist as
// /waitlist (signup.ts addPending), so they show up on /admin for approval. The landing page has no
// Turnstile widget yet; a hidden honeypot field and the per-IP admission budget stand in for it.
import { addPending, admit, ipScope } from "./signup";
import { boundedBody } from "./webhook-body";
import type { Env } from "./index";

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function joinWaitlist(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url);
  const isJson = (request.headers.get("content-type") ?? "").includes("application/json");
  const reply = (status: number, body: Record<string, unknown>) => isJson || status !== 200
    ? Response.json(body, { status, headers: { "cache-control": "no-store" } })
    // The no-JS form gets sent back to the page with a thank-you.
    : new Response(null, { status: 303, headers: { location: "/?joined=1#join", "cache-control": "no-store" } });

  const origin = request.headers.get("origin");
  if ((origin && origin !== url.origin) || request.headers.get("sec-fetch-site") === "cross-site") return reply(403, { error: "Please sign up from shiptorio.com." });
  const raw = await boundedBody(request, 2048);
  if (raw === null) return reply(413, { error: "Too large." });

  let fields: Record<string, unknown> = {};
  try {
    fields = isJson ? JSON.parse(raw) : Object.fromEntries(new URLSearchParams(raw));
  } catch {
    return reply(400, { error: "Couldn't read that." });
  }
  const text = (key: string) => (typeof fields?.[key] === "string" ? (fields[key] as string) : "");
  // Bots fill the hidden field; tell them it worked and keep nothing.
  if (text("website")) return reply(200, { ok: true });
  const email = text("email").trim().toLowerCase();
  if (email.length > 254 || !EMAIL.test(email)) return reply(400, { error: "That email doesn't look right." });
  if (!(await admit(env, await ipScope(request, "waitlist"), 5, 3_600_000, "waitlist flood"))) return reply(429, { error: "Too many tries from here. Give it an hour." });
  await addPending(env, email, "email");
  return reply(200, { ok: true });
}
