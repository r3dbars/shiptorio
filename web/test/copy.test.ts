// Player copy rules (docs/VISION.md principles 8 and 9, web/src/copy.ts header).
import { expect, test } from "bun:test";
import ts from "typescript";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { inventory } from "../scripts/copy-strings";
import { CREDIT, HUD } from "../src/copy";

const all = inventory();

test("the inventory finds the player copy", () => {
  expect(all.length).toBeGreaterThan(300);
  expect(all.some((f) => f.file === "copy.ts" && f.text === "Place")).toBe(true);
});

test('no "Spark" in player copy, except the one credit', () => {
  const hits = all.filter((f) => /\bSpark\b/.test(f.text) && f.text !== CREDIT);
  expect(hits.map((f) => `${f.file}:${f.line} ${f.text}`)).toEqual([]);
  // and the credit itself is declared once, in copy.ts
  expect(all.filter((f) => f.text === CREDIT).map((f) => f.file)).toEqual(["copy.ts"]);
});

test('the server\'s floor log never says "Spark" either', () => {
  const file = join(import.meta.dir, "../../server/src/factory.ts");
  const sf = ts.createSourceFile(file, readFileSync(file, "utf8"), ts.ScriptTarget.Latest, true);
  const hits: string[] = [];
  const visit = (node: ts.Node) => {
    // this.log(level, text): every line here shows up in the activity tray
    if (ts.isCallExpression(node) && node.expression.getText() === "this.log") {
      const words = node.arguments.map((a) => a.getText()).join(" ");
      if (/\bSpark\b/.test(words)) hits.push(`factory.ts:${sf.getLineAndCharacterOfPosition(node.getStart()).line + 1}`);
    }
    ts.forEachChild(node, visit);
  };
  visit(sf);
  expect(hits).toEqual([]);
});

test('players see "folder", not "district"', () => {
  const hits = all.filter((f) => /\bdistricts?\b/i.test(f.text) && !f.file.startsWith("sim/"));
  expect(hits.map((f) => `${f.file}:${f.line} ${f.text}`)).toEqual([]);
});

test('"Build" means one thing: agents build, you place', () => {
  expect(HUD.dock.place).toBe("Place");
  expect(HUD.factory).not.toBe("Build"); // the map view toggle
});
