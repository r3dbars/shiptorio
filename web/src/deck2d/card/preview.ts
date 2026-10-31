// Dev preview for the iron card: deals a little scripted deck, three trust dots toward automatic, then runs dry.
// ?card=<id> shows just one of the real card kinds below (story, flow, setup, live) so every kind can be shot side by side.
import type { CardView } from "../contract";
import { mountCard } from "./card";

const log = document.getElementById("log")!;
const DECK = (): CardView[] => [
  { id: "a", title: "Approve fix for checkout bug?", dots: { have: 0, need: 3 }, line: "Approve 2 more like this and it's automatic.", stop: "review" },
  { id: "b", title: "Approve fix for login typo?", dots: { have: 1, need: 3 }, line: "Approve 1 more like this and it's automatic.", stop: "review" },
  { id: "c", title: "Approve fix for broken link?", dots: { have: 2, need: 3 }, line: "Approve this one and it's automatic.", stop: "review" },
  { id: "d", title: "Connect your error tracker?", dots: null, line: "Then the factory sees bugs on its own.", stop: "repo", yes: "Connect", no: "Not now" },
  { id: "e", title: "Ship the checkout fix?", dots: null, line: "This merges real code. Hold to ship.", stop: "launch", yes: "Ship it", hold: true },
];
// ?card=story-hi: the Shippy-first opening, a few story cards in a row (CardView.shippy)
const STORY = (): CardView[] => [
  { id: "s1", shippy: "wave", title: "", line: "Hi, I'm Shippy! Great to meet you.", dots: null, stop: "repo" },
  { id: "s2", shippy: "talk", title: "", line: "This game mirrors your GitHub repo. What you decide here really happens there.", dots: null, stop: "repo" },
  { id: "s3", shippy: "point", title: "Your software factory", line: "Software is a factory. Ideas come in on the left, shipped code goes out on the right.", dots: null, stop: "planner" },
  { id: "s4", shippy: "talk", title: "", line: "I'm powered by Meta's model. I'll read what you connect and suggest your next move.", dots: null, stop: "repo", no: "Skip" },
  { id: "s5", shippy: "happy", title: "", line: "Approve the PR waiting at the gate and I'll show you how shipping works.", dots: null, stop: "gate", yes: "Show me" },
];
// One of each kind the deck really deals, with the longest words those kinds use (story/, data/view.ts, data/connections.ts).
const KINDS: Record<string, CardView> = {
  story: DECK()[0],
  "story-end": { id: "story-end", title: "Start with your repo.", dots: null, line: "GitHub first. The rest lights up later.", stop: "repo", yes: "Sign in with GitHub", no: "Replay", setup: true },
  flow: { id: "flow", title: "Plan for #42: Checkout total ignores the coupon code", dots: { have: 1, need: 3 }, line: "Shippy: The total skips the discount when the cart has more than one item. Files: web/src/cart.ts Approve 2 more like this and it's automatic.", stop: "planner", yes: "Start build", no: "Later", guide: "shippy" },
  launch: { id: "launch", title: "Ship the checkout fix?", dots: null, line: "Shippy: Checks passed. This merges real code.", stop: "launch", yes: "Ship it", no: "Later", hold: true },
  "setup-power": { id: "connection-setup-power", title: "Connect your coding engine", dots: null, line: "Shippy: Connect the local runner to use your Codex or Meta Muse Code subscription. Connecting never starts a coding job.", stop: "builder", yes: "Set up engine", no: "Close", setup: true },
  "setup-copy": { id: "connection-setup-copy", title: "Connect your Codex or Muse Code subscription", dots: null, line: "Copy this into Terminal: curl -fsSL https://shiptorio.dev/runner/install.sh | sh -s -- --join 7f3a9c2e1b4d5f60a8b7c6d5e4f3a2b1", stop: "builder", yes: "Copy setup", no: "Check", setup: true },
  "setup-github": { id: "connection-setup-github", title: "Connect your GitHub repo", dots: null, line: "Install the GitHub App on one repo so Shippy can read its issues. This card updates by itself.", stop: "repo", yes: "Connect GitHub", no: "Close", setup: true },
  "setup-busy": { id: "connection-setup-busy", title: "Finding your repositories…", dots: null, line: "This should only take a moment.", stop: "repo", yes: "Please wait…", no: "Close", setup: true },
  "setup-issue": { id: "connection-setup-issue", title: "#128: Search results flicker when you type fast on a slow phone", dots: null, line: "r3dbars/testing · 1 of 12. Typing quickly in the search box makes the list jump between old and new results before it settles… Start issue prepares a plan. Your engine waits for your approval.", stop: "repo", yes: "Start issue", no: "Next", setup: true },
  signin: { id: "connection-signin", title: "Sign in to your factory", dots: null, line: "Sign in with GitHub to choose your repository. No coding starts yet.", stop: "repo", yes: "Sign in", no: "Close", setup: true },
  "story-wave": STORY()[0],
  "story-point": STORY()[2],
  "story-skip": STORY()[3],
  // the longest beat the guest tour deals (story/tour.ts)
  "story-long": { id: "story-long", shippy: "talk", title: "Powered by Meta", line: "Meta's model is my brain. I'll cheer you on and suggest what to do next, based on what you connect: GitHub first, then issues and feedback.", dots: null, stop: "repo", no: "Back" },
  live: { id: "live", title: "Approve fix for checkout bug?", dots: { have: 2, need: 3 }, line: "Approve this one and it's automatic.", stop: "review", yes: "Continue", no: "Later" },
};
const only = new URLSearchParams(location.search).get("card");
let deck = only === "empty" ? [] : only === "story-hi" ? STORY() : only && KINDS[only] ? [KINDS[only]] : DECK();
const say = (s: string) => (log.textContent = s);
const card = mountCard(document.body, {
  onApprove(id) { say(`approved ${id}`); deck = deck.filter((c) => c.id !== id); setTimeout(() => card.show(deck[0] ?? null), 120); },
  onLater(id) { say(`later ${id}`); deck = deck.filter((c) => c.id !== id); setTimeout(() => card.show(deck[0] ?? null), 120); },
});
if (only === "empty") {
  // "All caught up" only shows right after an answer, so answer a throwaway card first
  card.show(KINDS.story);
  setTimeout(() => window.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowLeft" })), 50);
} else card.show(deck[0] ?? null);
document.getElementById("again")!.addEventListener("click", () => { deck = DECK(); card.show(deck[0]); });
