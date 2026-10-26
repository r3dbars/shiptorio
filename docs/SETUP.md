# Going live

Local dev needs none of this. See the README. Commands run from the repo root unless noted.

Already done: the `shiptorio` D1 database (schema applied) and the `shiptorio-cache`
KV namespace exist on the Cloudflare account, and their ids are in `server/wrangler.jsonc`.

## 1. Deploy the Worker

The entire site, including static assets and setup, requires `APP_PASSWORD` and
`SESSION_SECRET`. Without them, production fails closed with a 503. GitHub's webhook
is exempt from the preview password and requires its separate signing secret.
Set both preview secrets with `wrangler secret bulk <local-json-file>` from `server/`.
Never commit that file. Changing the preview password invalidates existing preview cookies.
Both `shiptorio.com` and `shiptorio.dev` are custom domains for the same Worker.

Pick one.

**From your machine:**

```sh
bun install
bunx wrangler login
bun run deploy
```

**From GitHub Actions:** add the repo secrets `CLOUDFLARE_API_TOKEN` (needs Workers
Scripts + D1 edit) and `CLOUDFLARE_ACCOUNT_ID`, then set the repo variable
`DEPLOY_ENABLED=true`. Every push to `main` then migrates D1 and deploys. You can also
run the Deploy workflow by hand.

The Deploy workflow independently repeats type checks and tests before deploying.
It serializes production deployments. CI cancels superseded runs on the same branch.
Keep `DEPLOY_ENABLED` off until the restricted Cloudflare deployment token and account id
are configured in GitHub. Local Wrangler OAuth authentication is separate from those
GitHub Actions credentials; do not copy the local OAuth token into GitHub.

Our iteration loop is local tests → branch push → PR CI → human merge → Deploy workflow
→ deployed URL smoke check. A merged PR is not a deployment until the workflow succeeds.
Small complete checkpoints are a better merge unit than individual edits. Record the
deployed commit/version so a direct local deployment can be reconciled with main.

Wrangler prints the URL, something like `https://shiptorio.<your-subdomain>.workers.dev`.
This only creates the `shiptorio` Worker. No other Worker is touched.

## 2. Create the GitHub App

1. Open `<your URL>/setup` and hit **Create GitHub App**. GitHub pre-fills everything:
   write access to contents, pull requests and issues (to push `shiptorio/*` branches,
   open PRs and post issue-status comments), read access to checks and metadata, plus
   `issues`, `issue_comment`, `pull_request`, `pull_request_review`, `check_run`,
   `check_suite` and `push` webhooks pointed at `/webhooks/github`. GitHub automatically
   delivers `installation` and `installation_repositories`; they aren't selectable subscriptions.
2. GitHub sends you back to `/setup/callback`, which shows each secret once. From `server/`, run the
   `npx wrangler secret put …` command next to each value.
3. Also set a session secret: `openssl rand -hex 32 | npx wrangler secret put SESSION_SECRET`,
   and the Spark key: `npx wrangler secret put META_API_KEY`.
4. Install the app on the repos you want mapped (the callback page links to it).

Once `GITHUB_APP_ID` is set, `/setup` turns itself off.

`/api/setup/status` reports whether GitHub and Spark are configured after preview login;
it never returns credential values. To verify the private preview in actual workerd, run
`bun server/scripts/smoke-preview.ts` from the root while Wrangler is on port 8787.
The script reads a gitignored `server/.env.deploy-secrets` JSON containing the preview
password/session secret. `SMOKE_URL=https://shiptorio.com` runs the same checks remotely.
The simulator is for UI play; it does not prove the issue-to-real-PR path.

The App's callback URLs come from the URL you open `/setup` on. If you move to a custom
domain later, set the `PUBLIC_URL` var and update the App's URLs on GitHub.

### Justin does — Phase A GitHub mine

1. Open `https://shiptorio.com/setup`, enter the preview password if asked, and sign in to GitHub.
2. Create the private App. On its callback, copy the one-time values into the corresponding
   `wrangler secret put` commands **from `server/`**: `GITHUB_APP_ID`, `GITHUB_CLIENT_ID`,
   `GITHUB_CLIENT_SECRET`, `GITHUB_WEBHOOK_SECRET`, `GITHUB_APP_PRIVATE_KEY`.
   Copy the same values into gitignored `server/.dev.vars` for local real-repo tests;
   quote the multiline PEM. Never paste credentials into chat, PRs or committed files.
3. Follow the installation link; choose **Only select repositories** and `r3dbars/shiptorio`.
   Add a demo repository only after choosing its exact name; don't select all repositories.
4. After preview login, check `/api/setup/status`. Each credential field is a boolean;
   `github: true` requires all five GitHub secrets. `spark: true` is independent.
5. Use `/auth/login?next=/?source=live%26repo=r3dbars/shiptorio` to sign in to the live map.

The canonical `PUBLIC_URL` is `https://shiptorio.com`, including when the `.dev` alias is visited.
Phase A adds install/backfill, normalized ore and the gauntlet in subsequent small PRs.

### Existing Shiptorio App

The private App already exists at `https://github.com/settings/apps/shiptorio`.
Do not create a duplicate. App ID and Client ID are public identifiers on its General page.
Credentials → Client secrets → New secret creates a one-time client secret.
Credentials → Key pairs → New key downloads the PEM; save its contents in
`GITHUB_APP_PRIVATE_KEY` locally and upload that value with `wrangler secret put`.
The webhook signing secret must match between the App webhook configuration and
`GITHUB_WEBHOOK_SECRET` on the Worker. Only secret names and readiness booleans are logged.

### GitHub mine behavior

Verified webhook requests persist a delivery id in D1 and enqueue the payload durably
in the repo's Factory DO before returning 202. Retries use that same id; processed ids
expire after seven days. API calls, backfill and Spark work happen in alarms.
The installation lifecycle uses a control DO, then queues each repo's initialization.
Backfill reads up to fifty open issues (paginated, excluding PRs), including distinct
reaction authors as reporters. Exact duplicate signals fold into an existing chunk.
Evidence weight = severity × max(1, users affected) + 2 × unique reporters + 10 for paying
customer evidence, decayed with a seven-day half-life and 10% floor. Spark decides priority;
normalizers only attach evidence and exact route/Sentry hints.

`HOSTED_SPARK_ASSEMBLER` is **off by default**. Set it to `1` only for an explicitly
approved dev/demo fallback; the product's builders are local subscription agents.
Without a builder, queued ore produces a resources bottleneck and a Next Move to connect
Claude or ChatGPT. `/api/repos` lists installed repos after GitHub sign-in; `/api/sources`
reports setup steps after preview sign-in. `disconnect_source github` pauses that repo's
mine; GitHub uninstallation remains a separate dashboard action.

## 2b. Sentry and PostHog mines

Both are optional. Each one is a single paste on a page Shiptorio serves, no wrangler needed.
Keys land in the `CACHE` KV namespace (`cred:sentry`, `cred:posthog`), never in git, logs or
factory state. Wrangler secrets with the same meaning win if set: `SENTRY_CLIENT_SECRET`,
`POSTHOG_API_KEY` (+ vars `POSTHOG_PROJECT_ID`, `POSTHOG_HOST`, `POSTHOG_KEY_EVENT`).
Each mine feeds one repo's map: the one you connected it from (`link:<kind>` in KV), or
`SENTRY_REPO` / `POSTHOG_REPO` if set.

### Justin does — Sentry
1. Open the map, tap the Sentry mine (or go to https://shiptorio.com/connect/sentry?repo=OWNER/REPO).
2. In Sentry: Settings → Developer Settings → Custom Integrations → Create New Integration →
   Internal Integration. Webhook URL `https://shiptorio.com/webhooks/sentry`, Alert Rule Action on,
   webhooks: issue + error, permissions Issue & Event: Read. Save.
3. Paste its Client Secret on the connect page.

### Justin does — PostHog
1. In PostHog: Settings → Personal API keys → create one with Query: Read and Project: Read.
2. Paste it plus the project id on https://shiptorio.com/connect/posthog?repo=OWNER/REPO.

### Mine behavior

- **Sentry** (push): `/webhooks/sentry` checks `Sentry-Hook-Signature` (HMAC-SHA256 of the raw
  body with the Client Secret, constant time), dedupes on `Request-ID` in D1, queues in the Factory
  DO and returns 202. Each Sentry issue id is one ore chunk (`sentry:<id>`). Repeats grow the same
  chunk (users = max of Sentry's userCount, +1 per error event with a user). District = first
  path segment of the topmost in-app frame, else the transaction route. Level → severity:
  warning 1, error 2, fatal 3. Resolved before a fix = ore removed; resolved after our fix
  launched = `bitersKilled` +1.
- **PostHog** (pull): every 5 minutes on the DO alarm, one HogQL query for the key event and
  `$exception` per route per day over 9 days. Ore when yesterday's key event count is below 50%
  of the prior 7-day average (needs ≥ 30/day baseline), or `$exception` is ≥ 10 and ≥ 3× baseline.
  Fingerprint `posthog:<event>:<route>:<day>`, so re-polls fold. Errors and 429s back off
  exponentially (max 1 h). The busiest routes show on the PostHog source card.
- Spark still decides if any of it is real and links it to other ore; the mines only normalize.

### Fake mode
- `FAKE_POSTHOG=1` in `server/.dev.vars`: the poller uses canned data (steady traffic, then
  /checkout drops 70% with an error spike). Tap Connect PostHog on the local map.
- `bun run fake:sentry [issue.created|issue.resolved|error.created] [issueId]` posts a signed
  webhook to localhost:8787 with `SENTRY_CLIENT_SECRET` from `server/.dev.vars`. Connect Sentry on
  the map first so the mine is linked to your local repo.

## 3. Accounts: who can see which maps

GitHub is the only login (the same App's user-to-server OAuth, no passwords). Sign-in
(`server/src/accounts.ts`, tables in `migrations/0004_accounts.sql`):

1. stores the GitHub user in `users` (keyed by GitHub user id),
2. reads `GET /user/installations` + each installation's repos with the user's own token and
   replaces that user's rows in `user_installations` / `user_repos`,
3. opens a `sessions` row (only a SHA-256 of the random session id is stored) and sets an
   httpOnly, Secure, SameSite=Lax cookie that names it. `/auth/logout` deletes the row.

Every `/api/repos/<owner>/<repo>/*` route (factory websocket, runner pairing, jobs) and
`/connect/<kind>` checks `user_repos`, and answers 404 for repos the player can't reach.
`/api/repos` lists only that player's repos. Installing the App on more repos adds them for the
installer right away (installation webhook `sender`); anyone else gets them on next sign-in.
Route code can use `requireUser` from `server/src/index.ts` and read `c.get("user")`.

`ALLOWED_LOGINS` is still the sign-up gate while Shiptorio is private; set it to `*` to open
sign-up. The shared `APP_PASSWORD` gate in front is separate: unset `APP_PASSWORD` handling in
`server/src/access.ts` (`previewAccess`) when launching.

Sentry and PostHog keys are per repo in KV (`cred:<kind>:<owner/name>`). Each map has its own
Sentry webhook URL, `/webhooks/sentry/<owner>/<repo>`. Keys saved before accounts (`cred:<kind>`)
keep working for the repo in `link:<kind>`, and so does the bare `/webhooks/sentry` URL.

## Real repos locally

Copy the GitHub values from step 2 into `server/.dev.vars`. Local dev then loads real repos
too. Webhooks still only reach the deployed Worker.
