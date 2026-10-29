import { configuredAdmin } from "./admin-policy";
import { budgetReport } from "./budget";
import { log } from "./telemetry";
import { Hono } from "hono";
import type { Env } from "./index";
import { FLAG_DEFAULTS, flagKey, flagName, readFlags } from "./flags";
import { currentUser } from "./accounts";
import { ironPage } from "./ironPage";

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
  if (!login || !configuredAdmin(c.env, login)) return c.json({ error: "admin login required" }, 403);
  c.set("admin", login);
  await next();
});
ops.get("/admin/flags", async c => {
  const flags = await readFlags(c.env);
  const rows = Object.entries(flags).map(([name, enabled]) => `<article><h2>${name}</h2><p>Enabled: ${enabled}</p><form method="post" action="/api/admin/flags"><input type="hidden" name="name" value="${name}"><label>GitHub login (leave blank for everyone)<input name="user" aria-label="GitHub login"></label><label>Setting<select name="value" aria-label="Override value"><option>true</option><option>false</option><option>inherit</option></select></label><button>Save</button></form></article>`).join("");
  c.header("Content-Security-Policy", "default-src 'none'; style-src 'unsafe-inline'; form-action 'self'; frame-ancestors 'none'; base-uri 'none'");
  // This route's CSP is `default-src 'none'`: no web fonts, the plate falls back to monospace.
  return c.html(ironPage({ title: "Kill switches", eyebrow: "Internal", fonts: false, home: "/admin", head: '<style>form{display:grid;gap:12px}article{padding:12px 0;border-top:1px solid #594128}input,select{box-sizing:border-box;max-width:100%}</style>', body: `<h1>Kill switches</h1><p>Admin: ${escape(c.get("admin"))}. A global false overrides every player. Changes can take 60 seconds; reload the app afterward.</p>${rows}` }));

});
ops.get("/api/admin/budget", async c => c.json(await budgetReport(c.env)));
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
  log("info", "flag.changed", { actor: c.get("admin"), flag: name, user: user ?? "global", value });
  return c.redirect("/admin/flags", 303);
});
