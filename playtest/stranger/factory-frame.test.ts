import { expect, test } from "bun:test";
import { decodeFactoryFrame } from "./factory-frame.mjs";

test("Stranger accepts only exact text pong as a transport heartbeat", () => {
  expect(decodeFactoryFrame("pong")).toEqual({ heartbeat: true });
  for (const payload of ["ping", "PONG", "pong\n", "unexpected", "{", Buffer.from("pong")]) {
    expect(() => decodeFactoryFrame(payload)).toThrow();
  }
});
test("JSON gameplay frames continue through the unchanged state/assertion path", () => {
  const values = [
    { type: "snapshot", state: { repo: "test-fixture/test-newbie", items: [] } },
    { type: "patch", patch: { tick: 3, items: [] } },
    { type: "deck", deck: [] },
    { type: "log", level: "info", text: "Still checked" },
    null,
  ];
  for (const message of values) expect(decodeFactoryFrame(JSON.stringify(message))).toEqual({ heartbeat: false, message });
});
