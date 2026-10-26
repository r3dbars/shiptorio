# Account and data controls — goal 13

Oct 26 checkpoint: make the live factory safe to leave as well as join.

- Settings uses the v3 slate/amber HUD styling and server-rendered pages, keeping the web lane isolated.
- JSON export contains factory state, items, permits, research and retained activity; excludes credentials and runner leases.
- Account deletion is limited to installations owned by the signed-in GitHub login. Collaborator access does not confer deletion rights.
- Deletion requires the exact repository confirmation list, stops each factory, closes sockets, revokes runner pairing and erases Durable Object storage before removing D1 and KV data.
- Retain only a minimal deletion receipt (random operation id, timestamp, counts), without login, repo names, credentials or exported factory data.
- GitHub issues, commits, PRs and third-party provider accounts remain at their source. The UI explains that provider-side app uninstall/key revocation is separate.
- Privacy and terms are drafts for Justin's review, not approved final policies.

Integration watch: auth user model, goal 3 encrypted credentials (installation/repo scope), goal 8 durable state export/backups. Recheck these before merging.

## Verified implementation

- `/settings`, `/api/account/export`, `/api/account/signout`, `/api/account/delete`.
- Exact repo confirmation protects owned personal installations; organization/collaborator data is preserved.
- Deletion response includes the pre-delete archive. No archive copy is retained on the server. If cleanup fails, no success receipt is written; retry deletion from Settings after the storage failure is resolved.
- D1 account, membership, preferences, session, repo, PR, decision-rule, encrypted credential and attributed webhook rows are purged. Per-account security counter DOs are erased too.
- `deleteAll()` removes every DO key (including state chunks, old schema/backups, runner pairing, leases, retained webhook payloads); the alarm is explicitly removed. Storage writers refuse to write after erasure.
- Durable SHA-256 repo blocks prevent delayed webhooks from rebuilding deleted factories. These and anonymous deletion receipts are intentional retention, with no raw login/repo data in receipts. Reconnecting a deleted factory requires an explicit future reset flow.
- Worker operator secrets, external GitHub/Sentry/PostHog data, local runner files, and operator-managed external backups are not user-owned records and are not deleted by this route. Existing pre-attribution D1 webhook delivery IDs contain no payload and age out through the existing seven-day cleanup.
- Goal 8 integration: export reads chunked state without modifying stored migrations; guarded chunk writes cannot resurrect deleted data. Goal 3 integration: purge encrypted envelopes by installation/repo scope and by credential writer.

Local QA used Cloudflare's local runtime on `http://localhost:8793`: settings at 1280×900 and 390×844, a real JSON download, public privacy/terms navigation and draft labels, no horizontal overflow or app errors. Browser plugin unavailable; Playwright used installed Chrome. Production deletion is deliberately not run against Justin's account.

Storage semantics checked against [Cloudflare's deletion guidance](https://developers.cloudflare.com/durable-objects/best-practices/rules-of-durable-objects/). Provider uninstall guidance: [GitHub App management](https://docs.github.com/en/apps/using-github-apps/reviewing-and-modifying-installed-github-apps).

Native-form deletion was also verified in local workerd using a disposable real session: exact repo text + checkbox → deletion archive downloaded → old session 401; SQLite counts users/sessions/repos/installations all zero, anonymous receipt count one. A `same-origin` document referrer policy keeps Chrome from sending `Origin: null` on the native form; cross-origin requests remain rejected. Local dev variables were restored after the proof.
