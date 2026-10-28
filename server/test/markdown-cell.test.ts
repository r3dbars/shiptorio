import { expect, test } from "bun:test";
import { escapeMarkdownCell } from "../scripts/markdown-cell";

test("backslashes cannot neutralize a Markdown table pipe escape", () => {
  const slash = String.fromCharCode(92);
  for (const count of [0, 1, 2, 3]) {
    expect(escapeMarkdownCell(slash.repeat(count) + "|first|second"))
      .toBe(slash.repeat(count * 2 + 1) + "|first" + slash + "|second");
  }
});

test("normalizes multiline reports while retaining ordinary text", () => {
  expect(escapeMarkdownCell("first\nsecond\t  third")).toBe("first second third");
  expect(escapeMarkdownCell("ordinary text")).toBe("ordinary text");
});
