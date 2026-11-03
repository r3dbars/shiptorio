import { expect, test } from "bun:test";
import { loadMark } from "../src/source/load-marks";

test("reconnects and successive rendered frames cannot overwrite the cold milestones", () => {
  performance.clearMarks("shiptorio:deck-frame");
  loadMark("deck-frame");
  const first = performance.getEntriesByName("shiptorio:deck-frame")[0];
  loadMark("deck-frame");
  expect(performance.getEntriesByName("shiptorio:deck-frame")).toEqual([first]);
  performance.clearMarks("shiptorio:deck-frame");
});
