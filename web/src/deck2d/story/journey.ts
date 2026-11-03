// One issue, start to finish (Justin, 2026-11-03, for the demo video: "here's a GitHub issue and then it's pushed through
// your repo and then it gets built out... we show each piece of this"). The whole line is already built; one crate rides
// Repo → Planner → Builder → Checks → Review → Gate → Launch and Shippy asks at the four calls that are yours: start it,
// the plan, the review, and the held Ship it. Same machinery as the guest tour (tour.ts + ship.ts). Opened by ?journey=1.
import { STOPS } from "../contract";
import type { Beat, TourScript } from "./tour";

export const JOURNEY_BEATS: Beat[] = [
  { title: "A new issue from GitHub", line: "The docs link to the shipping page is broken. Want me to start on it?", yes: "Start it", at: "repo", pose: "point",
    then: { roll: true, to: "planner" } },
  { title: "Here's my plan", line: "Fix the link in docs/STORE.md so it points to SHIPPING.md. One file, docs only. Build it?", yes: "Build it", at: "planner", pose: "talk",
    then: { roll: true, to: "review" } },
  { title: "Approve the fix?", line: "Codex wrote it and opened a pull request. Your checks passed. The shipping link works now.", yes: "Approve", at: "review", pose: "point",
    then: { roll: true, to: "gate" } },
  { title: "Ship it?", line: "The pull request is ready to merge. Press and hold to ship it to your users.", yes: "Hold to ship", at: "gate", hold: true,
    then: { ship: true } },
  { title: "Shipped!", line: "Merged on GitHub and live. One issue in, one fix out, and you made every call.", yes: "Again", at: "launch", pose: "happy" },
];

export const JOURNEY: TourScript = {
  beats: JOURNEY_BEATS,
  built: [...STOPS],
  crate: "repo",
  dwell: { builder: 3, checks: 2 }, // the code gets written and the checks run: long enough to read the caption
  loop: true,
};
