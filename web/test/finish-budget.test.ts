import { expect, test } from "bun:test";
import { FinishPass } from "../src/map/shaft/finish";

test("a two-pixel scene budget cuts a non-square target to one quarter without changing its aspect or display", () => {
  const finish = new FinishPass({});
  try {
    finish.setSize(1440, 900, 1);
    const original = finish.target.width * finish.target.height;
    finish.setSize(1440, 900, 2);
    expect([finish.target.width, finish.target.height]).toEqual([720, 450]);
    expect(original / (finish.target.width * finish.target.height)).toBe(4);
    finish.setSize(1441, 901, 2);
    expect([finish.target.width, finish.target.height]).toEqual([721, 451]);
    finish.setSize(390, 844, 1);
    expect([finish.target.width, finish.target.height]).toEqual([390, 844]);
  } finally { finish.dispose(); }
});
