import { expect, test } from "bun:test";
import { createLaunchTracker } from "./launch-tracker.mjs";
const origin = "https://shiptorio.dev", repo = "test-fixture/test-newbie";
const socket = `wss://shiptorio.dev/api/repos/${repo}/factory`;
const item = (id: string, state: string) => ({ id, state });
const snapshot = (rockets: unknown, items: unknown[] = [], name = repo) => ({ type: "snapshot", state: { repo: name, items, ...(rockets === undefined ? {} : { metrics: { rockets } }) } });
const patch = (items: unknown[] = [], rockets?: unknown) => ({ type: "patch", patch: { items, ...(rockets === undefined ? {} : { metrics: { rockets } }) } });
const fresh = (...args: [unknown?]) => {
  const baseline = args.length ? args[0] : 0;
  const tracker = createLaunchTracker({ origin, repo }), phone = tracker.viewport(390), receive = phone.socket(socket);
  receive(snapshot(baseline, [item("new", "on_pad")]));
  receive(patch([item("new", "launched")]));
  return { tracker, phone, receive };
};

test("initial shipments and counters cannot replace an actual new phone transition", () => {
  const tracker = createLaunchTracker({ origin, repo }), phone = tracker.viewport(390);
  phone.socket(socket)(snapshot(10, [item("old", "launched")]));
  expect(phone.confirmed).toBe(false); expect(tracker.observedLaunch).toBe(false);
  const desktop = tracker.viewport(1280);
  desktop.socket(socket)(snapshot(100, [item("old", "launched")]));
  expect(desktop.confirmed).toBe(false);
  expect(tracker.results().every(result => !result.confirmed)).toBe(true);
});

test("desktop can verify the phone ship's persisted counter after the item left its snapshot", async () => {
  const { tracker, phone } = fresh();
  await phone.promise;
  expect(phone.result().mode).toBe("fresh-transition");
  const desktop = tracker.viewport(1280), receive = desktop.socket(socket);
  receive(snapshot(0)); expect(desktop.confirmed).toBe(false);
  receive(snapshot(1)); await desktop.promise;
  expect(desktop.result()).toEqual({ width: 1280, repo, confirmed: true, mode: "persisted-counter", itemIds: ["new"], minimumShipped: 1, counter: "metrics.rockets" });
});

test("known prior count uses the maximum pre-launch snapshot, not an arbitrary preexisting ship", () => {
  const tracker = createLaunchTracker({ origin, repo }), phone = tracker.viewport(390), receive = phone.socket(socket);
  receive(snapshot(2, [item("new", "on_pad")]));
  receive(snapshot(5, [item("new", "on_pad")]));
  receive(snapshot(1, [item("new", "on_pad")]));
  receive(patch([item("new", "launched")], 6));
  const desktop = tracker.viewport(1280), next = desktop.socket(socket);
  next(snapshot(5)); expect(desktop.confirmed).toBe(false);
  next(snapshot(6)); expect(desktop.confirmed).toBe(true);
  expect(desktop.result().minimumShipped).toBe(6);
});

test("wrong origins/repos, patches without a matching snapshot and counters in patches cannot satisfy persistence", () => {
  const { tracker } = fresh(), desktop = tracker.viewport(1280);
  for (const url of [socket.replace("shiptorio.dev", "evil.example"), socket.replace(repo, "test-fixture/test-midgame"), socket.replace("wss:", "https:")]) {
    desktop.socket(url)(snapshot(99)); expect(desktop.confirmed).toBe(false);
  }
  const receive = desktop.socket(socket);
  receive(patch([item("new", "launched")], 99)); expect(desktop.confirmed).toBe(false);
  receive(snapshot(99, [item("new", "launched")], "test-fixture/test-midgame")); expect(desktop.confirmed).toBe(false);
  receive(snapshot(0)); receive(patch([], 99)); expect(desktop.confirmed).toBe(false);
  receive(snapshot(1)); expect(desktop.confirmed).toBe(true);
});

test("exact phone item identity remains a receipt when no safe count baseline exists", () => {
  for (const baseline of [undefined, -1, 1.5, Infinity, Number.MAX_SAFE_INTEGER]) {
    const { tracker } = fresh(baseline);
    const desktop = tracker.viewport(1280), receive = desktop.socket(socket);
    receive(snapshot(Number.MAX_SAFE_INTEGER)); expect(desktop.confirmed).toBe(false);
    receive(snapshot(1, [item("unrelated", "launched")])); expect(desktop.confirmed).toBe(false);
    receive(snapshot(undefined, [item("new", "launched")])); expect(desktop.confirmed).toBe(true);
    expect(desktop.result().mode).toBe("persisted-item");
  }
});

test("duplicate launch upserts do not inflate the receipt and an unfinished desktop stays explicitly unconfirmed", () => {
  const { tracker, receive } = fresh();
  receive(patch([item("new", "launched")])); receive(snapshot(1, [item("new", "launched")]));
  const desktop = tracker.viewport(1280);
  expect(tracker.results()).toEqual([
    { width: 390, repo, confirmed: true, mode: "fresh-transition", itemIds: ["new"], minimumShipped: 1, counter: "metrics.rockets" },
    { width: 1280, repo, confirmed: false },
  ]);
  desktop.socket(socket)(snapshot(1)); expect(desktop.confirmed).toBe(true);
});


test("real initial science-only state and joint science launch patch confirm persisted desktop progress", () => {
  const tracker = createLaunchTracker({ origin, repo }), phone = tracker.viewport(390), receive = phone.socket(socket);
  const science = (red: number) => ({ red, green: 0, grey: 0, blue: 0 });
  receive({ type: "snapshot", state: { repo, items: [], science: science(0) } });
  receive(patch([item("new", "on_pad")]));
  receive({ type: "patch", patch: { items: [item("new", "launched")], science: science(1) } });
  const desktop = tracker.viewport(1280);
  desktop.socket(socket)({ type: "snapshot", state: { repo, items: [], science: science(1) } });
  expect(phone.confirmed).toBe(true); expect(desktop.confirmed).toBe(true);
  expect(desktop.result().counter).toBe("science"); expect(desktop.result().minimumShipped).toBe(1);
});

test("an explicit count in the fresh transition can fill a missing baseline; arbitrary later counts cannot", () => {
  const tracker = createLaunchTracker({ origin, repo }), phone = tracker.viewport(390), receive = phone.socket(socket);
  receive(snapshot(undefined, [item("new", "on_pad")])); receive(patch([item("new", "launched")], 1));
  const desktop = tracker.viewport(1280); desktop.socket(socket)(snapshot(1));
  expect(desktop.confirmed).toBe(true); expect(desktop.result().counter).toBe("metrics.rockets");
  const without = fresh(undefined), next = without.tracker.viewport(1280);
  without.receive(patch([], 1)); next.socket(socket)(snapshot(1)); expect(next.confirmed).toBe(false);
});

test("malformed/overflow science or malformed authoritative metrics never fall back to another counter", () => {
  for (const data of [
    { science: { red: -1, green: 0, grey: 0, blue: 0 } },
    { science: { red: Number.MAX_SAFE_INTEGER, green: 1, grey: 0, blue: 0 } },
    { science: { red: 0, green: 0, grey: 0 } },
    { metrics: { rockets: NaN }, science: { red: 0, green: 0, grey: 0, blue: 0 } },
  ]) {
    const tracker = createLaunchTracker({ origin, repo }), phone = tracker.viewport(390), receive = phone.socket(socket);
    receive({ type: "snapshot", state: { repo, items: [item("new", "on_pad")], ...data } });
    receive(patch([item("new", "launched")], 1));
    const desktop = tracker.viewport(1280); desktop.socket(socket)(snapshot(1));
    expect(phone.confirmed).toBe(true); expect(desktop.confirmed).toBe(false);
  }
});
