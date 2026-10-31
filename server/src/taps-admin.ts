// Retired taps report URLs keep their original admin boundary before redirecting
// to the current ops page. Tap collection and brain signals remain active.
import type { Hono } from "hono";
import { configuredAdmin } from "./admin-policy";
import { currentUser } from "./accounts";

export function tapsRoutes(app: Hono<any>) {
  const admin = async (c: any) => configuredAdmin(c.env, (await currentUser(c.env, c.req.header("cookie") ?? null, new URL(c.req.url)))?.login ?? null);
  for (const path of ["/admin/taps", "/admin/taps/app.js", "/admin/taps/data"]) {
    app.get(path, async c => {
      if (!(await admin(c))) return c.json({ error: "admin login required" }, 403);
      c.header("Cache-Control", "no-store");
      return c.redirect("/admin", 302);
    });
  }
}
