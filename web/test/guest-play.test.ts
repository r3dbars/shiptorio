import { describe, expect, test } from "bun:test";
import { isGuestPlay, SANDBOX_REPO } from "../src/account";

describe("isGuestPlay", () => {
  test("a guest in the demo shop syncs to the guest session", () => {
    expect(isGuestPlay(SANDBOX_REPO, { login: null, guest: true })).toBe(true);
  });
  test("signed out with no guest session sends nothing", () => {
    expect(isGuestPlay(SANDBOX_REPO, { login: null })).toBe(false);
  });
  test("a signed-in player's sim play stays local, so it never writes the real account", () => {
    expect(isGuestPlay(SANDBOX_REPO, { login: "r3dbars" })).toBe(false);
  });
  test("other scenarios and no server stay local", () => {
    expect(isGuestPlay("", { login: null, guest: true })).toBe(false);
    expect(isGuestPlay("acme/shop", { login: null, guest: true })).toBe(false);
    expect(isGuestPlay(SANDBOX_REPO, null)).toBe(false);
  });
});
