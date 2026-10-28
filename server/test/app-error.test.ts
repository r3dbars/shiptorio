import { expect, it, mock } from "bun:test";
mock.module("cloudflare:workers", () => ({ DurableObject: class { ctx: unknown; env: unknown; constructor(c: unknown, e: unknown) { this.ctx = c; this.env = e; } } }));
import { Hono } from "hono";
const { appError } = await import("../src/index");
import { RateLimitError } from "../src/rate-limit";

it("a GitHub cooldown answers 503 with Retry-After instead of a generic 500", async () => {
  const app = new Hono();
  app.get("/limited", () => { throw new RateLimitError(Date.now() + 30_000); });
  app.get("/broken", () => { throw new Error("boom"); });
  app.onError(appError);
  const limited = await app.request("/limited");
  expect(limited.status).toBe(503);
  expect(Number(limited.headers.get("retry-after"))).toBeGreaterThanOrEqual(29);
  expect((await limited.json() as { retryAt: number }).retryAt).toBeGreaterThan(Date.now());
  expect((await app.request("/broken")).status).toBe(500);
});
