import { expect, test } from "bun:test";
import { connectLazyLive } from "../src/source";

test("failed live chunks report offline without an unhandled rejection or a late callback after disposal", async () => {
  const statuses: string[] = [];
  const failed = connectLazyLive("owner/repo", () => {}, s => statuses.push(s), async () => { throw Error("Chunk unavailable"); });
  await Promise.resolve(); await Promise.resolve();
  expect(statuses).toEqual(["connecting", "offline"]);
  failed.close();
  const late: string[] = [];
  let reject!: (error: Error) => void;
  const disposed = connectLazyLive("owner/repo", () => {}, s => late.push(s), () => new Promise((_, no) => { reject = no; }));
  disposed.close(); reject(Error("Late chunk failure"));
  await Promise.resolve(); await Promise.resolve();
  expect(late).toEqual(["connecting"]);
});

test("lazy source never queues an approval for replay and does not forward after close", async () => {
  let ready!: (value: { connectLive: () => { send(): void; close(): void } }) => void;
  let sends = 0, closes = 0;
  const source = connectLazyLive("owner/repo", () => {}, () => {}, () => new Promise(resolve => { ready = resolve; }));
  const approval = { type: "choose_move" as const, moveId: "current", optionId: "approve" };
  source.send(approval);
  ready({ connectLive: () => ({ send() { sends++; }, close() { closes++; } }) });
  await Promise.resolve(); await Promise.resolve();
  expect(sends).toBe(0);
  source.send(approval); expect(sends).toBe(1);
  source.close(); source.send(approval);
  expect([sends, closes]).toEqual([1, 1]);
});

test("the scenario list the deck reads without the sim matches the sim's own", async () => {
  const { SCENARIOS } = await import("../src/sim/engine");
  const { SCENARIO_NAMES } = await import("../src/source/config");
  expect([...SCENARIO_NAMES]).toEqual(Object.keys(SCENARIOS));
});
