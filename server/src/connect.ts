import { ironPage } from "./ironPage";
// /connect/<kind>: the one page where the player pastes a mine's key. Server-rendered,
// Black Iron plate (ironPage.ts), same look as the access page. Keys are encrypted in D1 and never come back out to the browser.

const esc = (s: string) => s.replace(/[&<>"']/g, (ch) => `&#${ch.charCodeAt(0)};`);

export function connectPage(o: { kind: "sentry" | "posthog"; repo: string | null; connected: boolean; webhookUrl: string; error?: string; saved?: boolean; lastUsedAt?: number | null; revoked?: boolean; workerOverride?: boolean }): string {
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
  const status = o.connected ? `<p class="ok-lamp">Connected</p><p>Last used: ${o.lastUsedAt ? esc(new Date(o.lastUsedAt).toISOString()) : "Not used yet"}</p>
<form method="post" action="${esc(action)}"><button class="danger" name="action" value="revoke">Revoke</button></form>` : o.revoked ? `<p class="ok-lamp idle">Revoked</p><p>Connection revoked. Shiptorio will no longer use this key. To invalidate the key everywhere, also revoke it in ${name}.</p>` : "";
  const body = o.saved
    ? `<p class="ok-lamp">Plugged in</p><p>${name} is plugged in${o.repo ? ` to <b>${esc(o.repo)}</b>` : ""}. ${o.kind === "sentry" ? "New errors will show up as biters on the folder they hit." : "Traffic drops and error spikes per route will show up as ore within a few minutes."}</p><a class="btn" href="${esc(back)}">Back to the factory</a>`
    : o.workerOverride ? `<p>This factory uses an operator-managed key. Ask the operator to rotate it; Revoke stops Shiptorio from using it here.</p>`
    : `${o.connected ? `<p>${name} already has a key. Rotate your connection by pasting a replacement key below. Revoke the old key in the provider after saving.</p>` : ""}${steps}
<form method="post" action="${esc(action)}">${o.error ? `<p class="err">${esc(o.error)}</p>` : ""}${fields}<button>${o.connected ? "Rotate key" : `Plug in ${name}`}</button></form>`;
  return shell(name, `<h1>Connect ${name}</h1>${status}${body}<p class="note"><small>The key is stored server-side for this factory only and is never shown again.</small></p>`);
}

function shell(name: string, main: string): string {
  return ironPage({ title: `Connect ${name}`, eyebrow: "Mines · connect", body: main });
}

/** /connect/support: the email inlet's private URL to forward to, and the Intercom keys. */
export function supportConnectPage(o: { repo: string; emailUrl: string; intercomUrl: string; intercom: boolean; canSend: boolean; emailSender: boolean; error?: string; saved?: boolean }): string {
  const back = `/?source=live&repo=${encodeURIComponent(o.repo)}`;
  return shell("support", `<h1>Connect support</h1>
<p>Customer emails and Intercom chats show up as mail at the support well. A reply is drafted for each one. <b>Nothing is ever sent until you tap Send.</b></p>
${o.saved ? `<p class="ok-lamp">Saved</p><p>The support well is open on <b>${esc(o.repo)}</b>.</p>` : ""}
<h2>Email</h2>
<ol><li>Point your inbound-email service (Postmark inbound, Mailgun, anything that POSTs JSON with <code>from</code>, <code>subject</code>, <code>text</code>) at this private URL, or forward your support inbox through one:</li></ol>
<p><code>${esc(o.emailUrl)}</code></p>
<p><small>Treat this URL like a password. ${o.emailSender ? "Replies you send go out by email." : "No outgoing mail sender is set up yet, so replies you send land in the outbox for you to copy."}</small></p>
<h2>Intercom${o.intercom ? ' <span class="ok">· connected</span>' : ""}</h2>
<ol><li>Intercom Developer Hub → your app → <b>Webhooks</b>. URL: <code>${esc(o.intercomUrl)}</code></li>
<li>Topics: <b>conversation.user.created</b> and <b>conversation.user.replied</b>.</li>
<li>Paste the app's client secret. To send replies into Intercom, also paste an access token and your admin id.</li></ol>
<form method="post" action="/connect/support?repo=${encodeURIComponent(o.repo)}">${o.error ? `<p class="err">${esc(o.error)}</p>` : ""}
<label>Client secret${o.intercom ? " <small>(set; paste to replace)</small>" : ""}<input name="intercomClientSecret" type="password" autocomplete="off"></label>
<label>Access token <small>(optional, to send replies${o.canSend ? "; set" : ""})</small><input name="intercomToken" type="password" autocomplete="off"></label>
<label>Admin id <small>(optional)</small><input name="intercomAdminId" inputmode="numeric" placeholder="1234567"></label>
<button>Save Intercom</button></form>
<a class="btn ghost" href="${esc(back)}">Back to the factory</a>
<p class="note"><small>Keys are stored server-side for this factory only and are never shown again.</small></p>`);
}
