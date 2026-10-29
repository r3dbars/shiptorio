import { STOPS, type DeckSource, type ShippyView } from "../contract";

const JOBS: { seconds: number; at: ShippyView["at"]; pose: ShippyView["pose"]; caption: string }[] = [
  { seconds: 1.5, at: "corner", pose: "peek", caption: "Shippy is ready for a job." },
  { seconds: 5.5, at: "builder", pose: "carry", caption: "Carrying a beam to the Builder." },
  { seconds: 4, at: "builder", pose: "weld", caption: "Building the machine, one panel at a time." },
  { seconds: 2, at: "builder", pose: "inspect", caption: "Checking the finished work." },
  { seconds: 2.5, at: "checks", pose: "walking", caption: "Heading over to Checks." },
  { seconds: 3, at: "checks", pose: "poke", caption: "Tuning the inspection machine." },
  { seconds: 2.5, at: "review", pose: "walking", caption: "The review lever needs a hand." },
  { seconds: 3, at: "review", pose: "lever", caption: "Pulling the lever to keep work moving." },
  { seconds: 1.5, at: "review", pose: "happy", caption: "Job done." },
  { seconds: 8, at: "corner", pose: "walking", caption: "Back to the charging dock, ready for the next job." },
];

/** A repeatable visual rehearsal on the real deck; no external actions. */
export function createShippyRehearsal(): DeckSource & { paused: boolean; next(): void; reset(): void; rest(): void } {
  let job = 0, age = 0, resting = false;
  return {
    paused: false,
    step(dt) {
      if (this.paused || resting) return;
      age += dt;
      while (age >= JOBS[job].seconds) { age -= JOBS[job].seconds; job = (job + 1) % JOBS.length; }
    },
    view() {
      const current = JOBS[job];
      return {
        stops: STOPS.map(id => ({
          id, built: id !== "builder" || job >= 2,
          locked: id === "builder" && job < 2,
          state: id === current.at && job >= 2 && ["weld", "poke", "lever"].includes(current.pose) ? "working" : "idle",
          automated: false, items: [],
        })),
        jam: null, card: null, shipped: 0, caption: resting ? "Shippy is charging at home." : current.caption,
        shippy: resting ? { at: "corner", pose: "idle" } : { at: current.at, pose: current.pose },
      };
    },
    next() { resting = false; job = (job + 1) % JOBS.length; age = 0; },
    reset() { resting = false; job = 0; age = 0; },
    rest() { resting = true; this.paused = false; job = 0; age = 0; },
    approve() { this.next(); },
    later() { this.paused = !this.paused; },
  };
}
