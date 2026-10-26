import { expect, it } from "bun:test";
import { Item, ServerToWeb, SourceStatus, WebToServer } from "../src";

it("keeps older items valid while accepting ore provenance and ordered inspection evidence", () => {
  const old = { id: "gh-1", kind: "bug", source: "github_issue", title: "Checkout", district: "web", state: "ore", updatedAt: 1 };
  expect(Item.safeParse(old).success).toBe(true);
  expect(Item.safeParse({ ...old, ore: { fingerprint: "github:1", count: 2, firstSeen: 1, lastSeen: 2, severity: 1, usersAffected: 3, reporters: ["example-reporter"], linked: [], hints: ["route:/checkout"], rawRefs: ["fixture:issue-1"] }, inspection: { headSha: "a".repeat(40), state: "pending", stages: [{ gate: "ci", state: "pending", reason: "Checks running" }] } }).success).toBe(true);
});

it("carries connect-a-source setup responses and replacement status patches", () => {
  const source = SourceStatus.parse({ kind: "github", state: "needs_action", detail: "Install the App", setup: { steps: ["Create the App"], actionUrl: "https://shiptorio.com/setup" } });
  expect(source.eventsToday).toBe(0);
  expect(ServerToWeb.safeParse({ type: "patch", patch: { sources: [source] } }).success).toBe(true);
  expect(WebToServer.safeParse({ type: "connect_source", kind: "github" }).success).toBe(true);
  expect(WebToServer.safeParse({ type: "disconnect_source", kind: "email" }).success).toBe(true);
  expect(WebToServer.safeParse({ type: "connect_source", kind: "unknown" }).success).toBe(false);
});
