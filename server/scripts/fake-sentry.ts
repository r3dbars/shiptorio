// Posts a correctly signed fake Sentry webhook to the local Worker.
// bun run fake:sentry [issue.created|issue.resolved|error.created|event_alert.triggered] [issueId]
// bun run fake:sentry trends  prints the bottleneck signals a fake Sentry floor raises (no Worker needed).
import { fakeSentry } from "../src/sources/sentry";
import { fakeSentryFloor, sentrySignals } from "../src/signals/sentry";

const [event = "issue.created", issueId = "4501"] = process.argv.slice(2);
if (event === "trends") {
  for (const s of sentrySignals(fakeSentryFloor())) console.log(`${s.severity.toFixed(2)} ${s.kind.padEnd(14)} ${s.title}\n     ${s.evidence.map((e) => e.url).join(" ")}`);
  process.exit(0);
}
const secret = process.env.SENTRY_CLIENT_SECRET;
if (!secret) throw new Error("Set SENTRY_CLIENT_SECRET in server/.dev.vars (any fake value) and restart `bun run dev`.");
const body = JSON.stringify(fakeSentry(event, issueId));
const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
const signature = [...new Uint8Array(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(body)))].map((b) => b.toString(16).padStart(2, "0")).join("");
const res = await fetch(process.env.SHIPTORIO_URL ?? "http://localhost:8787/webhooks/sentry", {
  method: "POST",
  headers: { "content-type": "application/json", "sentry-hook-resource": event.split(".")[0], "sentry-hook-signature": signature, "request-id": crypto.randomUUID() },
  body,
});
console.log(res.status, await res.text());
