// Shippy's tutorial script: every line he says in the guided opening (Justin, 2026-10-29 20:51).
// Shippy first. Start on the smallest platform, zoomed in on him, and let him tell the story one card at a time,
// at the player's pace: who he is, that this game mirrors your GitHub repo, what powers him, then he builds each
// station and names it, the engine that powers the line, and finally "approve the PR at the Gate" and the rocket.
// Data only: no DOM, no timers. The first-run source (data/firstrun.ts) reads it and wires camera, build and pose.
// Readable copy: docs/context/tutorial-script.md. Station names are STOP_LABEL's words (web/test/station-names.test.ts).
import { CREDIT } from "../../copy";
import { STOP_LABEL, type ShippyPose, type StopId } from "../contract";

/** Where the camera sits for a card. A stop id = parked on that station; engine = the boiler bay at the left end. */
export type TutorialFocus = "shippy" | "deck" | "engine" | "rocket" | StopId;

export interface TutorialCard {
  id: string;
  focus: TutorialFocus;
  zoom: "close" | "mid" | "wide"; // close = Shippy fills the card's sky; wide = the whole platform
  pose: ShippyPose; // what Shippy is doing in the card (and on the deck) while the lines show
  /** What gets built as this card opens. Plays to the end before the card can be swiped (one thing moves at a time). */
  build?: StopId | "engine" | "island";
  deck?: "small" | "medium" | "large"; // grow the platform to this size first, if it isn't already
  lines: [string] | [string, string]; // one or two short lines, shown one under the other
  next: string; // the swipe-right / button label
  hold?: boolean; // ships code: needs a held press or a full swipe, never a flick
}

const S = STOP_LABEL;

export const TUTORIAL: readonly TutorialCard[] = [
  // 1. Meet Shippy
  { id: "hi", focus: "shippy", zoom: "close", pose: "peek", deck: "small",
    lines: ["Hi, I'm Shippy!", "Really nice to meet you."], next: "Hi Shippy" },
  { id: "game", focus: "shippy", zoom: "close", pose: "happy",
    lines: ["This is a game that mirrors your GitHub repo.", "What you decide here really happens there."], next: "Got it" },
  { id: "brain", focus: "shippy", zoom: "close", pose: "inspect",
    lines: [`I'm an AI agent, ${CREDIT}.`, "I'll suggest what to do next, one card at a time."], next: "Nice" },
  { id: "connect", focus: "shippy", zoom: "close", pose: "poke",
    lines: ["I learn from what you connect. GitHub first.", "Later, your issues and feedback too."], next: "Okay" },

  // 2. Software is a factory: Shippy builds the line, one station at a time, and names each one
  { id: "factory", focus: "deck", zoom: "wide", pose: "walking",
    lines: ["Software is a factory.", "Ideas go in one end. Shipped code comes out the other."], next: "Show me" },
  { id: "repo", focus: "repo", zoom: "mid", pose: "weld", build: "repo",
    lines: [`This is ${S.repo}.`, "Your GitHub issues land here."], next: "Next" },
  { id: "planner", focus: "planner", zoom: "mid", pose: "weld", build: "planner",
    lines: [`${S.planner}.`, "I read an issue and write a short plan."], next: "Next" },
  { id: "engine", focus: "engine", zoom: "mid", pose: "carry", build: "engine",
    lines: ["This steam engine powers the whole line.", "You'll power it with your own Codex or Muse Code."], next: "Next" },
  { id: "builder", focus: "builder", zoom: "mid", pose: "weld", build: "builder", deck: "medium",
    lines: [`${S.builder}.`, "Codex writes the code, on your computer."], next: "Next" },
  { id: "checks", focus: "checks", zoom: "mid", pose: "weld", build: "checks",
    lines: [`${S.checks}.`, "Your tests run here. Broken code stops."], next: "Next" },
  { id: "review", focus: "review", zoom: "mid", pose: "weld", build: "review", deck: "large",
    lines: [`${S.review}.`, "A second look before anything ships."], next: "Next" },
  { id: "gate", focus: "gate", zoom: "mid", pose: "weld", build: "gate",
    lines: [`${S.gate}.`, "Nothing merges until you say yes."], next: "Next" },
  { id: "launch", focus: "launch", zoom: "mid", pose: "inspect", build: "island",
    lines: [`${S.launch}.`, "Merged, and it's live. That's the goal."], next: "Next" },

  // 3. Ship one
  { id: "line", focus: "deck", zoom: "wide", pose: "happy",
    lines: ["That's your factory.", "When something glows yellow, it's waiting on you."], next: "Got it" },
  { id: "approve", focus: "gate", zoom: "mid", pose: "lever",
    lines: [`A PR is waiting at the ${S.gate}.`, "Approve it and I'll show you how shipping works."], next: "Approve", hold: true },
  { id: "rocket", focus: "rocket", zoom: "wide", pose: "happy",
    lines: ["Shipped! That's how it works.", "Now let's build yours."], next: "Pick my repo" },
];
