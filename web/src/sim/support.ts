// The support well in the sim (?source=sim&scenario=support): the same tickets, drafts and rules as the live
// server (server/src/support.ts), scripted. Mail comes up the well, the planner sorts it and links it to work on
// the floor, drafts a reply, and only the player's tap sends it. When a linked fix launches, an "it's fixed"
// draft waits for the next tap.

import type { Item, Move, SupportChannel, SupportKind, SupportTicket } from "@shiptorio/shared";

export interface SimMail {
  at: number; // tick it lands
  channel: SupportChannel;
  from: string;
  name?: string;
  subject: string;
  body: string;
  paying?: boolean;
  // what the planner decides, scripted
  kind: SupportKind;
  district: string;
  summary: string;
  linkTo?: string; // title of an item on the floor this is about
  reason: string;
  reply: string; // the drafted answer
  fixed?: string; // the "it's fixed" reply, drafted when the linked work launches
  fileAs?: string; // a bug nothing covers yet: filing it puts this ore on the belt
}

export interface SupportHooks {
  tick: () => number;
  state: () => { items: Item[]; support?: SupportTicket[]; metrics?: { customersAnswered: number } };
  setSupport: (tickets: SupportTicket[]) => void;
  itemId: (title: string) => string | undefined;
  think: (tool: string, text: string, reason: string, opts: { itemId?: string }) => void;
  log: (level: "info" | "success" | "warn", text: string, itemId?: string) => void;
  propose: (move: Omit<Move, "id" | "createdAt">, then: (optionId: string) => void) => string;
  retract: (moveId: string) => void;
  fileIssue: (title: string, district: string) => string; // returns the new item id
  answered: () => void;
}

const TRIAGE_TICKS = 2, DRAFT_TICKS = 1;

/** Same idea as the server's draft hash: Send names the exact text on screen. */
export function simHash(id: string, text: string): string {
  let h = 2166136261;
  for (const ch of `${id}\n${text}`) h = Math.imul(h ^ ch.charCodeAt(0), 16777619);
  return (h >>> 0).toString(16);
}

const quote = (s: string, n: number) => (s.length > n ? `${s.slice(0, n - 1).trimEnd()}…` : s);
const first = (t: SupportTicket) => t.name?.split(/\s+/)[0] ?? t.from.split("@")[0];

export function simSupport(mails: SimMail[], h: SupportHooks) {
  const script = [...mails].sort((a, b) => a.at - b.at);
  const plan = new Map<string, SimMail>(); // ticket id -> its script
  const since = new Map<string, number>(); // ticket id -> tick it entered its state
  const cards = new Map<string, string[]>(); // ticket id -> open move ids
  let seq = 0;

  const tickets = () => h.state().support ?? [];
  const put = (t: SupportTicket) => {
    since.set(t.id, h.tick());
    h.setSupport([t, ...tickets().filter((x) => x.id !== t.id)]);
  };
  const get = (id: string) => tickets().find((t) => t.id === id);
  const clearCards = (id: string) => {
    for (const m of cards.get(id) ?? []) h.retract(m);
    cards.delete(id);
  };

  const offer = (t: SupportTicket) => {
    clearCards(t.id);
    const ids: string[] = [];
    if (t.state === "drafted" && t.draft) {
      const fixed = t.draft.purpose === "fixed";
      ids.push(h.propose({
        title: fixed ? `Tell ${first(t)} it's fixed?` : `Send this reply to ${first(t)}?`,
        why: `${t.triage?.summary ?? t.subject}${t.paying ? " (paying customer)" : ""}. Draft: “${quote(t.draft.text.replace(/\s+/g, " "), 180)}”`,
        stage: "impact", kind: "reply", focus: "ore-inbox", grows: fixed ? ["+1 CUSTOMER ANSWERED"] : [],
        plan: [fixed ? "Sends the “it's fixed” reply above, exactly as written." : "Sends the reply above, exactly as written.", "Nothing else is sent."],
        options: [
          { id: "send", label: "Send reply", recommended: true, actions: [{ tool: "send_customer_reply", args: { ticketId: t.id, draftHash: t.draft.hash }, reason: "You read the draft and chose to send it." }] },
          { id: "later", label: "Edit first", recommended: false, actions: [] },
        ],
      }, (opt) => { if (opt === "send") sendReply(t.id, t.draft!.hash); }));
    }
    if (t.triage?.kind === "bug" && !t.triage.linkedItemId && !t.issue && t.state !== "closed") {
      ids.push(h.propose({
        title: `File ${first(t)}'s bug as an issue?`,
        why: `${t.triage.summary}. Nothing in the factory covers it yet. Filing it puts it on the belt.`,
        stage: "intake", kind: "input", focus: "ore-inbox", grows: ["+1 ORE"],
        plan: ["Opens an issue with the summary and the customer's words (no email or name).", "When the fix launches you'll get an “it's fixed” reply to send."],
        options: [
          { id: "file", label: "File the issue", recommended: true, actions: [{ tool: "file_support_issue", args: { ticketId: t.id }, reason: "A customer hit a bug the factory isn't tracking." }] },
          { id: "skip", label: "Not a bug", recommended: false, actions: [] },
        ],
      }, (opt) => { if (opt === "file") fileIssue(t.id); }));
    }
    cards.set(t.id, ids);
  };

  const draft = (t: SupportTicket, text: string, purpose: "answer" | "fixed", by: "spark" | "player" = "spark"): SupportTicket => ({
    ...t, state: "drafted", draft: { text, hash: simHash(t.id, text), purpose, by, at: Date.now() },
  });

  function sendReply(id: string, hash: string) {
    const t = get(id);
    // Same rule as the server: a tap only sends the exact draft it was made on.
    if (!t?.draft || t.state !== "drafted" || t.draft.hash !== hash) return h.log("warn", "That draft changed. Read it again and tap Send.", id);
    const purpose = t.draft.purpose, kind = t.triage?.kind;
    const tracked = !!t.triage?.linkedItemId || !!t.issue;
    const done = purpose === "fixed" || !(kind === "bug" || kind === "feature") || !tracked;
    clearCards(id);
    put({ ...t, state: done ? "answered" : "waiting_fix", draft: undefined, sent: [...t.sent, { at: Date.now(), purpose, via: t.channel }] });
    h.log("success", `Reply sent to ${first(t)} ${t.channel === "intercom" ? "in Intercom" : "by email"}${done ? "." : ". You'll get an “it's fixed” draft when the fix launches."}`);
    if (done) h.answered();
    // An open bug still gets its file-it card after the answer goes out.
    const after = get(id);
    if (after) offer(after);
  }

  function fileIssue(id: string) {
    const t = get(id), mail = plan.get(id);
    if (!t || t.issue || !mail) return;
    const itemId = h.fileIssue(mail.fileAs ?? t.triage?.summary ?? t.subject, t.triage?.district ?? mail.district);
    const n = 200 + ++seq;
    clearCards(id);
    put({ ...t, issue: { number: n, url: `https://github.com/sim/demo-shop/issues/${n}` }, triage: t.triage && { ...t.triage, linkedItemId: itemId }, state: t.state === "answered" ? "waiting_fix" : t.state });
    h.log("success", `Filed issue #${n} from ${first(t)}'s report. It's on the belt.`, itemId);
    const after = get(id);
    if (after) offer(after);
  }

  return {
    tick() {
      const now = h.tick();
      while (script.length && script[0].at <= now) {
        const m = script.shift()!;
        const id = `sup-${++seq}`;
        plan.set(id, m);
        put({ id, channel: m.channel, thread: id, from: m.from, name: m.name, subject: m.subject, body: m.body, messages: 1, receivedAt: Date.now(), paying: m.paying, state: "new", sent: [] });
        h.log("info", `Mail at the support well: ${m.subject}`);
      }
      for (const t of tickets()) {
        const m = plan.get(t.id);
        if (!m) continue;
        const age = now - (since.get(t.id) ?? now);
        if (t.state === "new" && !t.triage && age >= TRIAGE_TICKS) {
          const linked = m.linkTo ? h.itemId(m.linkTo) : undefined;
          h.think("read_feedback", `${m.kind} → ${m.district}${linked ? `, same as “${m.linkTo}”` : ""}`, m.reason, { itemId: linked });
          put({ ...t, triage: { kind: m.kind, district: m.district, summary: m.summary, reason: m.reason, linkedItemId: linked, by: "spark" } });
        } else if (t.state === "new" && t.triage && age >= DRAFT_TICKS) {
          if (t.triage.kind === "spam") {
            put({ ...t, state: "closed" });
            h.log("info", "Spam at the support well: closed, nothing drafted.");
            continue;
          }
          h.think("draft_customer_reply", `Drafted a ${t.triage.kind} reply for you to send`, "Honest and short, no promised dates.", { itemId: t.triage.linkedItemId });
          const next = draft(t, m.reply, "answer");
          put(next);
          offer(next);
        } else if (t.state === "waiting_fix" && m.fixed && !t.sent.some((x) => x.purpose === "fixed")) {
          const item = h.state().items.find((i) => i.id === t.triage?.linkedItemId);
          if (item?.state !== "launched") continue;
          h.think("draft_customer_reply", `Drafted “it's fixed” for ${first(t)}`, `“${item.title}” just launched.`, { itemId: item.id });
          const next = draft(t, m.fixed, "fixed");
          put(next);
          offer(next);
          h.log("success", `“${item.title}” shipped. A reply telling ${first(t)} it's fixed is ready for you to send.`, item.id);
        }
      }
    },
    send: sendReply,
    edit(id: string, text: string) {
      const t = get(id);
      if (!t || t.state === "closed") return;
      const next = draft(t, text.trim(), t.draft?.purpose ?? "answer", "player");
      put(next);
      offer(next);
    },
    file: fileIssue,
    close(id: string) {
      const t = get(id);
      if (!t) return;
      clearCards(id);
      put({ ...t, state: "closed", draft: undefined });
    },
  };
}

// The scenario's mail: two bugs (one already on the floor, one nobody's tracking), a question, a feature ask
// that matches queued work, and spam.
export const SUPPORT_MAIL: SimMail[] = [
  {
    at: 4, channel: "email", from: "dana@example.com", name: "Dana Ko", paying: true,
    subject: "Checkout broke, I can't pay", body: "Hi, I tried to pay for my order and the checkout page just goes blank after I hit Pay. I have 3 items in my cart.\n\nDana",
    kind: "bug", district: "checkout", summary: "Checkout goes blank after Pay", linkTo: "TypeError: cart.total is undefined",
    reason: "Same route and same moment as the cart.total crash Sentry is reporting.",
    reply: "Hi Dana,\n\nSorry about that, and thanks for telling us. Checkout is crashing for some carts right now and we're already fixing it. We'll write back the moment it's out.\n\nThe team",
    fixed: "Hi Dana,\n\nGood news: the checkout fix just shipped. Your cart should go through now. Could you give it another try and tell us if anything still looks off?\n\nThe team",
  },
  {
    at: 7, channel: "email", from: "lee@example.com", name: "Lee Park",
    subject: "Do you ship to Canada?", body: "Hi, do you ship to Canada and how long does it usually take?",
    kind: "question", district: "docs", summary: "Asks if we ship to Canada", reason: "A shipping question, nothing broken.",
    reply: "Hi Lee,\n\nWe do ship to Canada. Orders usually arrive in 5 to 8 business days. Anything else, just reply here.\n\nThe team",
  },
  {
    at: 10, channel: "intercom", from: "rio@example.com", name: "Rio",
    subject: "SAVE10 says invalid", body: "The discount code SAVE10 says invalid but the email says it's good till Friday?",
    kind: "bug", district: "cart", summary: "SAVE10 code rejected before it expires", reason: "A valid code is refused; nothing on the floor covers coupons yet.",
    reply: "Hi Rio,\n\nThanks for flagging this. SAVE10 should still work, so that's a bug on our side. We're on it and will let you know when it's fixed.\n\nThe team",
    fixed: "Hi Rio,\n\nThe SAVE10 fix just shipped. The code works again until Friday. Thanks for your patience!\n\nThe team",
    fileAs: "SAVE10 coupon rejected before its end date",
  },
  {
    at: 13, channel: "email", from: "sam@example.com", name: "Sam Ortiz",
    subject: "Could you add order notes?", body: "Love the shop! Would be great if I could leave a note for the baker when I order.",
    kind: "feature", district: "cart", summary: "Wants a note field on orders", linkTo: "Add order notes to the cart", reason: "Matches the order notes feature already queued.",
    reply: "Hi Sam,\n\nThank you! Order notes are already on our list, so you're not alone. We'll let you know when they land.\n\nThe team",
    fixed: "Hi Sam,\n\nOrder notes just shipped. You'll see a note box in your cart now. Thanks for the nudge!\n\nThe team",
  },
  {
    at: 15, channel: "email", from: "deals@seo-blast.example", subject: "Boost your SEO 1000%", body: "Cheap SEO services, reply now.",
    kind: "spam", district: "/", summary: "SEO spam", reason: "Unsolicited marketing.", reply: "",
  },
];
