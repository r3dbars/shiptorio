import { personaId, personaRepo, TEST_PERSONAS, type TestPersona } from "./test-users-policy";
// Symbol capability is never configurable through a Worker var or browser header.
export const ISOLATED_TEST_CONTEXT = Symbol("isolated-fixture-context");
const encoder = new TextEncoder();
const b64 = (s: Uint8Array) => btoa(String.fromCharCode(...s)).replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");
const unb64 = (s: string) => Uint8Array.from(atob(s.replace(/-/g, "+").replace(/_/g, "/")), c => c.charCodeAt(0));
async function key(secret: string) { return crypto.subtle.importKey("raw", encoder.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign", "verify"]); }
async function digest(request: Request) {
  if (["GET", "HEAD"].includes(request.method)) return "";
  const reader = request.clone().body?.getReader();
  if (!reader) return b64(new Uint8Array(await crypto.subtle.digest("SHA-256", new Uint8Array())));
  const chunks: Uint8Array[] = []; let size = 0;
  for (;;) { const { value, done } = await reader.read(); if (done) break; size += value.length; if (size > 65536) { await reader.cancel(); throw new Error("Test request too large"); } chunks.push(value); }
  const bytes = new Uint8Array(size); let at = 0; for (const chunk of chunks) { bytes.set(chunk, at); at += chunk.length; }
  return b64(new Uint8Array(await crypto.subtle.digest("SHA-256", bytes)));
}
export function delegatedPath(request: Request, persona: TestPersona) {
  const url = new URL(request.url), path = url.pathname;
  if (url.origin !== "https://shiptorio.dev") return false;
  if (path === "/test/reset") return request.method === "POST" && !url.search;
  if (path === "/api/empire") return request.method === "GET" && !url.search;
  if (path === "/api/repos" || path === "/test/install") return ["GET", "POST"].includes(request.method);
  if (["/api/setup/status", "/api/sources"].includes(path)) return request.method === "GET" && url.searchParams.get("repo") === personaRepo(persona);
  const root = `/api/repos/${personaRepo(persona)}/`;
  return path.startsWith(root) && !path.slice(root.length).startsWith("runner/") || request.method === "GET" && path === root + "runner/status";
}
export async function delegateTestRequest(request: Request, user: { id: number; login: string }, secret: string, now = Date.now()): Promise<Request> {
  const p = user.login as TestPersona;
  if (secret.length < 32 || !TEST_PERSONAS.includes(p) || user.id !== personaId(p) || !delegatedPath(request, p)) throw new Error("Invalid test delegation");
  const url = new URL(request.url);
  const claims = b64(encoder.encode(JSON.stringify({ persona: p, uid: user.id, method: request.method, target: url.pathname + url.search, body: await digest(request), expires: now + 60000 })));
  const sig = b64(new Uint8Array(await crypto.subtle.sign("HMAC", await key(secret), encoder.encode(claims))));
  const headers = new Headers();
  for (const name of ["origin", "content-type", "upgrade", "sec-websocket-key", "sec-websocket-version"]) { const value = request.headers.get(name); if (value) headers.set(name, value); }
  headers.set("x-shiptorio-test-delegation", `${claims}.${sig}`);
  return new Request(request, { headers, redirect: "manual" });
}
export async function verifyTestDelegation(request: Request, secret: string, now = Date.now()): Promise<TestPersona | null> {
  if (secret.length < 32) return null;
  try {
    const raw = request.headers.get("x-shiptorio-test-delegation") ?? "";
    if (raw.length > 2048) return null;
    const [body, sig, extra] = raw.split(".");
    if (extra || !body || !sig || !await crypto.subtle.verify("HMAC", await key(secret), unb64(sig), encoder.encode(body))) return null;
    const c = JSON.parse(new TextDecoder().decode(unb64(body))), url = new URL(request.url);
    if (!TEST_PERSONAS.includes(c.persona) || c.uid !== personaId(c.persona) || !delegatedPath(request, c.persona) || c.method !== request.method || c.target !== url.pathname + url.search || c.expires <= now || c.expires > now + 60000 || c.body !== await digest(request)) return null;
    return c.persona;
  } catch { return null; }
}
