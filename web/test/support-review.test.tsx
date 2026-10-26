import { expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { FactoryState, type SupportTicket } from "@shiptorio/shared";
import { SupportPanel, supportReviewTarget } from "../src/ui/SupportPanel";
import { replyMove } from "../../server/src/support";

test("a summary action only opens full review with the entire reply and destination", () => {
  const text = "A".repeat(220) + " FINAL CONTENT THE PLAYER MUST SEE";
  const ticket: SupportTicket = { id: "sup-review", channel: "email", thread: "mail", from: "customer@example.com", subject: "Help", body: "Question", messages: 1, receivedAt: 1, state: "drafted", sent: [], draft: { text, hash: "draft", purpose: "answer", by: "spark", at: 1 } };
  const card = replyMove(ticket)!;
  const review = { type: "choose_move" as const, moveId: card.id, optionId: card.options[0].id };
  expect(supportReviewTarget(review, [card])).toBe(ticket.id);
  expect(card.options.flatMap(option => option.actions).some(action => action.tool === "send_customer_reply")).toBe(false);
  const state = FactoryState.parse({ repo: "example/shop", baseBranch: "main", districts: [], machines: [], belts: [], power: [], items: [], science: { red: 0, green: 0, grey: 0, blue: 0 }, trust: 0, tick: 0, support: [ticket] });
  const html = renderToStaticMarkup(<SupportPanel state={state} send={() => { throw Error("Rendering must not send"); }} onClose={() => {}} reviewTicket={ticket.id} />);
  expect(html).toContain(text);
  expect(html).toContain("customer@example.com");
  expect(html).toContain("Send reply");
});
