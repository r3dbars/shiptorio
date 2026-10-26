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
   write access to contents and pull requests (to push `shiptorio/*` branches and open PRs,
   never to merge), read access to issues and checks, plus `issues`, `pull_request`, `push`
   and `check_suite` webhooks pointed at `/webhooks/github`.
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

## 3. Who can see maps

Only logins in `ALLOWED_LOGINS` (in `server/wrangler.jsonc`) can view maps, since they show
private repo structure. Login goes through the same GitHub App.

## Real repos locally

Copy the GitHub values from step 2 into `server/.dev.vars`. Local dev then loads real repos
too. Webhooks still only reach the deployed Worker.
