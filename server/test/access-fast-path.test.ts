import { describe, expect, it, mock } from "bun:test";
mock.module("cloudflare:workers", () => ({ DurableObject: class { ctx: unknown; env: unknown; constructor(c: unknown, e: unknown) { this.ctx = c; this.env = e; } } }));
const { accessFastPath } = await import("../src/index");

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
