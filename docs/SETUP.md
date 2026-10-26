# Setting up Shiptorio

Nothing here runs until you do these steps. Go top to bottom.

## 1. Cloudflare resources

```sh
npx wrangler d1 create shiptorio                   # paste the database_id into wrangler.jsonc
npx wrangler kv namespace create shiptorio-cache   # paste the id into wrangler.jsonc
npx wrangler d1 migrations apply shiptorio --remote
```

Set `PUBLIC_URL` in `wrangler.jsonc` to where the Worker will live
(e.g. `https://shiptorio.<your-subdomain>.workers.dev`), then `npx wrangler deploy` once
so the URL exists.

## 2. The GitHub App

1. Open `<PUBLIC_URL>/setup` and hit **Create GitHub App**. GitHub pre-fills everything:
   read-only access to contents, pull requests and checks, plus `pull_request`, `push`
   and `check_suite` webhooks pointed at `/webhooks/github`.
2. GitHub sends you back to `/setup/callback`, which shows each secret once. Run the
   `wrangler secret put` command next to each value.
3. Also set a session secret: `openssl rand -hex 32 | npx wrangler secret put SESSION_SECRET`.
4. Install the app on the repos you want mapped (the callback page links to it).

Once `GITHUB_APP_ID` is set, `/setup` turns itself off.

## 3. Who can see maps

Only logins in `ALLOWED_LOGINS` (in `wrangler.jsonc`) can view maps, since they show
private repo structure. Login goes through the same GitHub App.

## 4. Auto-deploy from GitHub (optional)

The `Deploy` workflow is off by default. To turn it on, add repo secrets
`CLOUDFLARE_API_TOKEN` (Workers + D1 edit) and `CLOUDFLARE_ACCOUNT_ID`, then set the repo
variable `DEPLOY_ENABLED=true`. Every push to `main` then migrates D1 and deploys.

## Local dev

```sh
npm install
cp .dev.vars.example .dev.vars   # fill in what you have
npm run db:migrate:local
npm run dev
```
