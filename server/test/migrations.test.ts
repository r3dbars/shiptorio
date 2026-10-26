import { describe, expect, it } from "bun:test";
import { readdirSync } from "node:fs";
import { join } from "node:path";

// Many PRs add D1 migrations in parallel. Deploy applies every unapplied file in name order, so two
// files sharing a number (or a gap) means two PRs raced. Fail CI so the later PR renumbers before merge.
const files = readdirSync(join(import.meta.dir, "..", "migrations")).filter((f) => f.endsWith(".sql")).sort();

describe("D1 migrations", () => {
  it("are named NNNN_name.sql", () => {
    for (const f of files) expect(f).toMatch(/^\d{4}_[a-z0-9_]+\.sql$/);
  });
  it("have unique, gapless numbers starting at 0001", () => {
    const nums = files.map((f) => Number(f.slice(0, 4)));
    expect(nums).toEqual(nums.map((_, i) => i + 1));
  });
});
