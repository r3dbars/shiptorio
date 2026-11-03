import { expect, test } from "bun:test";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { STOP_LABEL } from "../src/deck2d/contract";

// One name per station (docs/VISION.md "The line"). These old synonyms must not reach a player:
// the deck, cards, captions, server logs, PR comments and runner messages all use STOP_LABEL's words.
const OLD = /\b(CI inspector|verify bay|AI review|merge gate|Repo inbox|inspection machine|launch pad|rocket pad)\b/i;
const root = join(import.meta.dir, "../..");
const walk = (dir: string): string[] => readdirSync(dir).flatMap(f => {
  const p = join(dir, f);
  return statSync(p).isDirectory() ? walk(p) : /\.ts$/.test(f) && !/\.test\.ts$/.test(f) ? [p] : [];
});
const FILES = [
  ...walk(join(root, "web/src/deck2d")),
  ...["gauntlet", "deck", "deck-decisions", "bottleneck", "brain", "factory", "permits", "learn", "autopilot", "spark-tools"].map(f => join(root, `server/src/${f}.ts`)),
  ...["pipeline", "achievements", "research", "pricing"].map(f => join(root, `shared/src/${f}.ts`)),
  join(root, "runner/src/messages.ts"),
];
// String literals only: comments and identifiers keep their history.
const LITERAL = /"(?:[^"\\\n]|\\.)*"|'(?:[^'\\\n]|\\.)*'|`(?:[^`\\]|\\.)*`/g;

test("station names are the seven words, in order", () => {
  expect(Object.values(STOP_LABEL)).toEqual(["Repo", "Planner", "Builder", "Checks", "Review", "Gate", "Launch"]);
});

test("no player string uses an old synonym for a station", () => {
  const hits: string[] = [];
  for (const file of FILES) {
    const src = readFileSync(file, "utf8").split("\n").filter(l => !/^\s*(\/\/|\*|\/\*)/.test(l)).join("\n");
    for (const m of src.matchAll(LITERAL)) if (OLD.test(m[0])) hits.push(`${file.slice(root.length + 1)}: ${m[0].slice(0, 80)}`);
  }
  expect(hits).toEqual([]);
});
