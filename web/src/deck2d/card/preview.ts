// Dev preview for the iron card: deals a little scripted deck, three trust dots toward automatic, then runs dry.
import type { CardView } from "../contract";
import { mountCard } from "./card";

const log = document.getElementById("log")!;
const DECK = (): CardView[] => [
  { id: "a", title: "Approve fix for checkout bug?", dots: { have: 0, need: 3 }, line: "Approve 2 more like this and it's automatic.", stop: "review" },
  { id: "b", title: "Approve fix for login typo?", dots: { have: 1, need: 3 }, line: "Approve 1 more like this and it's automatic.", stop: "review" },
  { id: "c", title: "Approve fix for broken link?", dots: { have: 2, need: 3 }, line: "Approve this one and it's automatic.", stop: "review" },
  { id: "d", title: "Connect your error tracker?", dots: null, line: "Then the factory sees bugs on its own.", stop: "repo", yes: "Connect", no: "Not now" } as CardView,
  { id: "e", title: "Ship the checkout fix?", dots: null, line: "This merges real code. Hold to ship.", stop: "launch", yes: "Ship it", hold: true } as CardView,
];
let deck = DECK();
const say = (s: string) => (log.textContent = s);
const card = mountCard(document.body, {
  onApprove(id) { say(`approved ${id}`); deck = deck.filter((c) => c.id !== id); setTimeout(() => card.show(deck[0] ?? null), 120); },
  onLater(id) { say(`later ${id}`); deck = deck.filter((c) => c.id !== id); setTimeout(() => card.show(deck[0] ?? null), 120); },
});
card.show(deck[0] ?? null);
document.getElementById("again")!.addEventListener("click", () => { deck = DECK(); card.show(deck[0]); });
