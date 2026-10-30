// Mints a short-lived owner pass for scripts/e2e/real-loop.ts on a machine that holds server/.dev.vars, so the
// driver can sign in somewhere that never sees the secrets (a cloud container, CI). Plain Node, no installs.
//
//   node scripts/e2e/owner-pass.mjs [login]   prints {"access":"shiptorio_access=…","login":"r3dbars","at":…,"proof":"…"}
//
// shiptorio.dev (staging) has its own secrets: SECRETS=~/.config/shiptorio/staging.env (docs/context/ops.md).
// server/.dev.vars is the default and only matches the worker it was made for.
// Never prints SESSION_SECRET or APP_PASSWORD. The proof works once within 60s (server/src/auth.ts ownerSession);
// the access cookie only opens the preview password gate and expires in 6 hours.
import { createHmac } from "node:crypto";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const file = process.env.SECRETS || join(dirname(fileURLToPath(import.meta.url)), "../../server/.dev.vars");
const vars = Object.fromEntries(readFileSync(file, "utf8").split("\n").map(line => line.match(/^([A-Z_]+)=(.*)$/)).filter(Boolean).map(m => [m[1], m[2].replace(/^"|"$/g, "")]));
if (!vars.SESSION_SECRET || !vars.APP_PASSWORD) throw new Error(`${file} needs SESSION_SECRET and APP_PASSWORD`);
const sign = (secret, data) => createHmac("sha256", secret).update(data).digest("base64url");
const login = (process.argv[2] || "r3dbars").toLowerCase();
const at = Date.now();
// Same shape as makeSessionCookie(`${SESSION_SECRET}:${APP_PASSWORD}`, "preview") in server/src/session.ts.
const payload = Buffer.from(JSON.stringify({ login: "preview", exp: Math.floor(at / 1000) + 6 * 3600 })).toString("base64");
const access = `shiptorio_access=${payload}.${sign(`${vars.SESSION_SECRET}:${vars.APP_PASSWORD}`, payload)}`;
console.log(JSON.stringify({ access, login, at, proof: sign(vars.SESSION_SECRET, `owner-session.${login}.${at}`) }));
