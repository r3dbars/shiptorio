# Accounts and sign-in (PR #160)

GitHub is the only login: the Shiptorio GitHub App's user-to-server OAuth. No passwords, no
other providers. Build on this instead of around it.

## Tables (`server/migrations/0004_accounts.sql`)

| Table | Key | What |
| --- | --- | --- |
| `users` | `id` = GitHub user id | `login`, `name`, `avatar_url`, `created_at`, `last_login_at` (ms). Renames keep the account |
| `sessions` | `id_hash` = SHA-256 hex of the random session id | `user_id`, `created_at`, `expires_at` (14 days), `user_agent`. Delete a row = that browser is signed out |
| `user_installations` | (`user_id`, `installation_id`) | App installations the user's GitHub account reaches |
| `user_repos` | (`user_id`, `repo`) | lowercase `owner/name` + `installation_id`. **The access list**: no row, no factory |
| `user_prefs` | (`user_id`, `key`) | short strings; allowed keys live in `PREF_KEYS` in `accounts.ts` (`intro`, `guideSeen`) |

Older tables `installations` / `repos` are still the App-wide list (webhooks write them).

## Helpers (`server/src/accounts.ts`)

- `currentUser(env, cookieHeader, url?)` → `{ id, login }` or null. Needs a valid signed cookie
  **and** a live `sessions` row **and** the login passing `ALLOWED_LOGINS`. `DEV_LOGIN` on
  localhost returns a dev user (`dev: true`) that sees every repo.
- `createSession(env, user, userAgent)` → Set-Cookie string. `endSession(env, cookieHeader)`.
- `upsertUser(env, githubUser)`, `fetchReach(userToken)` + `saveReach(env, userId, reach)`:
  what `/auth/callback` runs on every sign-in, so signing in again refreshes the repo list.
- `canSeeRepo(env, user, repo)`, `reposFor(env, user)`.
- `readPrefs` / `writePrefs`.

## Routes (`server/src/index.ts`)

- `requireUser` middleware: 401 unless signed in, then `c.get("user")`.
- `/api/repos/:owner/:repo/*` (factory websocket, runner pair/jobs): signed in + `user_repos` row,
  else **404** (same answer as "doesn't exist").
- `/api/repos`: only the player's repos. `/api/sources?repo=`: only if they can see it.
- `/connect/:kind?repo=`: must be able to see that repo.
- `GET /api/me` → `{ login, allowed, prefs, installUrl }`. `PUT /api/me/prefs` (same-origin).
- `/auth/login`, `/auth/callback`, `/auth/logout` (deletes the session row).
- Installation webhooks: new repos are added to `user_repos` for the installer (`sender.id`) if
  they have an account; removed repos / deleted installations drop their rows.

The Factory DO's own websocket check (`browser-socket.ts`) still verifies the signed cookie +
allowlist + preview cookie as defense in depth; the Worker route does the D1 session and repo check.
Already-open sockets survive a sign-out until their attachment expires.

## Mine keys (`server/src/sources/creds.ts`)

- KV `cred:<sentry|posthog>:<owner/name>`, written by `/connect`. Still plaintext JSON in KV
  (encrypting them is open work).
- Per-repo Sentry webhook: `/webhooks/sentry/<owner>/<repo>`, verified with that repo's secret.
- Legacy: `cred:<kind>` (pre-accounts) and the bare `/webhooks/sentry` still work, but only for
  the repo in `link:<kind>`. Worker-secret keys (`SENTRY_CLIENT_SECRET`, `POSTHOG_API_KEY`) also
  only apply to the linked repo (or the first map, if nothing is linked).

## Gates

- `ALLOWED_LOGINS` (wrangler var): sign-up gate while private. `*` = anyone with GitHub.
- `APP_PASSWORD` preview gate (`server/src/access.ts`) sits in front of everything and is
  separate. To launch: drop the `previewAccess` call in `index.ts`'s middleware.

## Tests

`server/test/d1-fixture.ts`: `testD1()` is real SQLite with every migration applied behind the
D1 API; `signedInCookie(env, login, repos)` signs a user in like the callback does.

## Play first, sign in later (web client)

A bare visit to `/` never asks for a sign-in. `web/src/main.tsx` plays the welcome tour once, then:

- `/api/me` has a `login` → the repo picker (`ui/Onboarding.tsx`, step `repo`), as before.
- no `login` (signed out, or a future `{ guest: true }`) → the demo shop: `?source=sim&scenario=first-run&repo=you/demo-shop`.
  It's the client-side sim, so it costs the server nothing (no Spark, no GitHub, no runner).

In the sandbox (`sandbox` in `App.tsx`: the sim with a real server behind it, `serverUp()` in `account.ts`):

- The floor card carries a **Demo shop · Use your repo ›** chip, always.
- After the first rocket, the Suggested card (`whatsNext`, `{ do: "signin" }`) holds "That was a demo shop. Run your
  own repo next" for two rockets, then steps aside.
- Both go to `signInUrl()` = `/auth/login?next=/?onboard=repo&source=live`, the same GitHub OAuth as always.

`?onboard=hello` still shows the old sign-in card.

Guests (server side: PR #355): the bare visit's `/api/me` call is what creates the guest cookie, and a guest gets
no `login`, so the client treats it like signed out. In the sandbox the progress profile is `guest`
(`progressProfile(..., sandbox)`), which syncs through `GET/PUT /api/me/progress` like a signed-in profile; if
there's no guest session the pull fails and nothing is pushed. `savePref` also sends on a bare visit and in the
demo shop. `/auth/callback` moves the guest save onto the account (account progress wins).
