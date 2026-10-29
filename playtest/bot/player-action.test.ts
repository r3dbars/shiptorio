import { expect, test } from "bun:test";
import { playerAction, assertSafePrimaryAction } from "./player-action.mjs";

test("a confirmed Launch stops waiting on a button removed by that transition", async () => {
  expect(await playerAction(() => new Promise(() => {}), Promise.resolve())).toBe(true);
});
test("ordinary actions and failures still finish normally before Launch", async () => {
  const pending = new Promise<void>(() => {});
  expect(await playerAction(async () => {}, pending)).toBe(false);
  await expect(playerAction(async () => { throw new Error("broken button"); }, pending)).rejects.toThrow("broken button");
});

test("the fixture player never approves destructive connection or account actions", () => {
  for (const label of ["Disconnect", "Unplug", "Delete account", "Erase factory", "Reset factory"])
    expect(() => assertSafePrimaryAction(label)).toThrow("Refusing destructive");
  for (const label of ["Open inbox", "Start issue", "Start build", "Ship it", "Refresh"])
    expect(() => assertSafePrimaryAction(label)).not.toThrow();
});
