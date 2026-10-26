// No secrets printed. Works against local workerd or the deployed private preview.
import { readFileSync } from "node:fs";
import { makeSessionCookie } from "../src/session";

const base = process.env.SMOKE_URL || "http://localhost:8787";
const url = new URL(base);
if (!["localhost", "127.0.0.1", "shiptorio.com", "shiptorio.dev"].includes(url.hostname)) throw new Error("Unsupported smoke target");
const credentials = JSON.parse(readFileSync(new URL("../.env.deploy-secrets", import.meta.url), "utf8"));
let count = 0;
const check = (ok: unknown, text: string) => { if (!ok) throw new Error(text); count++; console.log(`PASS ${text}`); };
let response = await fetch(base);
check(response.status === 401 && (await response.text()).includes('aria-label="Password"'), "anonymous visitor receives password gate");
response = await fetch(base + "/api/setup/status");
check(response.status === 401, "anonymous API is protected");
response = await fetch(base + "/access", { method: "POST", headers: { origin: url.origin }, body: new URLSearchParams({ password: credentials.APP_PASSWORD }), redirect: "manual" });
check(response.status === 303, "password grants access");
const accessCookie = response.headers.get("set-cookie")!.split(";")[0];
response = await fetch(base, { headers: { cookie: accessCookie } });
const html = await response.text();
check(response.status === 200 && html.includes("/assets/"), "authenticated player receives game");
const asset = html.match(/src="([^"]+\.js)"/)![1];
check((await fetch(base + asset)).status === 401, "game asset cannot bypass password gate");
check((await fetch(base + asset, { headers: { cookie: accessCookie } })).status === 200, "authenticated game assets load");
response = await fetch(base + "/api/setup/status", { headers: { cookie: accessCookie } });
const status = await response.json() as { github: boolean; spark: boolean };
check(response.status === 200 && typeof status.github === "boolean" && typeof status.spark === "boolean", "setup readiness reports configuration without credentials");
response = await fetch(base + "/webhooks/github", { method: "POST", body: "{}" });
check(response.status === 401, "webhook requires its own GitHub signature");
const sessionCookie = (await makeSessionCookie(credentials.SESSION_SECRET, "r3dbars")).split(";")[0];
const cookie = `${accessCookie}; ${sessionCookie}`;
response = await fetch(base + "/api/repos/r3dbars/shiptorio/factory", { headers: { cookie, origin: "https://attacker.example" } });
check(response.status === 403, "cross-origin factory access is rejected");
if (!status.github) {
  await new Promise<void>((resolve, reject) => {
    const ws = new WebSocket(base.replace(/^http/, "ws") + "/api/repos/r3dbars/shiptorio/factory", { headers: { cookie, origin: url.origin } });
    const timer = setTimeout(() => { ws.close(); reject(new Error("Factory socket timeout")); }, 10000);
    ws.onmessage = (e) => {
      try { check(JSON.parse(String(e.data)).type === "log", "real Factory Durable Object websocket responds"); clearTimeout(timer); ws.close(); resolve(); } catch (e) { clearTimeout(timer); ws.close(); reject(e); }
    };
    ws.onerror = () => { clearTimeout(timer); reject(new Error("Factory socket failed")); };
  });
}
console.log(`${count} checks passed. GitHub App: ${status.github ? "configured" : "pending setup"}; Spark: ${status.spark ? "configured" : "pending key"}.`);
