import { expect, test } from "bun:test";
import { verifyPrivateLoop } from "./loop";

function socketFixture(alreadyLaunched = false) {
  let listener: (event: { data: string }) => void = () => {};
  const emit = (frame: unknown) => listener({ data: JSON.stringify(frame) });
  const move = (tool: string) => ({ id: tool, itemId: "gh-1", options: [{ id: "yes", recommended: true, actions: [{ tool }] }] });
  const sent: string[] = [];
  const socket = {
    addEventListener(event: string, fn: typeof listener) { if (event === "message") listener = fn; },
    accept() { queueMicrotask(() => emit(alreadyLaunched ? { type: "snapshot", state: { items: [{ id: "gh-1", state: "launched" }] } } : { type: "snapshot", state: { deck: [move("approve_runner_job")] } })); },
    send(text: string) {
      const choice = JSON.parse(text); sent.push(choice.moveId);
      queueMicrotask(() => emit(choice.moveId === "approve_runner_job" ? { type: "deck", deck: [move("request_merge")] } : { type: "patch", patch: { items: [{ id: "gh-1", state: "launched" }] } }));
    }, close() {},
  };
  return { sent, open: async () => ({ status: 101, webSocket: socket } as unknown as Response) };
}
test("private loop requires actual build and merge choices, including snapshot-delivered cards", async () => {
  const fixture = socketFixture(); await verifyPrivateLoop(fixture.open);
  expect(fixture.sent).toEqual(["approve_runner_job", "request_merge"]);
});
test("an old launched snapshot cannot stand in for a new approved run", async () => {
  const fixture = socketFixture(true);
  await expect(verifyPrivateLoop(fixture.open)).rejects.toThrow("without the required player approvals");
  expect(fixture.sent).toEqual([]);
});
