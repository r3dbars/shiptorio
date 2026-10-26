// Posts fake customer mail to the local Worker's support mine.
// bun run fake:support [bug|feature|question|reply|intercom|intercom-reply] [owner/repo]
// Needs SUPPORT_INBOUND_TOKEN (40 hex chars) and, for Intercom, INTERCOM_CLIENT_SECRET in server/.dev.vars.
import { fakeEmail, fakeIntercom } from "../src/sources/support";

const [kind = "bug", repo = "r3dbars/shiptorio"] = process.argv.slice(2);
const base = process.env.SHIPTORIO_URL ?? "http://localhost:8787";
let res: Response;
if (kind.startsWith("intercom")) {
  const secret = process.env.INTERCOM_CLIENT_SECRET;
  if (!secret) throw new Error("Set INTERCOM_CLIENT_SECRET in server/.dev.vars (any fake value, 16+ chars) and restart `bun run dev`.");
  const body = JSON.stringify(fakeIntercom(kind === "intercom-reply" ? "conversation.user.replied" : "conversation.user.created"));
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-1" }, false, ["sign"]);
  const sig = [...new Uint8Array(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(body)))].map((b) => b.toString(16).padStart(2, "0")).join("");
  res = await fetch(`${base}/webhooks/intercom/${repo}`, { method: "POST", headers: { "content-type": "application/json", "x-hub-signature": `sha1=${sig}` }, body });
} else {
  const token = process.env.SUPPORT_INBOUND_TOKEN;
  if (!token || !/^[0-9a-f]{40}$/.test(token)) throw new Error("Set SUPPORT_INBOUND_TOKEN to 40 hex chars in server/.dev.vars (openssl rand -hex 20) and restart `bun run dev`.");
  res = await fetch(`${base}/webhooks/support/${repo}/${token}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(fakeEmail(kind as "bug")) });
}
console.log(res.status, await res.text());
