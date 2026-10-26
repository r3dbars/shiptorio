# Goal 12: controlled signup and abuse protection

Oct 26 checkpoint: controlled access before factories spend resources. Builds on
PR #160's users and revocable sessions. No shared protocol or web map changes.

## Rollout state

Justin chose **keep the password fallback active until Turnstile keys are installed
and verified**. Missing `SIGNUP_GATE_MODE`, or `password`, keeps the existing gate.
`SIGNUP_GATE_MODE=waitlist` selects the new entry flow. This is a Worker environment
flag, independent of the per-player game flags. No Turnstile resources or keys were
created by this PR. No secrets are committed.

## Setup for Justin

1. Cloudflare dashboard → **Turnstile → Add widget**. Name it `Shiptorio signup`,
   choose **Managed**, and allow `shiptorio.com` and `shiptorio.dev`. Leave
   pre-clearance off; the server verifies each submission itself.
2. From the current main checkout's `server/` directory, install the public **site
   key** and private **secret key** using the prompts (never paste the secret into
   a commit or chat):

   ```sh
   bunx wrangler secret put TURNSTILE_SITE_KEY --name shiptorio
   bunx wrangler secret put TURNSTILE_SECRET_KEY --name shiptorio
   ```

3. Verify the widget in staging first. Staging is a separate Worker/database since
   goal 14. It needs its own keys and flag, not the production bindings:

   ```sh
   bunx wrangler secret put TURNSTILE_SITE_KEY --env staging
   bunx wrangler secret put TURNSTILE_SECRET_KEY --env staging
   printf 'waitlist' | bunx wrangler secret put SIGNUP_GATE_MODE --env staging
   ```

   On `https://shiptorio.dev`, check the email waitlist, GitHub sign-in, pending
   denial, and admin approval. Use a second GitHub account for pending access.
   Only after that proof, activate production:

   ```sh
   printf 'waitlist' | bunx wrangler secret put SIGNUP_GATE_MODE --name shiptorio
   ```

4. Roll back the entry gate immediately if needed (retains all approvals/quotas):

   ```sh
   printf 'password' | bunx wrangler secret put SIGNUP_GATE_MODE --name shiptorio
   ```

`APP_PASSWORD` and `SESSION_SECRET` stay installed for rollback. `ADMIN_LOGINS`
(default `r3dbars`) controls who can administer access; the existing explicit
`ALLOWED_LOGINS` entries bootstrap approved access. `ALLOWED_LOGINS=*` does **not**
open signup. A D1 denial overrides bootstrap access and cannot be bypassed by an
invite. Use the dashboard's explicit approval to re-enable a denied account.

Cloudflare requires server-side verification:
https://developers.cloudflare.com/turnstile/get-started/server-side-validation/
The implementation checks success, exact hostname and action, bounds token size,
uses a five-second timeout and fails closed. GET /auth/login renders the challenge
in waitlist mode; only a verified same-origin POST starts OAuth.

## Approval and invitations

Open `/admin` → **Manage waitlist, allowlist, invite codes, quotas and abuse flags**
(`/admin/signup`). GitHub sign-in stores a pending account and a revocable session.
Click **Approve** for a GitHub entry. The existing session gains access on its next
request. To discover newly approved repos, sign in again; pending accounts do not
fetch installations or store OAuth tokens. **Deny / revoke** blocks API and socket
access, including existing connected sockets on their next message/broadcast.

Email requests are interest, not authentication. Justin must verify and enter the
GitHub login before approving an email entry. The service sends no emails. An
admin can create a one-use invite, shown once, expiring after seven days. Share it
manually; the recipient enters it before GitHub sign-in. Only its SHA-256 digest is
stored, and D1 claims/redemption share one transaction.

## Quotas and abuse defaults

- **3 repositories, 3 factories, 20 run attempts/day (UTC)** per approved login.
  Admin can change these, including zero runs to pause builds. Repo/factory slots
  are registered after membership checks, before factory RPCs. Existing slots are
  reusable; this does not delete factories or evict existing slots when lowered.
- Run attempts reserve quota **before planning**, including failed planning and
  rework. Automated plans charge the first admitted player for the factory; direct
  HTTP plans charge the authenticated caller. Revoked owners cannot run jobs.
  The global D1 counter prevents overspending across factories/Worker isolates.
- Waitlist: 5 submissions/IP/hour. Sign-in: 10/IP/10 minutes. Failed runner auth:
  10/IP/minute; revoked tokens also count. Browser pairing: 5/user/10 minutes.
- Valid signed webhooks: 300/installation/minute for GitHub, 300/repo/minute for
  Sentry. Installation-created events: 10/account/hour. Throttles return 429 and
  record a reason/hit count on `/admin/signup`; bad webhook signatures never flag
  another account. Healthy runner polling does not consume failed-pairing quota.
- IP scopes store SHA-256 digests, not raw addresses. Admin visits perform bounded
  cleanup of expired counters/invites and abuse flags older than 30 days. These
  app-level limits complement Turnstile; no guarantee against volumetric DDoS.

Goal 10's Spark call/token budget work is in PR #165. It was not on main when this
implementation began. Reconcile its factory budget-owner identity before calling
these limits a unified budget ledger; signup quotas are presently an independent
atomic D1 admission ledger, not a replacement for Spark spending caps.

## Verification

`bun run check`: workspace typechecks, complete test suite, production frontend
build. Signup tests use real SQLite behind D1, exercise approval/revocation through
HTTP, invite races/expiry, quota boundaries, wrong Turnstile hostname/action and
missing/unreachable verification, failed-pair throttles, and password rollback.
Real browser Turnstile proof requires Justin's widget setup above. The production
entry gate intentionally remains the password fallback until then.
