// /connect/<kind>: the one page where the player pastes a mine's key. Server-rendered,
// same look as the access page. Keys go to KV and never come back out to the browser.

const esc = (s: string) => s.replace(/[&<>"']/g, (ch) => `&#${ch.charCodeAt(0)};`);

export function connectPage(o: { kind: "sentry" | "posthog"; repo: string | null; connected: boolean; webhookUrl: string; error?: string; saved?: boolean; lastUsedAt?: number | null; revoked?: boolean }): string {
  const name = o.kind === "sentry" ? "Sentry" : "PostHog";
  // The browser defaults to the simulator unless live mode is explicit.
  const target = o.repo && /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(o.repo) ? o.repo : null;
  const back = target ? `/?source=live&repo=${encodeURIComponent(target)}` : "/";
  const action = `/connect/${o.kind}${o.repo ? `?repo=${encodeURIComponent(o.repo)}` : ""}`;
  const steps = o.kind === "sentry"
    ? `<ol><li>In Sentry: <b>Settings → Developer Settings → Custom Integrations → Create New Integration → Internal Integration</b>.</li>
<li>Webhook URL: <code>${esc(o.webhookUrl)}</code></li>
<li>Turn on <b>Alert Rule Action</b>. Under webhooks tick <b>issue</b> and <b>error</b>. Permissions: Issue &amp; Event <b>Read</b>.</li>
<li>Save, then copy the <b>Client Secret</b> here.</li></ol>`
    : `<ol><li>In PostHog: <b>Settings → Personal API keys → Create personal API key</b>.</li>
<li>Scopes: <b>Query: Read</b> and <b>Project: Read</b>. Nothing else.</li>
<li>Paste the key and your project id (the number in your PostHog URL).</li></ol>`;
  const fields = o.kind === "sentry"
    ? `<label>Client Secret<input name="clientSecret" type="password" autocomplete="off" required></label>`
    : `<label>Personal API key<input name="apiKey" type="password" autocomplete="off" placeholder="phx_…" required></label>
<label>Project id<input name="projectId" inputmode="numeric" placeholder="12345" required></label>
<label>Region<select name="host"><option value="us">US cloud</option><option value="eu">EU cloud</option></select></label>
<label>Key event <small>(optional, default $pageview)</small><input name="keyEvent" placeholder="$pageview"></label>`;
  const status = o.connected ? `<p class="ok">✓ Connected</p><p>Last used: ${o.lastUsedAt ? esc(new Date(o.lastUsedAt).toISOString()) : "Not used yet"}</p>
<form method="post" action="${esc(action)}"><button name="action" value="revoke">Revoke</button></form>` : o.revoked ? `<p>Connection revoked. Shiptorio will no longer use this key. To invalidate the key everywhere, also revoke it in ${name}.</p>` : "";
  const body = o.saved
    ? `<p>✓ ${name} is plugged in${o.repo ? ` to <b>${esc(o.repo)}</b>` : ""}. ${o.kind === "sentry" ? "New errors will show up as biters on the folder they hit." : "Traffic drops and error spikes per route will show up as ore within a few minutes."}</p><a class="btn" href="${esc(back)}">Back to the factory</a>`
    : `${o.connected ? `<p class="ok">✓ ${name} already has a key. Rotate your connection by pasting a replacement key below. Revoke the old key in the provider after saving.</p>` : ""}${steps}
<form method="post" action="${esc(action)}">${o.error ? `<p class="err">${esc(o.error)}</p>` : ""}${fields}<button>${o.connected ? "Rotate key" : `Plug in ${name}`}</button></form>`;
  return `<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Connect ${name} · Shiptorio</title>
<link rel="preconnect" href="https://fonts.googleapis.com"><link href="https://fonts.googleapis.com/css2?family=Barlow:wght@400;500;600;700&family=JetBrains+Mono:wght@500&display=swap" rel="stylesheet">
<style>body{background:#12141a radial-gradient(ellipse at 50% 0%,#232a4a 0%,#12141a 70%) fixed;color:#ece7dc;font:16px/1.5 Barlow,system-ui,sans-serif;display:grid;place-items:center;min-height:100vh;margin:0}
main{box-sizing:border-box;width:min(460px,calc(100vw - 32px));margin:24px 0;padding:22px 20px;background:rgba(22,25,33,.92);border:1px solid rgba(255,255,255,.1);border-radius:16px;box-shadow:0 8px 24px rgba(0,0,0,.35)}
h1{margin:0 0 8px;font-size:24px;font-weight:600}ol{padding-left:20px;color:#9aa0ad}ol b{color:#ece7dc;font-weight:600}
code{font:500 13px 'JetBrains Mono',monospace;background:rgba(255,255,255,.06);padding:2px 6px;border-radius:6px;word-break:break-all;color:#ece7dc}
label{display:block;margin-top:14px;font-size:14px;font-weight:600;color:#9aa0ad}
input,select{box-sizing:border-box;width:100%;min-height:46px;padding:0 12px;margin-top:6px;font:inherit;color:#ece7dc;background:#12141a;border:1px solid rgba(255,255,255,.12);border-radius:10px}
input:focus,select:focus{outline:none;border-color:#7aa7d9}
button,.btn{box-sizing:border-box;display:block;width:100%;min-height:48px;margin-top:20px;padding:12px;border:0;border-radius:10px;background:#e3a33f;color:#12141a;font:600 16px Barlow,system-ui,sans-serif;text-align:center;text-decoration:none;cursor:pointer}
button:hover,.btn:hover{background:#eeb055}
.err{color:#e8685c}.ok{color:#6cc28c}small{color:#6b7180;font-size:13px;font-weight:400}</style>
<main><h1>Connect ${name}</h1>${status}${body}<p><small>The key is stored server-side for this factory only and is never shown again.</small></p></main></html>`;
}
