// Support mine: customer email and Intercom chats. Each conversation is one support ticket on the
// support well; Spark sorts it and drafts a reply, and the player sends it (docs/context/support-mine.md).
//
// Two inlets:
// - Email: any inbound-email service that can POST JSON (Postmark inbound, or the generic shape below) to
//   /webhooks/support/<owner>/<repo>/<token>. The unguessable token in the URL is the auth, since those
//   services don't sign requests.
// - Intercom: an app webhook (topics conversation.user.created + conversation.user.replied) to
//   /webhooks/intercom/<owner>/<repo>, signed with the app's client secret (X-Hub-Signature: sha1=<hex>).

import type { SourceStatus, SupportChannel } from "@shiptorio/shared";
import { decryptCredential, encryptCredential, type Envelope, type KeyEnv } from "./credential-crypto";

/** One inbound customer message, normalized from either inlet. */
export interface SupportMessage {
  channel: SupportChannel;
  threadId: string; // the conversation: email thread root or Intercom conversation id
  messageId: string; // this message; replies thread onto it
  from: string;
  name?: string;
  subject: string;
  text: string;
  at: number;
  paying?: boolean;
}

export interface SupportCreds {
  inboundToken?: string; // the secret in the email webhook URL
  intercomClientSecret?: string; // checks Intercom's webhook signature
  intercomToken?: string; // lets a tapped Send post the reply into the Intercom conversation
  intercomAdminId?: string; // who the reply is from in Intercom
}

export interface SupportEnv extends KeyEnv {
  CACHE?: KVNamespace;
  // Worker secrets win over the connect page (operator's own map, local dev).
  SUPPORT_INBOUND_TOKEN?: string;
  INTERCOM_CLIENT_SECRET?: string;
  INTERCOM_TOKEN?: string;
  INTERCOM_ADMIN_ID?: string;
  // Outbound email for a tapped Send. Without them a sent reply lands in the outbox to copy.
  RESEND_API_KEY?: string;
  SUPPORT_FROM?: string; // "Shop support <support@example.com>"
  FAKE_SUPPORT?: string; // "1": the mine counts as connected with no keys (local dev, demos)
}

// Pasted keys are encrypted with the same master key as the other mines (credential-crypto.ts, PR #155),
// bound to this repo, and kept in KV: the D1 credentials table only takes sentry/posthog rows.
const credKey = (repo: string) => `cred:support:${repo.toLowerCase()}`;
const binding = (repo: string) => `support:${repo.toLowerCase()}`;

async function stored(env: SupportEnv, repo: string): Promise<SupportCreds> {
  const raw = await env.CACHE?.get<{ envelope?: Envelope }>(credKey(repo), "json").catch(() => null);
  if (!raw?.envelope) return {};
  return decryptCredential<SupportCreds>(env, binding(repo), raw.envelope).catch(() => ({}));
}

export async function supportCreds(env: SupportEnv, repo?: string | null): Promise<SupportCreds> {
  const own = repo ? await stored(env, repo) : {};
  return {
    inboundToken: env.SUPPORT_INBOUND_TOKEN || own.inboundToken,
    intercomClientSecret: env.INTERCOM_CLIENT_SECRET || own.intercomClientSecret,
    intercomToken: env.INTERCOM_TOKEN || own.intercomToken,
    intercomAdminId: env.INTERCOM_ADMIN_ID || own.intercomAdminId,
  };
}

export async function saveSupportCreds(env: SupportEnv, repo: string, patch: SupportCreds): Promise<SupportCreds> {
  if (!env.CACHE) throw new Error("no KV binding");
  const next = { ...(await stored(env, repo)), ...Object.fromEntries(Object.entries(patch).filter(([, v]) => v)) };
  await env.CACHE.put(credKey(repo), JSON.stringify({ envelope: await encryptCredential(env, binding(repo), next) }));
  return next;
}

/** The email inlet's token, made once per map when someone who can open it visits the connect page. */
export async function ensureInboundToken(env: SupportEnv, repo: string): Promise<string> {
  const creds = await supportCreds(env, repo);
  if (creds.inboundToken) return creds.inboundToken;
  const token = [...crypto.getRandomValues(new Uint8Array(20))].map((b) => b.toString(16).padStart(2, "0")).join("");
  await saveSupportCreds(env, repo, { inboundToken: token });
  return token;
}

export const supportWebhookUrl = (publicUrl: string, repo: string, token: string) => `${publicUrl}/webhooks/support/${repo.toLowerCase()}/${token}`;
export const intercomWebhookUrl = (publicUrl: string, repo: string) => `${publicUrl}/webhooks/intercom/${repo.toLowerCase()}`;

/** Constant-time compare for the URL token. */
export function tokenMatches(expected: string | undefined, supplied: string): boolean {
  if (!expected || expected.length !== supplied.length) return false;
  let diff = 0;
  for (let i = 0; i < expected.length; i++) diff |= expected.charCodeAt(i) ^ supplied.charCodeAt(i);
  return diff === 0;
}

/** Intercom signs the raw body: X-Hub-Signature: sha1=<hex HMAC-SHA1 with the app's client secret>. */
export async function verifyIntercom(secret: string | undefined, body: string, signature: string | null): Promise<boolean> {
  if (!secret || !signature?.startsWith("sha1=")) return false;
  const supplied = signature.slice(5);
  if (!/^[0-9a-f]{40}$/i.test(supplied)) return false;
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey("raw", enc.encode(secret), { name: "HMAC", hash: "SHA-1" }, false, ["sign"]);
  const expected = new Uint8Array(await crypto.subtle.sign("HMAC", key, enc.encode(body)));
  let diff = 0;
  for (let i = 0; i < expected.length; i++) diff |= expected[i] ^ Number.parseInt(supplied.slice(i * 2, i * 2 + 2), 16);
  return diff === 0;
}

// ---------- normalizing ----------

const EMAIL_RE = /^[^\s@<>]{1,64}@[^\s@<>]{1,255}$/;

/** "Dana Ko <dana@example.com>" → { email, name } */
export function parseAddress(raw: string | undefined): { email?: string; name?: string } {
  if (!raw) return {};
  const angle = raw.match(/^\s*"?([^"<]*?)"?\s*<([^>]+)>\s*$/);
  const email = (angle ? angle[2] : raw).trim().toLowerCase();
  const name = angle?.[1]?.trim() || undefined;
  return EMAIL_RE.test(email) ? { email, name } : {};
}

/** Customer text only: no quoted history, no signature, no HTML, bounded. */
export function cleanBody(text: string): string {
  const lines: string[] = [];
  for (const line of text.replace(/\r\n?/g, "\n").split("\n")) {
    if (/^>/.test(line.trim())) break;
    if (/^On .{4,200} wrote:\s*$/.test(line.trim())) break;
    if (/^-- ?$/.test(line)) break;
    if (/^-{2,}\s*Original Message\s*-{2,}/i.test(line.trim())) break;
    lines.push(line);
  }
  return lines.join("\n").replace(/\n{3,}/g, "\n\n").trim().slice(0, 4000);
}

export function stripHtml(html: string): string {
  return html
    .replace(/<br\s*\/?>/gi, "\n").replace(/<\/p>/gi, "\n\n").replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;/g, "'");
}

const normSubject = (s: string) => s.replace(/^\s*((re|fwd?|aw)\s*:\s*)+/i, "").trim().toLowerCase();
const idPart = (s: string | undefined) => s?.trim().replace(/^<|>$/g, "").slice(0, 300) || undefined;

interface EmailPayload {
  // generic
  from?: string; name?: string; subject?: string; text?: string; html?: string;
  messageId?: string; inReplyTo?: string; references?: string; date?: string; paying?: boolean; // inReplyTo/references: accepted, not needed
  // Postmark inbound
  From?: string; FromName?: string; FromFull?: { Email?: string; Name?: string }; Subject?: string;
  TextBody?: string; HtmlBody?: string; StrippedTextReply?: string; MessageID?: string; Date?: string;
  Headers?: { Name?: string; Value?: string }[];
}

/** Postmark inbound JSON or the generic { from, subject, text } shape. */
export function normalizeEmail(payload: unknown, now = Date.now()): SupportMessage | null {
  const p = payload as EmailPayload;
  if (!p || typeof p !== "object") return null;
  const header = (name: string) => p.Headers?.find((h) => h.Name?.toLowerCase() === name)?.Value;
  const addr = p.FromFull?.Email ? { email: parseAddress(p.FromFull.Email).email, name: p.FromFull.Name } : parseAddress(p.from ?? p.From);
  if (!addr.email) return null;
  const raw = p.StrippedTextReply || p.text || p.TextBody || (p.html || p.HtmlBody ? stripHtml(p.html ?? p.HtmlBody ?? "") : "");
  const text = cleanBody(raw);
  const subject = (p.subject ?? p.Subject ?? "").trim().slice(0, 300) || "(no subject)";
  if (!text && subject === "(no subject)") return null;
  const messageId = idPart(p.messageId ?? header("message-id") ?? p.MessageID) ?? `${addr.email}:${now}`;
  return {
    channel: "email",
    // Mail clients drop References often enough that it can't be the key: same sender + same subject
    // (minus Re:/Fwd:) is the same conversation. Replies still thread on the newest Message-ID.
    threadId: `${addr.email}|${normSubject(subject)}`,
    messageId,
    from: addr.email,
    name: (p.name ?? p.FromName ?? addr.name)?.slice(0, 80) || undefined,
    subject,
    text: text || subject,
    at: Date.parse(p.date ?? p.Date ?? "") || now,
    paying: p.paying === true ? true : undefined,
  };
}

interface IntercomAuthor { type?: string; id?: string; email?: string; name?: string }
interface IntercomPart { part_type?: string; body?: string | null; author?: IntercomAuthor; created_at?: number; id?: string }
interface IntercomPayload {
  type?: string; topic?: string; id?: string; created_at?: number;
  data?: { item?: {
    type?: string; id?: string | number; title?: string | null; created_at?: number; updated_at?: number;
    source?: { id?: string; subject?: string | null; body?: string | null; author?: IntercomAuthor };
    conversation_parts?: { conversation_parts?: IntercomPart[] };
    custom_attributes?: Record<string, unknown>;
  } };
}

export const INTERCOM_TOPICS = ["conversation.user.created", "conversation.user.replied"];

export function normalizeIntercom(payload: unknown, now = Date.now()): SupportMessage | null {
  const p = payload as IntercomPayload;
  const conv = p?.data?.item;
  if (!p?.topic || !INTERCOM_TOPICS.includes(p.topic) || !conv || conv.type !== "conversation" || conv.id == null) return null;
  const id = String(conv.id);
  if (!/^[\w-]{1,60}$/.test(id)) return null;
  // The newest customer part on a reply; the opening message on a new conversation.
  const parts = (conv.conversation_parts?.conversation_parts ?? []).filter((x) => (x.author?.type === "user" || x.author?.type === "lead" || x.author?.type === "contact") && x.body);
  const latest = p.topic === "conversation.user.replied" ? parts[parts.length - 1] : undefined;
  const author = latest?.author ?? conv.source?.author;
  const body = cleanBody(stripHtml(latest?.body ?? conv.source?.body ?? ""));
  if (!body) return null;
  const from = author?.email && EMAIL_RE.test(author.email) ? author.email.toLowerCase() : `intercom:${author?.id ?? "visitor"}`;
  const subject = stripHtml(conv.title ?? conv.source?.subject ?? "").trim().slice(0, 300) || body.split("\n")[0].slice(0, 80);
  const at = ((latest?.created_at ?? conv.updated_at ?? conv.created_at ?? p.created_at) ?? 0) * 1000 || now;
  return {
    channel: "intercom",
    threadId: id,
    messageId: latest?.id ? `${id}:${latest.id}` : `${id}:${conv.source?.id ?? "open"}`,
    from,
    name: author?.name?.slice(0, 80) || undefined,
    subject,
    text: body,
    at,
  };
}

// ---------- status + fakes ----------

export function supportStatus(creds: SupportCreds, publicUrl: string, repo: string | null | undefined, fake = false): SourceStatus {
  const email = !!creds.inboundToken, intercom = !!creds.intercomClientSecret;
  const connected = fake || email || intercom;
  const via = fake ? "fake mode" : [email && "email", intercom && "Intercom"].filter(Boolean).join(" + ");
  return {
    kind: "email",
    state: connected ? "connected" : "needs_action",
    detail: connected ? `Support mine open (${via}). Customer messages show up as mail at the support well; you send every reply.` : "Connect your support inbox or Intercom so customer messages become ore, with replies drafted for you to send.",
    eventsToday: 0,
    setup: {
      steps: [
        "Email: point your inbound-email service (Postmark inbound, or anything that POSTs JSON) at the URL on the connect page, or forward your support inbox to it.",
        "Intercom: Developer Hub → your app → Webhooks. Topics conversation.user.created and conversation.user.replied. Paste the client secret (and an access token to send replies) on the connect page.",
        "Nothing is ever sent to a customer until you tap Send on the draft.",
      ],
      actionUrl: `${publicUrl}/connect/support${repo ? `?repo=${encodeURIComponent(repo)}` : ""}`,
    },
  };
}

/** Sample messages for tests, `bun run fake:support` and demos. */
export function fakeEmail(kind: "bug" | "feature" | "question" | "reply" = "bug"): EmailPayload {
  const base = { from: "Dana Ko <dana@example.com>", date: new Date().toISOString() };
  if (kind === "feature") return { ...base, from: "Sam Ortiz <sam@example.com>", subject: "Could you add order notes?", text: "Love the shop! Would be great if I could leave a note for the baker when I order.\n\nThanks,\nSam", messageId: "<feature-1@example.com>" };
  if (kind === "question") return { ...base, from: "Lee Park <lee@example.com>", subject: "Do you ship to Canada?", text: "Hi, do you ship to Canada and how long does it take?", messageId: "<question-1@example.com>" };
  if (kind === "reply") return { ...base, subject: "Re: Checkout broke, I can't pay", text: "Still broken this morning, tried two cards.\n\nOn Mon, Oct 26, 2026 at 9:00 AM Shop wrote:\n> Thanks, we're on it", messageId: "<bug-2@example.com>", inReplyTo: "<bug-1@example.com>", references: "<bug-1@example.com>" };
  return { ...base, subject: "Checkout broke, I can't pay", text: "Hi, I tried to pay for my order and the checkout page just goes blank after I hit Pay. Empty cart error? I have 3 items in my cart.\n\nDana", messageId: "<bug-1@example.com>", paying: true };
}

export function fakeIntercom(topic = "conversation.user.created", conversationId = "1911"): IntercomPayload {
  const author = { type: "user", id: "u-77", email: "rio@example.com", name: "Rio" };
  const replied = topic === "conversation.user.replied";
  return {
    type: "notification_event", topic, id: `notif_${conversationId}_${replied ? 2 : 1}`, created_at: Math.floor(Date.now() / 1000),
    data: { item: {
      type: "conversation", id: conversationId, title: null, created_at: Math.floor(Date.now() / 1000) - 60, updated_at: Math.floor(Date.now() / 1000),
      source: { id: "src-1", subject: "", body: "<p>The discount code SAVE10 says invalid but the email says it's good till Friday?</p>", author },
      conversation_parts: { conversation_parts: replied ? [{ id: "part-9", part_type: "comment", body: "<p>Tried again, still says invalid.</p>", author, created_at: Math.floor(Date.now() / 1000) }] : [] },
    } },
  };
}
