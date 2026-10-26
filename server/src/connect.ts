// /connect/<kind>: the one page where the player pastes a mine's key. Server-rendered,
// same look as the access page. Keys go to KV and never come back out to the browser.

const esc = (s: string) => s.replace(/[&<>"']/g, (ch) => `&#${ch.charCodeAt(0)};`);

export function connectPage(o: { kind: "sentry" | "posthog"; repo: string | null; connected: boolean; webhookUrl: string; error?: string; saved?: boolean }): string {
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
  const body = o.saved
    ? `<p>✓ ${name} is plugged in${o.repo ? ` to <b>${esc(o.repo)}</b>` : ""}. ${o.kind === "sentry" ? "New errors will show up as biters on the folder they hit." : "Traffic drops and error spikes per route will show up as ore within a few minutes."}</p><a class="btn" href="${esc(back)}">Back to the factory</a>`
    : `${o.connected ? `<p class="ok">✓ ${name} already has a key. Paste a new one to replace it.</p>` : ""}${steps}
<form method="post" action="${esc(action)}">${o.error ? `<p class="err">${esc(o.error)}</p>` : ""}${fields}<button>Plug in ${name}</button></form>`;
  return shell(name, `<h1>Connect ${name}</h1>${body}<p><small>The key is stored server-side for this factory only and is never shown again.</small></p>`);
}

function shell(name: string, main: string): string {
  return `<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Connect ${name} · Shiptorio</title>
<link rel="preconnect" href="https://fonts.googleapis.com"><link href="https://fonts.googleapis.com/css2?family=Barlow:wght@400;500;600;700&family=JetBrains+Mono:wght@500&display=swap" rel="stylesheet">
<style>body{background:#12141a radial-gradient(ellipse at 50% 0%,#232a4a 0%,#12141a 70%) fixed;color:#ece7dc;font:16px/1.5 Barlow,system-ui,sans-serif;display:grid;place-items:center;min-height:100vh;margin:0}
main{box-sizing:border-box;width:min(460px,calc(100vw - 32px));margin:24px 0;padding:22px 20px;background:rgba(22,25,33,.92);border:1px solid rgba(255,255,255,.1);border-radius:16px;box-shadow:0 8px 24px rgba(0,0,0,.35)}
h1{margin:0 0 8px;font-size:24px;font-weight:600}h2{margin:22px 0 4px;font-size:18px;font-weight:600}ol{padding-left:20px;color:#9aa0ad}ol b{color:#ece7dc;font-weight:600}
code{font:500 13px 'JetBrains Mono',monospace;background:rgba(255,255,255,.06);padding:2px 6px;border-radius:6px;word-break:break-all;color:#ece7dc}
label{display:block;margin-top:14px;font-size:14px;font-weight:600;color:#9aa0ad}
input,select{box-sizing:border-box;width:100%;min-height:46px;padding:0 12px;margin-top:6px;font:inherit;color:#ece7dc;background:#12141a;border:1px solid rgba(255,255,255,.12);border-radius:10px}
input:focus,select:focus{outline:none;border-color:#7aa7d9}
button,.btn{box-sizing:border-box;display:block;width:100%;min-height:48px;margin-top:20px;padding:12px;border:0;border-radius:10px;background:#e3a33f;color:#12141a;font:600 16px Barlow,system-ui,sans-serif;text-align:center;text-decoration:none;cursor:pointer}
button:hover,.btn:hover{background:#eeb055}
.err{color:#e8685c}.ok{color:#6cc28c}small{color:#6b7180;font-size:13px;font-weight:400}</style>
<main>${main}</main></html>`;
}

/** /connect/support: the email inlet's private URL to forward to, and the Intercom keys. */
export function supportConnectPage(o: { repo: string; emailUrl: string; intercomUrl: string; intercom: boolean; canSend: boolean; emailSender: boolean; error?: string; saved?: boolean }): string {
  const back = `/?source=live&repo=${encodeURIComponent(o.repo)}`;
  return shell("support", `<h1>Connect support</h1>
<p>Customer emails and Intercom chats show up as mail at the support well. A reply is drafted for each one. <b>Nothing is ever sent until you tap Send.</b></p>
${o.saved ? `<p class="ok">✓ Saved. The support well is open on <b>${esc(o.repo)}</b>.</p>` : ""}
<h2>Email</h2>
<ol><li>Point your inbound-email service (Postmark inbound, Mailgun, anything that POSTs JSON with <code>from</code>, <code>subject</code>, <code>text</code>) at this private URL, or forward your support inbox through one:</li></ol>
<p><code>${esc(o.emailUrl)}</code></p>
<p><small>Treat this URL like a password. ${o.emailSender ? "Replies you send go out by email." : "No outgoing mail sender is set up yet, so replies you send land in the outbox for you to copy."}</small></p>
<h2>Intercom ${o.intercom ? '<span class="ok">✓</span>' : ""}</h2>
<ol><li>Intercom Developer Hub → your app → <b>Webhooks</b>. URL: <code>${esc(o.intercomUrl)}</code></li>
<li>Topics: <b>conversation.user.created</b> and <b>conversation.user.replied</b>.</li>
<li>Paste the app's client secret. To send replies into Intercom, also paste an access token and your admin id.</li></ol>
<form method="post" action="/connect/support?repo=${encodeURIComponent(o.repo)}">${o.error ? `<p class="err">${esc(o.error)}</p>` : ""}
<label>Client secret${o.intercom ? " <small>(set; paste to replace)</small>" : ""}<input name="intercomClientSecret" type="password" autocomplete="off"></label>
<label>Access token <small>(optional, to send replies${o.canSend ? "; set" : ""})</small><input name="intercomToken" type="password" autocomplete="off"></label>
<label>Admin id <small>(optional)</small><input name="intercomAdminId" inputmode="numeric" placeholder="1234567"></label>
<button>Save Intercom</button></form>
<a class="btn" href="${esc(back)}">Back to the factory</a>
<p><small>Keys are stored server-side for this factory only and are never shown again.</small></p>`);
}
