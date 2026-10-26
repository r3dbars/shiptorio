# Going live

Local dev needs none of this. See the README. Commands run from the repo root unless noted.

Already done: the `shiptorio` D1 database (schema applied) and the `shiptorio-cache`
KV namespace exist on the Cloudflare account, and their ids are in `server/wrangler.jsonc`.

## 1. Deploy the Worker

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

Wrangler prints the URL, something like `https://shiptorio.<your-subdomain>.workers.dev`.
This only creates the `shiptorio` Worker. No other Worker is touched.

## 2. Create the GitHub App

1. Open `<your URL>/setup` and hit **Create GitHub App**. GitHub pre-fills everything:
   write access to contents and pull requests (to push `shiptorio/*` branches and open PRs,
   never to merge), read access to issues and checks, plus `issues`, `pull_request`, `push`
   and `check_suite` webhooks pointed at `/webhooks/github`.
2. GitHub sends you back to `/setup/callback`, which shows each secret once. From `server/`, run the
   `npx wrangler secret put …` command next to each value.
3. Also set a session secret: `openssl rand -hex 32 | npx wrangler secret put SESSION_SECRET`,
   and the Spark key: `npx wrangler secret put META_API_KEY`.
4. Install the app on the repos you want mapped (the callback page links to it).

Once `GITHUB_APP_ID` is set, `/setup` turns itself off.

The App's callback URLs come from the URL you open `/setup` on. If you move to a custom
domain later, set the `PUBLIC_URL` var and update the App's URLs on GitHub.

## 3. Who can see maps

Only logins in `ALLOWED_LOGINS` (in `server/wrangler.jsonc`) can view maps, since they show
private repo structure. Login goes through the same GitHub App.

## Real repos locally

Copy the GitHub values from step 2 into `server/.dev.vars`. Local dev then loads real repos
too. Webhooks still only reach the deployed Worker.
