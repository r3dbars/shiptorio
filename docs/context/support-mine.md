# Support mine (customer feedback)

Customer emails and Intercom chats become ore at the **support well**. Muse Spark sorts each one, links it to
the work it's about, and drafts a reply. **The player sends every reply.** Nothing reaches a customer without a
tap on that exact draft, at every autonomy level (docs/VISION.md non-goals, docs/PRODUCT.md "Customer replies").

Task 16 of the Oct 26 list. PR #176.

## The loop

1. **Mail comes in** (email inlet or Intercom webhook) and becomes a `SupportTicket` in `FactoryState.support`.
   A follow-up on the same thread wakes the ticket back up. Same message twice is a no-op.
2. **Spark triages it** through `Factory.think("support")`: bug, feature, question, praise or spam, a district,
   a one-line summary without the customer's name, and `linkedItemId` when it's clearly the same problem as an
   item on the floor (a Sentry error, an issue). Spark can only link to real open items. The keyword rule stands
   in when there's no key or Spark fails, logged as a fallback, and it never links.
3. **Linked work weighs more.** The customer joins the item's reporters (and `paying` carries over), so the
   bottleneck math and the deck favor work customers are asking about.
4. **Spark drafts the reply** (`think("support")` again). Spam is closed with no draft.
5. **A reply card** (`kind: "reply"`, id `support:reply:<ticket>`) joins the check-in deck: "Send this reply to
   Dana?" with the draft quoted. The support well panel shows the full draft, editable.
6. **Bugs nobody's tracking** get a second card: "File Rio's bug as an issue?" Filing opens a real GitHub issue
   (summary + the customer's words with emails and phone numbers scrubbed, no name or address) and puts it on the
   belt like any issue.
7. **When the linked work launches**, Spark drafts an "it's fixed" reply and a new card waits for the tap.
   Sending it counts a **customer answered** (+10 ship score). Answering a question counts too.

## The send rule (the part that must never break)

- `send_reply { ticketId, draftHash }` and the reply card's Send both carry the **hash of the draft on screen**.
  Edit the draft and the hash changes, so an old tap can't send new text.
- Only `deliverReply()` (`server/src/support.ts`) talks to Intercom or the mail sender, and it needs a
  `PlayerTap` for that ticket's current draft.
- A `PlayerTap` is minted only in `Factory.webSocketMessage` from the player's own message. No alarm, permit,
  autonomy level, game-master ranking or Spark call can make one. `server/test/support.test.ts` checks this
  statically (every `playerTap(` sits inside `webSocketMessage`) and end to end (lights-out autonomy, every
  district permitted, many alarms: zero outbound calls until the tap; one call, with exactly the draft, after).
- Spark's prompts say it never sends anything, and every piece of customer text goes in as untrusted data.

## Inlets

| Inlet | URL | Auth |
| --- | --- | --- |
| Email (Postmark inbound, or any JSON `{from, subject, text}`) | `/webhooks/support/<owner>/<repo>/<token>` | the 40-hex token in the URL (shown once on the connect page) |
| Intercom app webhook, topics `conversation.user.created` + `conversation.user.replied` | `/webhooks/intercom/<owner>/<repo>` | `X-Hub-Signature: sha1=` HMAC with the app's client secret |

Both are exempt from the preview password (they carry their own auth), dedupe through `webhook_deliveries`
(source `support`), and queue durably on the Factory like Sentry. Email threads key on sender + subject (minus
Re:/Fwd:), because mail clients drop References too often.

**Connect:** `/connect/support?repo=owner/name` (signed-in, repo access required). Opening it makes the email
token and plugs the well into the map. The Intercom client secret, access token and admin id are pasted there.
Keys live in encrypted KV `cred:support:<installationId>:<repoId>`, with AAD
`support:<installationId>:<repoId>`. Both IDs come from the active D1 repository/installation mapping.
The same repository retains its connection after a rename; a replacement reusing the old name or a
changed installation cannot inherit it. Legacy name-only keys are ignored: reconnect rather than guessing ownership.

Optional operator Worker secrets `SUPPORT_INBOUND_TOKEN`, `INTERCOM_CLIENT_SECRET`, `INTERCOM_TOKEN`,
`INTERCOM_ADMIN_ID`, and outgoing `RESEND_API_KEY`/`SUPPORT_FROM` require all three operator settings:
`SUPPORT_REPO` (setup label), `SUPPORT_REPO_ID` and `SUPPORT_INSTALLATION_ID` (the exact numeric identity).
The IDs can be read from `repos.repo_id` and `repos.installation_id` for the connected repository.
Name-only configuration fails closed. Explicit IDs preserve the same actual repository across rename.
Stored keys use the #155 master key (the D1 credential table only takes sentry/posthog).

Account/factory cleanup must delete the identity key via `supportCredentialKey({ installationId, repoId })`,
also remove any legacy `cred:support:<full_name>` key, and clear the factory's support conversations,
`supportSeen`, `supportSend:*` and `delivery:support-*` records. Inbound URL bearer tokens are redacted before logging.

**Sending:** Intercom tickets reply into the conversation (needs token + admin id). Email replies go through
Resend when `RESEND_API_KEY` and `SUPPORT_FROM` are set. Without a sender, a tapped reply lands in the
**outbox**: marked sent via outbox, kept on the ticket, with a Copy button in the panel. Nothing is lost and
nothing pretends it was emailed.

## Map and UI

- `ore-inbox` deposit at (-6, 6), belted to the splitter, drawn as the **support well** (Item Lab
  `buildSupport`, states QUIET · RICH · WAITING: the mailbox flag goes up when a reply waits on you).
- An empty support well ghost shows up only after the first rocket ("customer mail · tap to connect"), so new
  players meet it once they've shipped something worth telling someone about (VISION principle 9).
- Tap the well: the support panel lists tickets (replies waiting first, longest-waiting on top), the customer's
  words, why Spark sorted it that way, what it's linked to, the editable draft, Send, File as an issue, Close.
- "How it thinks" logs every triage and draft under "Read a customer message".

## Try it

- Sim: `?source=sim&scenario=support` (add `&autolaunch` to watch "it's fixed" drafts appear as fixes launch).
  Dana's checkout bug links to the Sentry crash, Rio's SAVE10 bug gets filed, Lee's question and Sam's feature
  ask get answers, spam closes itself.
- Local server: set `SUPPORT_INBOUND_TOKEN` (`openssl rand -hex 20`) and optionally `INTERCOM_CLIENT_SECRET` in
  `server/.dev.vars`, `bun run dev`, then `bun run fake:support bug|reply|feature|question|intercom|intercom-reply`.
- `FAKE_SUPPORT=1` makes the mine count as connected with no keys.

## Waiting on Justin (later, not blocking)

To go live on a real inbox: open `/connect/support?repo=<repo>` once and point an inbound-email service (or
Intercom webhook) at the URLs there. To send real email instead of the outbox, set `RESEND_API_KEY` and
`SUPPORT_FROM` as Worker secrets.

## Not done yet

- Cloudflare Email Routing straight into the Worker (`feedback+repo@shiptorio.dev`): needs Email Routing turned
  on for the domain and a MIME parser; the JSON inlet covers Postmark/Mailgun-style forwarding meanwhile.
- Spark doesn't yet learn from edits to its drafts (a good next step: player edits become style notes).
