import { expect, test } from "bun:test";
import { playerAction } from "./player-action.mjs";

test("a confirmed Launch stops waiting on a button removed by that transition", async () => {
  expect(await playerAction(() => new Promise(() => {}), Promise.resolve())).toBe(true);
});
test("ordinary actions and failures still finish normally before Launch", async () => {
  const pending = new Promise<void>(() => {});
  expect(await playerAction(async () => {}, pending)).toBe(false);
  await expect(playerAction(async () => { throw new Error("broken button"); }, pending)).rejects.toThrow("broken button");
});
