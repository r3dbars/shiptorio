---
title: Self-host Shiptorio
description: Run your own factory on Cloudflare with your Meta Muse Spark key, your GitHub App, and your local agents.
section: Start here
order: 5
---
# Self-host Shiptorio

<p class="lede">Your Cloudflare account. Your API keys. Your factory.</p>

Shiptorio runs as one Cloudflare Worker with static assets, a SQLite Durable Object per repo, a D1 database and a KV namespace. Meta Muse Spark makes factory decisions using **your Meta API key**. Your local Codex or Muse Code subscription builds the changes through the [runner](/docs/runner).

## Before you start

You need Git, [Bun](https://bun.sh/), a Cloudflare account with a workers.dev subdomain, a GitHub account that can create a GitHub App, and a Meta API key with access to Muse Spark. Wrangler is installed with the project. Cloudflare and Meta usage are billed to your own accounts; subscription sign-ins stay on your machine.

In Cloudflare, open **Workers & Pages → Overview** to find your account ID and workers.dev subdomain. If you haven't chosen a subdomain yet, set one up there first.

## Run the setup wizard

```sh
git clone https://github.com/r3dbars/shiptorio.git
cd shiptorio
bun install --frozen-lockfile
bun x wrangler login
bun run selfhost
```

The wizard asks for your Cloudflare account ID, workers.dev subdomain, GitHub login and a Worker name. The default is **shiptorio-selfhost**; names must be `shiptorio` or `shiptorio-<suffix>`. Choose a fresh name if that Worker already hosts something you want to keep.

After showing the exact target and asking you to type its name, it:

1. Creates a dedicated D1 database and KV namespace through Wrangler. You can supply existing dedicated resource IDs instead.
2. Applies the D1 migrations remotely.
3. Generates a session signing secret and a credential encryption key, then uploads them directly to Worker secrets.
4. Prompts through Wrangler's masked input for a preview password and your **META_API_KEY**.
5. Builds and deploys the app to your workers.dev URL so you can create your own GitHub App.
6. Walks you through uploading all five GitHub App secrets, deploys again, and prints your URL.

Keep your preview password in your password manager. The wizard saves **resource IDs and completed secret names**, never secret values. Its generated signing and encryption keys go directly to Cloudflare and cannot be read back. Preserve the deployed Worker when updating or moving your clone; recreating it with a new encryption key makes existing saved mine credentials unreadable, so those integrations would need reconnecting.

> **Heads up** This flow uses an ignored `server/wrangler.selfhost.json`, independent of the repository's production config. It doesn't attach shiptorio.com, change DNS, or inherit the project's resource IDs, allowlist or mine repo settings. Every Wrangler operation uses that explicit config and your chosen account. The Workers `transcripted-feedback`, `stack99-relay`, `r3dbar-subscribe` and `redbars` are never targets.

## Create your GitHub App

During setup the wizard prints a URL like `https://shiptorio-selfhost.your-subdomain.workers.dev/setup`.

1. Open it and enter the preview password you just chose.
2. Create a GitHub App using the prefilled manifest. Give it a unique name, such as `Shiptorio YourName`.
3. Keep the callback page open: its credentials appear **once**. Save the complete private key block, including its BEGIN and END lines, to a private `.pem` file outside the clone.
4. Return to the terminal. Paste the Client ID, Client Secret, webhook secret and App ID when asked; give the wizard the PEM file path for the private key. The wizard supplies the correct Wrangler config. **Do not run the callback page's generic `wrangler secret put` commands**, which target whichever config your current directory selects.
5. Install your new App on **only the repositories you choose**. See [GitHub App permissions](/docs/github-app).

The five uploaded secrets are `GITHUB_CLIENT_ID`, `GITHUB_CLIENT_SECRET`, `GITHUB_WEBHOOK_SECRET`, `GITHUB_APP_PRIVATE_KEY` and `GITHUB_APP_ID`. The App ID is uploaded last so an interrupted setup can still use the setup page. During this first install, the generated config explicitly enables setup for a browser that has unlocked the owner's preview password; a GitHub login cannot exist yet. After successful upload, `/setup` closes itself and the wizard disables that bootstrap setting. Ordinary installations retain their GitHub-login requirement.

For an existing App, match these settings to the workers.dev origin printed by the wizard:

| Setting | Path on your origin |
| --- | --- |
| Homepage | `/` |
| User authorization callback | `/auth/callback` |
| Webhook | `/webhooks/github` |
| Setup after installation | `/github/installed` |

Its permissions and event subscriptions must match the [GitHub App guide](/docs/github-app). Its webhook secret must match the value you upload.

## Start your factory

Open the printed **Sign in** URL, sign in with your allowlisted GitHub account, pick an installed repo, and [connect your runner](/docs/runner). Use the preview password when prompted. Shippy plans; your local agent builds; [Checks and Review](/docs/the-line) check the result.

Only the GitHub login you supplied is initially allowed in, and it is also the administrator. To invite others, edit `ALLOWED_LOGINS` in the generated config as a comma-separated list and deploy with the explicit config command below. Changes made directly to that config are overwritten the next time you run the wizard; keep the admin login restricted. The hosted service's waitlist gate is not enabled.

Sentry and PostHog are optional extra sources of work and aren't part of the deck yet. The generated credential encryption key lets those integrations store their keys encrypted. No production telemetry credentials or mine settings are copied into your deployment.

## Update, resume and recover

Run `bun run selfhost` again from the same clone. It reads `server/.selfhost/state.json`, reuses your IDs and uploaded secrets, reapplies pending migrations, rebuilds and deploys. It does **not** rotate keys or ask for completed secrets again. Keep the ignored config and progress directory when updating the clone.

If a command fails, fix the reported Wrangler authentication, permission or billing problem and rerun. A resource created just before an interruption can exist without its ID being saved. Find that resource in the Cloudflare dashboard and put its ID in `databaseId` or `namespaceId` in `server/.selfhost/state.json` before resuming. Use only resources dedicated to this factory. Don't delete the progress file to fix an upload failure.

To update a secret deliberately, run from the clone root:

```sh
bun x wrangler secret put META_API_KEY --config server/wrangler.selfhost.json --env ""
```

For advanced config changes or a custom domain, edit your self-host config and deploy explicitly. Update `PUBLIC_URL` and your GitHub App URLs together when changing origins:

```sh
bun run build
bun x wrangler d1 migrations apply DB --remote --config server/wrangler.selfhost.json --env ""
bun x wrangler deploy --config server/wrangler.selfhost.json --env ""
```

The repository's generic `bun run deploy` and production Deploy workflow use the maintainers' config. Use the self-host commands for your own installation. Forks should leave the `DEPLOY_ENABLED` repository variable disabled unless they have replaced that deployment configuration.

## Try it without a Cloudflare account

```sh
bun run selfhost --dry-run
```

This noninteractive path builds the complete app and runner, generates a separate offline config with placeholder IDs, applies all D1 migrations **locally**, and runs **`wrangler deploy --dry-run`**. It doesn't prompt for secrets, log in, create remote resources, or deploy. CI repeats this from a clean clone with no Cloudflare secrets.

A passing dry run proves migrations and packaging. Live Cloudflare provisioning, GitHub callbacks, API-key validity and an issue-to-PR run need a real installation to verify. For local play, see [Getting started](/docs/getting-started).

### Administrator and legacy enrollment

Diagnostics and quota exemptions require an explicit `ADMIN_LOGINS` entry; an absent, empty or wildcard value grants no administrator role. Portable migrations do not enroll the hosted service owner. Production enrollment is a separate operation used only by the hosted `shiptorio` deployment.

When updating an older self-host installation with another owner, rerun the wizard to quarantine the exact legacy migration-created maintainer grant. Other approvals are preserved. If you intentionally approved that account with the same legacy grant values, approve it again through your own admin settings after reconciliation. The preview password remains enabled.

## Administrator testing and support

The wizard's `ADMIN_LOGINS` owner can open `/admin` directly. No maintainer
account is implied, and `*` never means administrator. View another installed
factory as a player in read-only mode, then explicitly enable write mode if needed.
Actions appear in the audit log. You can adjust progress/autonomy and daily limits,
skip scheduling waits, or pause new Shippy calls and runner handout for one factory
or the whole installation. Limits include usage already spent; zero stops new work.
Factory reset requires confirmation and refuses active builds/open PR work.
Verification still applies to administrator work. The deck's Gate requires the player to hold Ship it.
The preview password remains enabled.

### Sample-save retention

The generated Worker configuration includes a daily scheduled cleanup for anonymous sample
saves. Guests still need the preview password while it is enabled. Guest saves expire after
30 days without activity; they cannot access repositories, integrations or local agents.
