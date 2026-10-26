import { Hono } from "hono";
import { RepoSchema } from "@shiptorio/shared";
import { isAllowed, readSession } from "../src/session";
import type { Env } from "../src/index";

export const factoryRoutes = new Hono<{ Bindings: Env }>();
factoryRoutes.use("*", async (c, next) => {
  const login = await readSession(c.env.SESSION_SECRET, c.req.header("cookie") ?? null);
  if (!login || !isAllowed(c.env.ALLOWED_LOGINS, login)) return c.json({ error: "login required" }, 401);
  // Browser mutation requests must be same-origin. CLI clients may omit Origin.
  const origin = c.req.header("origin");
  if (origin && origin !== new URL(c.req.url).origin) return c.json({ error: "origin mismatch" }, 403);
  await next();
});
factoryRoutes.all("/api/repos/:owner/:name/factory", async (c) => {
  const repo = RepoSchema.safeParse(`${c.req.param("owner")}/${c.req.param("name")}`.toLowerCase());
  if (!repo.success) return c.json({ error: "invalid repository" }, 400);
  const isSocket = c.req.header("upgrade")?.toLowerCase() === "websocket";
  if (!isSocket && c.req.method !== "GET" && c.req.method !== "POST") return c.json({ error: "method not allowed" }, 405);
  const operation = isSocket ? "live" : c.req.method === "POST" ? "command" : "state";
  const url = `https://factory/${operation}?repo=${encodeURIComponent(repo.data)}`;
  const stub = c.env.FACTORY.get(c.env.FACTORY.idFromName(repo.data));
  return stub.fetch(new Request(url, c.req.raw));
});
