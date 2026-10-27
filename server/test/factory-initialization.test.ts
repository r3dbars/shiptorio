import { expect, test } from "bun:test";
import type { TreeEntry } from "../src/github";
import { initialFactoryState } from "../src/factory-initialization";

test("fresh layout preserves the repository branch and packs blob districts only", () => {
  const entries: TreeEntry[] = [
    { path: "src/cart.ts", type: "blob" },
    { path: "src/checkout.ts", type: "blob" },
    { path: "README.md", type: "blob" },
    { path: "assets", type: "tree" },
  ];
  const before = structuredClone(entries);
  const state = initialFactoryState("example/shop", { branch: "develop", entries }, {});
  expect(state.baseBranch).toBe("develop");
  expect(state.repo).toBe("example/shop");
  expect(state.districts).toEqual([
    { name: "src", x: 0, y: 0, w: 2, h: 1, files: 2 },
    { name: "/", x: 4, y: 0, w: 1, h: 1, files: 1 },
  ]);
  expect(entries).toEqual(before);
  expect(state.sources?.[0]?.state).toBe("needs_action");
});

test("an empty repository keeps an empty layout and configured GitHub status", () => {
  const state = initialFactoryState("example/shop", { branch: "trunk", entries: [] }, {
    GITHUB_APP_ID: "fixture-app", GITHUB_APP_PRIVATE_KEY: "fixture-key",
    GITHUB_WEBHOOK_SECRET: "fixture-hook", GITHUB_CLIENT_ID: "fixture-client",
    GITHUB_CLIENT_SECRET: "fixture-secret",
  });
  expect(state.districts).toEqual([]);
  expect(state.sources?.[0]?.state).toBe("connected");
});

test("fresh factories never share mutable inventory, counters or source setup", () => {
  const tree = { branch: "main", entries: [] };
  const first = initialFactoryState("example/first", tree, {});
  const second = initialFactoryState("example/second", tree, {});
  const before = structuredClone(second);
  first.machines[0].state = "working";
  first.belts.pop();
  first.power[0].level = 0;
  first.science.red = 42;
  first.sources![0].setup!.steps.push("Changed only in the first factory");
  expect(second).toEqual(before);
});
