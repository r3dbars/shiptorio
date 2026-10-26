// /connect/<kind>: the one page where the player pastes a mine's key. Server-rendered,
// same look as the access page. Keys go to KV and never come back out to the browser.

const esc = (s: string) => s.replace(/[&<>"']/g, (ch) => `&#${ch.charCodeAt(0)};`);

export function connectPage(o: { kind: "sentry" | "posthog"; repo: string | null; connected: boolean; webhookUrl: string; error?: string; saved?: boolean }): string {
  const name = o.kind === "sentry" ? "Sentry" : "PostHog";
  const back = o.repo ? `/?repo=${encodeURIComponent(o.repo)}` : "/";
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
  const body = o.saved
    ? `<p>✓ ${name} is plugged in${o.repo ? ` to <b>${esc(o.repo)}</b>` : ""}. ${o.kind === "sentry" ? "New errors will show up as biters on the folder they hit." : "Traffic drops and error spikes per route will show up as ore within a few minutes."}</p><a class="btn" href="${esc(back)}">Back to the factory</a>`
    : `${o.connected ? `<p class="ok">✓ ${name} already has a key. Paste a new one to replace it.</p>` : ""}${steps}
<form method="post" action="${esc(action)}">${o.error ? `<p class="err">${esc(o.error)}</p>` : ""}${fields}<button>Plug in ${name}</button></form>`;
  return `<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Connect ${name} · Shiptorio</title>
<style>body{background:#1b2448;color:#e6e1d6;font:16px system-ui;display:grid;place-items:center;min-height:95vh;margin:0}main{max-width:440px;padding:24px 16px}
h1{font-size:24px}ol{padding-left:20px;line-height:1.6}code{background:#0f1530;padding:2px 6px;border-radius:4px;word-break:break-all}
label{display:block;margin-top:14px;font-size:14px}input,select,button,.btn{box-sizing:border-box;width:100%;padding:12px;margin-top:6px;font:inherit;border-radius:8px;border:0}
button,.btn{background:#f2a93b;color:#1b2448;cursor:pointer;margin-top:20px;display:block;text-align:center;text-decoration:none;font-weight:600}
.err{color:#ff9d9d}.ok{color:#8fe3a8}small{opacity:.7}</style>
<main><h1>Connect ${name}</h1>${body}<p><small>The key is stored server-side for this factory only and is never shown again.</small></p></main></html>`;
}
