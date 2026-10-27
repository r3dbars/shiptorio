import { describe, expect, it, mock } from "bun:test";
mock.module("cloudflare:workers", () => ({ DurableObject: class { ctx: unknown; env: unknown; constructor(c: unknown, e: unknown) { this.ctx = c; this.env = e; } } }));
const { accessFastPath, default: worker } = await import("../src/index");

const limiter = (allowed: boolean, seen: string[] = []) => ({
  idFromName: (name: string) => name,
  get: (name: string) => ({ securityLimit: async (budget: string) => { seen.push(`${name}:${budget}`); return { allowed, retryAfter: 42 }; } }),
});
const env = (allowed = true, seen: string[] = []) => ({ APP_PASSWORD: "test-preview-password", SESSION_SECRET: "test-session-secret", FACTORY: limiter(allowed, seen) }) as never;
const post = (password: string) => new Request("https://shiptorio.com/access", {
  method: "POST", body: `password=${password}&next=%2F`,
  headers: { origin: "https://shiptorio.com", "content-type": "application/x-www-form-urlencoded", "cf-connecting-ip": "203.0.113.9" },
});

describe("password form fast path", () => {
  it("signs in with the right password, spends the per-IP auth budget, and keeps the security headers", async () => {
    const seen: string[] = [];
    const res = (await accessFastPath(post("test-preview-password"), env(true, seen)))!;
    expect(res.status).toBe(303);
    expect(res.headers.get("set-cookie")).toContain("shiptorio_access=");
    expect(res.headers.get("x-frame-options")).toBe("DENY");
    expect(seen).toHaveLength(1);
    expect(seen[0]).toEndWith(":auth");
  });
  it("rejects a wrong password with the gate, and a spent budget with 429", async () => {
    expect((await accessFastPath(post("nope"), env()))!.status).toBe(401);
    const limited = (await accessFastPath(post("test-preview-password"), env(false)))!;
    expect(limited.status).toBe(429);
    expect(limited.headers.get("retry-after")).toBe("42");
  });
  it("only handles /access in password mode", async () => {
    expect(await accessFastPath(new Request("https://shiptorio.com/"), env())).toBeNull();
    expect(await accessFastPath(post("x"), { ...(env() as object), SIGNUP_GATE_MODE: "waitlist" } as never)).toBeNull();
    expect((await accessFastPath(new Request("http://shiptorio.com/access"), env()))!.status).toBe(308);
  });
});


it("limiter failures return a controlled fail-closed response with headers and no raw error details", async () => {
  const canary = "synthetic-private-error-canary";
  let calls = 0;
  const broken = { ...(env() as object), FACTORY: { idFromName: (name: string) => name, get: () => ({ securityLimit: async () => { calls++; throw new Error(canary); } }) } } as never;
  const messages: string[] = [], original = console.error;
  console.error = (...args: unknown[]) => { messages.push(args.map(String).join(" ")); };
  try {
    const response = await worker.fetch(post("test-preview-password"), broken, {} as never);
    expect(response.status).toBe(503);
    expect(calls).toBe(1); // no fallback into the app's limiter or password path
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(response.headers.get("retry-after")).toBe("5");
    expect(response.headers.get("x-frame-options")).toBe("DENY");
    expect(response.headers.get("content-security-policy")).toContain("default-src 'none'");
    expect(response.headers.get("strict-transport-security")).toContain("max-age=");
    expect(response.headers.get("set-cookie")).toBeNull();
    const requestId = response.headers.get("x-request-id");
    expect(requestId).toMatch(/^[a-f0-9-]{36}$/);
    expect(messages.join("\n")).toContain(requestId!);
    expect(messages.join("\n")).not.toContain(canary);
    const body = await response.text();
    expect(body).toContain("temporarily unavailable");
    expect(body).not.toContain(canary);
  } finally { console.error = original; }
});

it("fast-path signed form proof still supports Firefox privacy headers without allowing foreign origins", async () => {
  const settings = env();
  const gate = (await accessFastPath(new Request("https://shiptorio.com/access"), settings))!;
  const csrf = (await gate.text()).match(/name="csrf"[^>]*value="([^"]+)"/)?.[1];
  expect(csrf).toBeDefined();
  const cookie = gate.headers.get("set-cookie")!.split(";")[0];
  const submit = (headers: Record<string, string>, token = csrf!) => new Request("https://shiptorio.com/access", { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded", ...headers }, body: new URLSearchParams({ password: "test-preview-password", csrf: token, next: "/" }) });
  expect((await accessFastPath(submit({ cookie }), settings))!.status).toBe(303);
  for (const headers of [{ cookie, origin: "https://foreign.invalid" }, { cookie, origin: "https://shiptorio.com", "sec-fetch-site": "cross-site" }]) {
    const denied = (await accessFastPath(submit(headers), settings))!;
    expect(denied.status).toBe(403);
    expect(denied.headers.get("set-cookie")).not.toContain("shiptorio_access=");
  }
  expect((await accessFastPath(submit({}, "invalid"), settings))!.status).toBe(403);
});
