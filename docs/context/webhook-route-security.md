# Task6 HTTP boundary review — 2026-10-27

Scoped source review of `server/src/index.ts` and the webhook verification helpers,
with supporting reads of access, signup, authorization, session, account, admin,
credential and Durable Object inbox controls. This is local source/test evidence;
no staging/production probes or claims of exploitation. No auth/account modules,
Sentry normalizer, runner workspace/publication code or shared contract changed.

## Fix and reproduction

Every webhook previously awaited `Request.text()` before its final size check;
GitHub also cloned the request and fully read it for signature verification first.
An unauthenticated caller of GitHub/Intercom (or Sentry with a syntactically valid
signature) could omit Content-Length and force the entire body into memory before
rejection. The final check counted UTF-16 characters, allowing UTF-8 bodies larger
than the advertised 1 MiB. Support email required its existing bearer token first.

The new shared reader counts bytes as chunks arrive, stops and cancels at the
first chunk over 1 MiB, and uses a bounded growing buffer. GitHub verifies the
same bounded body without cloning. The provider HMAC messages, keys, algorithms
and comparisons remain unchanged. A too-large request returns 413 before JSON,
HMAC or queue work (Sentry retains its early signature-format check).

Before: the new stream regression returned 401 after draining all eight chunks;
the signed multibyte regression returned 200 despite exceeding 1 MiB. After:
all four inlets return 413, the stream reads only its two boundary chunks and is
cancelled. Exact-limit, whitespace, byte-split Unicode and altered-body tests
retain provider signing behavior. This proves bounded application reads, not
Cloudflare edge buffering or a wall-time/CPU benchmark.

## Public route inventory and controls

| Boundary | Allowed public surface / effective control |
| --- | --- |
| Password gate | `/access` GET form and POST password, HTTPS upgrade, signed host-bound form proof/exact origin, per-IP auth budget, preview cookie. Fast path retains those checks and fails closed. |
| Public static | GET/HEAD `/`, campaign-only landing queries, `/judge[/]`, hashed JS/CSS assets, `/welcome/*`, `/fonts/*`, `/brand/*`, robots/sitemap; GET/HEAD `/docs[/...]`, `/privacy`, `/terms`. These serve static/legal content. Other application routes retain gate checks. |
| Health/version | Public coarse `/api/health` GET/HEAD; `/api/version` GET in password mode, GET/HEAD in waitlist mode. No factory contents. |
| Waitlist | POST `/api/waitlist` uses its dedicated handler; waitlist-mode `/waitlist`, `/auth/login` and OAuth callback/logout bypass signup gate but retain handler controls. Password mode only exempts GET `/auth/login`; existing callback needs preview access. |
| OAuth/bootstrap | OAuth state cookie compared before exchange, redirect restricted to same-origin paths; `/setup[/callback]` disabled after App setup, otherwise session or explicit owner-password bootstrap. Owner session requires a short-lived server-secret proof and an allowed existing user. |
| GitHub | POST `/webhooks/github`: HMAC-SHA256 over raw text, supported event list, installation/repo checks, durable delivery ledger and DO inbox. |
| Sentry | POST `/webhooks/sentry[/owner/repo]`: per-repo/pinned active identity, HMAC-SHA256 over raw text, supported resource, redaction, durable repo-scoped delivery ledger. |
| Support | POST `/webhooks/support/owner/repo/token`: constant-time bearer-token match to active numeric repo/installation credentials; Intercom equivalent uses raw-body HMAC-SHA1. Both normalize before enqueue. Support is exempt from password gate, but the protected waitlist signup gate currently omits these exceptions (root handoff). |
| Runner transport | Public installer/bundle/manifest plus POST device start/poll/join; generated codes/secrets, expiry, one-use exchange, access checks before repo token issuance. POST repo claim/heartbeat/renew/finish bypass browser cookie/origin checks only after runner signature, expiry, matching repo, live user/write permission and paired status. |

## Nonpublic routes and validation

Repository API routes, connector management, source/setup status require a live
session and repository authorization. GET/HEAD views require read access; mutations
and connector pages require write. Empire/repo lists revalidate each repository.
Factory sockets pass session/access checks before upgrade; frame schemas and write
authority are enforced in the DO. Account routes use `requireUser`; admin routes
require configured admin identity. Browser mutations require exact same-origin
headers except individually authenticated machine endpoints and the gate proof.

Runner jobs/receipts use Zod `safeParse`; claim/heartbeat use bounded enum-array
checks. Claim/jobs/finish currently let malformed JSON become a sanitized 500;
that requires an already-authorized caller and did not establish privilege gain.
Webhook envelopes use provider authentication and targeted structural checks,
not full Zod provider schemas. Normalizers handle supported provider shapes;
this review does not claim exhaustive shape validation or schema coverage.

## Replay semantics and remaining boundaries

GitHub deduplicates by source + delivery header; Sentry by repo + Request-ID
(or raw-body SHA-256 fallback). D1 acknowledges persistence before 202, and the
DO retains pending/done/failed delivery keys across retries. Support hashes
repo/channel/message ID; email without Message-ID falls back to receipt time.
Existing completion/pending retry behavior remains unchanged.

Delivery headers themselves are not covered by provider raw-body HMAC. The
current design prevents ordinary provider retries; it does not guarantee freshness
against someone who has captured a valid body/signature and changes the delivery
header, nor after retention expires. No captured-delivery exposure was established.
Changing ledger identities/retention requires a coordinated compatibility change;
this PR does not claim to remediate that separate boundary.

The protected waitlist signup gate still blocks support/Intercom before their
machine credentials; the reproduction returns a 200 HTML signup page before the
webhook handler. Root owns that handoff, so end-to-end support availability in
waitlist mode remains unverified.

Root approved a separate one-token allowlist fix after the route test reproduced
`Unknown factory RPC`: valid Intercom HMAC → Worker queueSupport → actual
Factory.observedCall → 500, with no queue dispatch. `enqueueSupport` is now explicitly
allowed; the regression traverses the actual guard, returns 401 for a bad signature,
and 202 for a valid one. Only the final enqueue sink is stubbed. This proves the
HTTP-to-RPC guard path in password mode, not durable support processing or the
protected waitlist gate. The streaming fix and RPC fix remain separate commits.
