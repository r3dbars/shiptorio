import { Hono } from "hono";
import type { Env } from "./index";
import { FLAG_DEFAULTS, flagKey, flagName, readFlags } from "./flags";
import { currentUser } from "./accounts";

export const ops = new Hono<{ Bindings: Env; Variables: { admin: string } }>();
const escape = (s: string) => s.replace(/[&<>"']/g, c => `&#${c.charCodeAt(0)};`);

// No preview cookie needed: public response contains only coarse dependency status.
ops.get("/api/health", async c => {
  const check = async (run: () => Promise<unknown>) => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      await Promise.race([run(), new Promise((_, reject) => { timer = setTimeout(() => reject(new Error("timeout")), 3000); })]);
      return "ok";
    } catch { return "error"; } finally { if (timer !== undefined) clearTimeout(timer); }
  };
  const [d1, kv, durableObject] = await Promise.all([
    check(() => c.env.DB.prepare("SELECT 1").first()),
    check(() => c.env.CACHE.get("ops:health")),
    check(async () => {
      const stub = c.env.FACTORY.get(c.env.FACTORY.idFromName("ops-health"));
      if (!(await stub.health()).ok) throw new Error("DO unavailable");
    }),
  ]);
  const ok = [d1, kv, durableObject].every(s => s === "ok");
  c.header("Cache-Control", "no-store");
  return c.json({ ok, checks: { d1, kv, durableObject } }, ok ? 200 : 503);
});
ops.get("/api/flags", async c => {
  const user = await currentUser(c.env, c.req.header("cookie") ?? null, new URL(c.req.url));
  return c.json(await readFlags(c.env, user?.login));
});
for (const path of ["/admin/flags", "/api/admin/*"]) ops.use(path, async (c, next) => {
  const user = await currentUser(c.env, c.req.header("cookie") ?? null, new URL(c.req.url));
  const login = user?.login;
  if (!login || !(c.env.ADMIN_LOGINS ?? "").split(",").some(admin => admin.trim().toLowerCase() === login.toLowerCase())) return c.json({ error: "admin login required" }, 403);
  c.set("admin", login);
  await next();
});
ops.get("/admin/flags", async c => {
  const flags = await readFlags(c.env);
  const rows = Object.entries(flags).map(([name, enabled]) => `<tr><td>${name}</td><td>${enabled}</td><td><form method="post" action="/api/admin/flags"><input type="hidden" name="name" value="${name}"><input name="user" aria-label="GitHub login" placeholder="Global (or GitHub login)"><select name="value"><option>true</option><option>false</option><option>inherit</option></select><button>Save</button></form></td></tr>`).join("");
  c.header("Content-Security-Policy", "default-src 'none'; style-src 'unsafe-inline'; form-action 'self'; frame-ancestors 'none'; base-uri 'none'");
  return c.html(`<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>Shiptorio flags</title><style>body{font:16px system-ui;max-width:1000px;margin:40px auto;padding:16px}td{padding:12px}input,select,button{padding:8px}</style><p><a href="/admin">Diagnostics</a></p><h1>Feature flags</h1><p>Admin: ${escape(c.get("admin"))}. Global false overrides every user. KV changes may take 60 seconds to reach all locations. Reload the app after toggling.</p><table><tr><th>Feature</th><th>Global effective</th><th>Override</th></tr>${rows}</table><p>Intro: welcome tour. Research: new purchases and suggestions (existing checks stay active). Permits: grants, suggestions and automatic launches. New features: default-off opt-in for future consumers.</p></html>`);
});
ops.get("/api/admin/flags", async c => {
  const user = c.req.query("user");
  if (user && !/^[a-zA-Z0-9-]{1,39}$/.test(user)) return c.json({ error: "invalid user" }, 400);
  const overrides = Object.fromEntries(await Promise.all(Object.keys(FLAG_DEFAULTS).map(async name => [name, await c.env.CACHE.get(flagKey(name as keyof typeof FLAG_DEFAULTS, user))])));
  return c.json({ user: user ?? null, overrides, effective: await readFlags(c.env, user) });
});
ops.post("/api/admin/flags", async c => {
  if (c.req.header("origin") !== new URL(c.req.url).origin) return c.json({ error: "invalid origin" }, 403);
  const raw = await c.req.text();
  if (raw.length > 1024) return c.json({ error: "too large" }, 413);
  const form = new URLSearchParams(raw);
  const name = form.get("name") ?? "", value = form.get("value"), user = form.get("user")?.trim().toLowerCase() || undefined;
  if (!flagName(name) || !["true", "false", "inherit"].includes(value ?? "") || (user && !/^[a-z0-9-]{1,39}$/.test(user))) return c.json({ error: "invalid flag override" }, 400);
  if (value === "inherit") await c.env.CACHE.delete(flagKey(name, user));
  else await c.env.CACHE.put(flagKey(name, user), value!);
  console.info(JSON.stringify({ event: "flag_changed", actor: c.get("admin"), flag: name, user: user ?? "global", value }));
  return c.redirect("/admin/flags", 303);
});
