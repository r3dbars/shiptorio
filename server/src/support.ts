// The support well's rules: customer messages fold into tickets, tickets get a triage and a drafted reply,
// and a reply reaches the customer only through deliverReply(), which needs a PlayerTap on that exact draft.
// The Factory mints a PlayerTap in exactly one place: a player's websocket message (send_reply, or Send on a
// reply card). No alarm, autonomy level, permit or Spark call can make one (test: support.test.ts).

import type { Item, Move, SupportDraft, SupportKind, SupportTicket } from "@shiptorio/shared";
import type { SupportCreds, SupportEnv, SupportMessage } from "./sources/support";

const KEEP = 60;

export async function draftHash(ticketId: string, text: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(`${ticketId}\n${text}`));
  return [...new Uint8Array(digest)].slice(0, 12).map((b) => b.toString(16).padStart(2, "0")).join("");
}

export async function makeDraft(ticketId: string, text: string, purpose: SupportDraft["purpose"], by: SupportDraft["by"], at = Date.now()): Promise<SupportDraft> {
  const clean = text.trim().slice(0, 4000);
  return { text: clean, hash: await draftHash(ticketId, clean), purpose, by, at };
}

export async function ticketId(m: Pick<SupportMessage, "channel" | "threadId">): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(`${m.channel}\n${m.threadId}`));
  return `sup-${[...new Uint8Array(digest)].slice(0, 6).map((b) => b.toString(16).padStart(2, "0")).join("")}`;
}

/** A new message opens a ticket or wakes its thread back up (a fresh triage and draft). Same message twice is a no-op. */
export async function foldMessage(tickets: SupportTicket[], m: SupportMessage, seen: string[]): Promise<{ tickets: SupportTicket[]; ticket?: SupportTicket; isNew: boolean }> {
  if (seen.includes(`${m.channel}:${m.messageId}`)) return { tickets, isNew: false };
  const id = await ticketId(m);
  const prev = tickets.find((t) => t.id === id);
  const ticket: SupportTicket = prev
    ? { ...prev, replyTo: m.messageId, body: m.text, messages: prev.messages + 1, receivedAt: m.at, paying: prev.paying || m.paying, name: prev.name ?? m.name, state: "new", draft: undefined }
    : { id, channel: m.channel, thread: m.threadId, from: m.from, name: m.name, subject: m.subject, body: m.text, messages: 1, receivedAt: m.at, paying: m.paying, state: "new", sent: [], replyTo: m.messageId };
  const rest = tickets.filter((t) => t.id !== id);
  return { tickets: trim([ticket, ...rest]), ticket, isNew: !prev };
}

/** Newest first; when full, drop the oldest finished threads before any open one. */
export function trim(tickets: SupportTicket[]): SupportTicket[] {
  if (tickets.length <= KEEP) return tickets;
  const done = (t: SupportTicket) => t.state === "answered" || t.state === "closed";
  const drop = new Set(tickets.filter(done).slice(-(tickets.length - KEEP)).map((t) => t.id));
  return tickets.filter((t) => !drop.has(t.id)).slice(0, KEEP);
}

/** The keyword rule that stands in when Spark can't answer. Logged as a fallback, never linked. */
export function heuristicSupport(subject: string, body: string, districts: string[]): { kind: SupportKind; district: string; summary: string } {
  const text = `${subject}\n${body}`.toLowerCase();
  const kind: SupportKind = /unsubscribe|viagra|crypto giveaway|seo services/.test(text) ? "spam"
    : /broke|broken|crash|error|bug|blank|doesn'?t work|not working|can'?t|cannot|invalid|fail/.test(text) ? "bug"
      : /would (be|love)|could you add|feature|wish|please add|it'?d be (great|nice)/.test(text) ? "feature"
        : /\?/.test(text) ? "question"
          : /thank|love|great|awesome/.test(text) ? "praise" : "question";
  const district = districts.find((d) => d !== "/" && new RegExp(`\\b${d.toLowerCase().replace(/[^a-z0-9]/g, "")}`).test(text)) ?? "/";
  return { kind, district, summary: subject.replace(/^\s*(re|fwd?)\s*:\s*/i, "").slice(0, 140) };
}

export function fallbackDraft(t: Pick<SupportTicket, "name">, kind: SupportKind, purpose: SupportDraft["purpose"]): string {
  const hi = `Hi${t.name ? ` ${t.name.split(/\s+/)[0]}` : ""},`;
  const body = purpose === "fixed" ? "Good news: the fix for this just shipped. Could you give it another try and let us know if anything still looks off?"
    : kind === "bug" ? "Thanks for telling us, and sorry about that. We can see the problem and we're on it. We'll write back as soon as the fix is out."
      : kind === "feature" ? "Thanks for the idea! It's on our list. We can't promise when, but we read every one of these."
        : kind === "praise" ? "Thank you, that made our day."
          : "Thanks for reaching out. We'll look into this and get back to you shortly.";
  return `${hi}\n\n${body}\n\nThe team`;
}

/** Spark only links to work that's still in the factory or just shipped. */
export function linkCandidates(items: Item[]) {
  return items.filter((i) => i.state !== "launched" || (i.orbit?.state === "watching")).slice(0, 30).map((i) => ({ id: i.id, title: i.title, district: i.district, source: i.source, state: i.state }));
}

// ---------- cards ----------

export const replyMoveId = (t: SupportTicket) => `support:reply:${t.id}`;
export const issueMoveId = (t: SupportTicket) => `support:issue:${t.id}`;
const who = (t: SupportTicket) => t.name?.split(/\s+/)[0] || (t.from.includes("@") ? t.from.split("@")[0] : "the customer");
const quote = (s: string, n: number) => (s.length > n ? `${s.slice(0, n - 1).trimEnd()}…` : s);

/** "Send this reply to Dana?" The only action is the player's tap; its args pin the draft they're reading. */
export function replyMove(t: SupportTicket, now = Date.now()): Move | null {
  if (!t.draft || (t.state !== "drafted")) return null;
  const fixed = t.draft.purpose === "fixed";
  return {
    id: replyMoveId(t),
    kind: "reply",
    stage: "impact",
    title: fixed ? `Tell ${who(t)} it's fixed?` : `Send this reply to ${who(t)}?`,
    why: `${t.triage?.summary ?? t.subject}${t.paying ? " (paying customer)" : ""}. Draft: “${quote(t.draft.text.replace(/\s+/g, " "), 180)}”`,
    focus: "ore-inbox",
    grows: fixed ? ["+1 CUSTOMER ANSWERED"] : [],
    plan: [fixed ? "Sends the “it's fixed” reply above, exactly as written." : "Sends the reply above, exactly as written.", `Goes to ${t.channel === "intercom" ? "their Intercom conversation" : "their email thread"}. Nothing else is sent.`],
    createdAt: now,
    options: [
      { id: "send", label: "Send reply", recommended: true, actions: [{ tool: "send_customer_reply", args: { ticketId: t.id, draftHash: t.draft.hash }, reason: "You read the draft and chose to send it." }] },
      { id: "later", label: "Edit first", recommended: false, actions: [] },
    ],
  };
}

/** A bug nobody's tracking yet: file it so the factory can build the fix. */
export function issueMove(t: SupportTicket, now = Date.now()): Move | null {
  if (t.triage?.kind !== "bug" || t.triage.linkedItemId || t.issue || t.state === "closed") return null;
  return {
    id: issueMoveId(t),
    kind: "input",
    stage: "intake",
    title: `File ${who(t)}'s bug as an issue?`,
    why: `${t.triage.summary}. Nothing in the factory covers it yet. Filing it puts it on the belt.`,
    focus: "ore-inbox",
    grows: ["+1 ORE"],
    plan: ["Opens a GitHub issue with the summary and the customer's words (email and name left out).", "The factory picks it up like any issue; when the fix launches you'll get an “it's fixed” reply to send."],
    createdAt: now,
    options: [
      { id: "file", label: "File the issue", recommended: true, actions: [{ tool: "file_support_issue", args: { ticketId: t.id }, reason: "A customer hit a bug the factory isn't tracking." }] },
      { id: "skip", label: "Not a bug", recommended: false, actions: [] },
    ],
  };
}

/** The issue a customer's bug becomes. No address, no name, phone numbers and emails scrubbed from their words. */
export function issueFor(t: SupportTicket): { title: string; body: string } {
  const scrub = (s: string) => s.replace(/[^\s@<>]+@[^\s@<>]+/g, "[email]").replace(/\+?\d[\d\s().-]{7,}\d/g, "[number]");
  const words = scrub(t.body).split("\n").map((l) => `> ${l}`).join("\n");
  return {
    title: (t.triage?.summary ?? t.subject).slice(0, 200),
    body: `A customer reported this through ${t.channel === "intercom" ? "Intercom" : "support email"}${t.messages > 1 ? ` (${t.messages} messages)` : ""}${t.paying ? ", a paying customer" : ""}.\n\n${words}\n\n_Filed from the Shiptorio support well (${t.id}). Customer details stay in Shiptorio; when this ships, the factory drafts a reply for the team to send._`,
  };
}

// ---------- the only way out ----------

declare const tapBrand: unique symbol;
/** Proof a player tapped Send on one exact draft. Only the Factory's websocket handler makes these. */
export type PlayerTap = { readonly [tapBrand]: true; ticketId: string; draftHash: string; login: string; at: number };
export const playerTap = (ticketId: string, draftHash: string, login: string): PlayerTap => ({ ticketId, draftHash, login, at: Date.now() }) as PlayerTap;

export type Outbound = (req: { url: string; init: RequestInit }) => Promise<Response>;

export interface Delivery { via: "email" | "intercom" | "outbox"; ok: boolean; error?: string }

/**
 * Sends one reply, only for a tap on this ticket's current draft. Intercom threads reply through the Intercom API,
 * email goes out through Resend when a key is set, and otherwise the reply lands in the outbox (marked, not lost).
 */
export async function deliverReply(env: SupportEnv, creds: SupportCreds, t: SupportTicket, tap: PlayerTap, send: Outbound = ({ url, init }) => fetch(url, init)): Promise<Delivery> {
  if (!tap || tap.ticketId !== t.id || !t.draft || tap.draftHash !== t.draft.hash || t.state !== "drafted") return { via: "outbox", ok: false, error: "That draft changed. Read it again and tap Send." };
  const text = t.draft.text;
  if (t.channel === "intercom") {
    const thread = intercomThread(t);
    if (!thread || !creds.intercomToken || !creds.intercomAdminId) return { via: "outbox", ok: true };
    const res = await send({ url: `https://api.intercom.io/conversations/${encodeURIComponent(thread)}/reply`, init: {
      method: "POST",
      headers: { authorization: `Bearer ${creds.intercomToken}`, "content-type": "application/json", accept: "application/json", "intercom-version": "2.11" },
      body: JSON.stringify({ message_type: "comment", type: "admin", admin_id: creds.intercomAdminId, body: text.replace(/\n/g, "<br>") }),
    } });
    return res.ok ? { via: "intercom", ok: true } : { via: "intercom", ok: false, error: `Intercom said ${res.status}` };
  }
  if (!env.RESEND_API_KEY || !env.SUPPORT_FROM || !t.from.includes("@")) return { via: "outbox", ok: true };
  const res = await send({ url: "https://api.resend.com/emails", init: {
    method: "POST",
    headers: { authorization: `Bearer ${env.RESEND_API_KEY}`, "content-type": "application/json" },
    body: JSON.stringify({ from: env.SUPPORT_FROM, to: [t.from], subject: /^re:/i.test(t.subject) ? t.subject : `Re: ${t.subject}`, text, ...(t.replyTo?.includes("@") ? { headers: { "In-Reply-To": `<${t.replyTo}>`, References: `<${t.replyTo}>` } } : {}) }),
  } });
  return res.ok ? { via: "email", ok: true } : { via: "email", ok: false, error: `Email provider said ${res.status}` };
}

const intercomThread = (t: SupportTicket) => t.thread && /^[\w-]{1,60}$/.test(t.thread) ? t.thread : undefined;
