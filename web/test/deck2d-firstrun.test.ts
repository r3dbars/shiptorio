import { expect, test } from "bun:test";
import { STOPS, type DeckView, type StopId } from "../src/deck2d/contract";
import { FIRST_RUN_LINES, createFirstRun, type FirstRunStage } from "../src/deck2d/data/firstrun";

// The live page under the first run: every station standing and a setup card up.
const base = (): DeckView => ({
  stops: STOPS.map(id => ({ id, built: true, state: "idle", automated: false, items: id === "review" ? [{ id: "x", title: "Sample", look: "plain" }] : [] })),
  jam: null, card: { id: "connection-1", title: "Sign in to your factory", line: "", dots: null, stop: "repo" },
  shippy: { pose: "inspect", at: "repo" }, shipped: 0, caption: null,
});
const memory = () => { const m = new Map<string, string>(); return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v) }; };
const builtOf = (v: DeckView) => v.stops.filter(s => s.built).map(s => s.id);

function play(stage: () => FirstRunStage, store = memory(), toured = false) {
  const fr = createFirstRun({ stage, store, key: "me/repo", toured });
  const seen: { caption: string | null; built: StopId[]; card: boolean; focus?: StopId }[] = [];
  const run = (limit = 80) => { for (let t = 0; t < limit && (t === 0 || fr.playing()); t += 0.1) { fr.step(0.1); const v = fr.view(base()); seen.push({ caption: v.caption, built: builtOf(v), card: !!v.card, focus: (v as DeckView & { focus?: StopId }).focus }); } };
  return { fr, seen, run, store };
}

test("intro: a guest's sample stays up while Shippy says hi, then the sign-in card", () => {
  const { fr, seen, run } = play(() => "intro");
  run();
  expect(fr.playing()).toBe(false);
  expect([...new Set(seen.map(s => s.caption).filter(Boolean))]).toEqual([FIRST_RUN_LINES.hi, FIRST_RUN_LINES.yours]);
  expect(seen.every(s => s.built.length === STOPS.length)).toBe(true); // nothing torn down under the guest
  expect(seen.slice(0, -1).every(s => !s.card)).toBe(true);
  expect(fr.view(base())).toEqual(base());
});

test("not yet: while a guest is still playing the sample, the page shows as it is", () => {
  const fr = createFirstRun({ stage: () => null, store: memory() });
  fr.step(1);
  expect(fr.playing()).toBe(false);
  expect(fr.view(base())).toEqual(base());
});

test("hello: signed in with no repo, an empty deck and one line, then the repo card", () => {
  const { fr, seen, run } = play(() => "hello");
  run();
  expect(fr.playing()).toBe(false);
  expect([...new Set(seen.map(s => s.caption).filter(Boolean))]).toEqual([FIRST_RUN_LINES.pick]);
  expect(seen.every(s => s.built.length === 0)).toBe(true); // nothing stands before you connect anything
  expect(seen.slice(0, -1).every(s => !s.card)).toBe(true); // no card over Shippy's line
  expect(fr.view(base()).card).not.toBeNull();
  expect(fr.view(base()).stops.find(s => s.id === "review")!.items).toEqual([]); // no sample crates on an empty deck
});

test("repo then engine: one station at a time, each with its line, ending on the whole line", () => {
  let stage: FirstRunStage = "repo";
  const { fr, seen, run } = play(() => stage);
  run();
  expect(builtOf(fr.view(base()))).toEqual(["repo", "planner"]);
  expect(fr.view(base()).card).not.toBeNull(); // the Codex card waits until the stations are up
  stage = "engine";
  run();
  expect(fr.done()).toBe(true);
  // Stations appear strictly one by one, in line order, never two in the same frame.
  const order: StopId[] = [];
  for (let i = 1; i < seen.length; i++) {
    const added = seen[i].built.filter(id => !seen[i - 1].built.includes(id));
    expect(added.length <= 1 || added.join() === "gate,launch").toBe(true);
    order.push(...added);
  }
  expect(order).toEqual(["repo", "planner", "builder", "checks", "review", "gate", "launch"].filter(id => !seen[0].built.includes(id as StopId)) as StopId[]);
  // While a station builds the camera is on it and its line explains it.
  for (const id of ["repo", "planner", "builder", "checks", "review", "gate"] as const) {
    expect(seen.some(s => s.focus === id && s.caption === FIRST_RUN_LINES[id])).toBe(true);
  }
  expect(fr.view(base())).toEqual(base()); // done: the real factory, untouched
});

test("a reload never builds twice, and stages only move forward", () => {
  const store = memory();
  let stage: FirstRunStage = "repo";
  const first = play(() => stage, store);
  first.run();
  stage = "engine"; first.fr.step(0.5); stage = "repo"; first.fr.step(0.1); // runner blinks offline mid-build
  expect(first.fr.playing()).toBe(true);
  expect(builtOf(first.fr.view(base()))).toContain("builder");
  // A reload after the repo stage starts with Repo and Planner standing and no script.
  const again = createFirstRun({ stage: () => "repo", store, key: "me/repo" });
  again.step(0.1);
  expect(again.playing()).toBe(false);
  expect(builtOf(again.view(base()))).toEqual(["repo", "planner"]);
});

test("an established factory is never torn down for a first run", () => {
  const fr = createFirstRun({ stage: () => "repo", store: memory(), key: "me/repo", established: () => true });
  fr.step(0.1);
  expect(fr.done()).toBe(true);
  expect(fr.view(base())).toEqual(base());
});

test("after the tour: the same stations, one at a time, with no repeated lines, well under two thirds of the time", () => {
  const time = (toured: boolean) => {
    let stage: FirstRunStage = "repo";
    const { fr, seen, run } = play(() => stage, memory(), toured);
    run(); stage = "engine"; const at = seen.length; run();
    expect(fr.done()).toBe(true);
    expect(builtOf(fr.view(base()))).toEqual([...STOPS]);
    return { seconds: (seen.length - at) / 10, lines: [...new Set(seen.map(s => s.caption).filter(Boolean))] };
  };
  const full = time(false), quick = time(true);
  expect(quick.lines).toEqual([FIRST_RUN_LINES.ready]);
  expect(full.lines).toContain(FIRST_RUN_LINES.builder);
  expect(quick.seconds).toBeLessThan(full.seconds * 0.65);
  expect(quick.seconds).toBeLessThan(20);
});
