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

test("the fixture player requires a scoped visible card before planning or approving", async () => {
  const { fixtureCardIntent } = await import("./player-action.mjs");
  expect(fixtureCardIntent("Plan →", "#1: Fix a test")).toBe("plan-issue");
  expect(fixtureCardIntent("Start issue", "Plan #1: Fix a test", ["plan_runner_job"])).toBe("plan-issue");
  expect(fixtureCardIntent("Start build", "Build #1: Fix a test", ["approve_runner_job"])).toBe("approve-build");
  expect(fixtureCardIntent("Open inbox", "Codex engine is ready")).toBe("open-inbox");
  expect(fixtureCardIntent("Please wait…", "Checking Codex…")).toBe("wait");
  expect(() => fixtureCardIntent("Plan", "Delete your account")).toThrow();
  expect(() => fixtureCardIntent("Continue", "Unknown recommendation", ["send_customer_reply"])).toThrow();
  expect(() => fixtureCardIntent("Start build", "Build #1: Fix a test")).toThrow();
});

test("a reconnect snapshot can approve its visible build before any separate deck frame", async () => {
  const { fixtureDecisionDeck, fixtureCardIntent } = await import("./player-action.mjs");
  const move = { id: "build-1", title: "Build #1: Fix a test", options: [{ recommended: true, actions: [{ tool: "approve_runner_job" }] }] };
  let deck = fixtureDecisionDeck([], { type: "snapshot", state: { deck: [move] } });
  expect(fixtureCardIntent("Start build", deck[0].title, deck[0].options[0].actions.map(action => action.tool))).toBe("approve-build");
  expect(fixtureDecisionDeck([], { type: "snapshot", state: { move } })).toEqual([move]);
  deck = fixtureDecisionDeck(deck, { type: "patch", patch: { deck: [] } });
  expect(deck).toEqual([]);
  expect(fixtureDecisionDeck([move], { type: "snapshot", state: {} })).toEqual([]);
});
