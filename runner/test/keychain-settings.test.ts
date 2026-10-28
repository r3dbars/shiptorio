import { expect, test } from "bun:test";
import { ensureLockSettings, KeychainUnavailable, protectedAgentKeychain, type KeychainCommandResult } from "../src/keychain";

const secure: KeychainCommandResult = { out: "", err: 'Keychain "private" lock-on-sleep timeout=1800s\n', failed: false };
const failed: KeychainCommandResult = { out: "", err: "set failed", failed: true };
const unsecured: KeychainCommandResult = { out: "", err: 'Keychain "private" lock-on-sleep no-timeout\n', failed: false };
function sequence(...responses: KeychainCommandResult[]) {
  const calls: string[][] = [];
  return { calls, invoke: async (_home: string, args: string[]) => {
    calls.push(args);
    const response = responses.shift();
    if (!response) throw new Error("Unexpected Keychain command");
    return response;
  } };
}

test("native settings require sleep locking, enabled idle locking and the exact timeout", () => {
  expect(protectedAgentKeychain(secure)).toBe(true);
  expect(protectedAgentKeychain({ ...secure, out: secure.err, err: "" })).toBe(true);
  for (const info of [
    unsecured,
    { ...secure, failed: true },
    { ...secure, err: secure.err.replace("lock-on-sleep", "no-lock-on-sleep") },
    { ...secure, err: secure.err.replace("lock-on-sleep ", "") },
    { ...secure, err: 'Keychain "lock-on-sleep timeout=1800s" no-timeout\n' },
    { ...secure, err: secure.err.replace("1800s", "18000s") },
    { ...secure, err: "unreadable settings" },
  ]) expect(protectedAgentKeychain(info)).toBe(false);
});

test("already verified private settings do not attempt a write on reinstall", async () => {
  const command = sequence(secure);
  await ensureLockSettings("home", "private", command.invoke);
  expect(command.calls).toEqual([["show-keychain-info", "private"]]);
});

test("a failed setter may continue only after a fresh read proves both protections", async () => {
  const command = sequence(unsecured, failed, secure);
  await ensureLockSettings("home", "private", command.invoke);
  expect(command.calls).toEqual([
    ["show-keychain-info", "private"],
    ["set-keychain-settings", "-l", "-u", "-t", "1800", "private"],
    ["show-keychain-info", "private"],
  ]);
});

test("failed setter plus incorrect or unreadable policy fails closed without echoing stderr", async () => {
  for (const after of [unsecured, failed, { out: "", err: "unreadable", failed: false }]) {
    const command = sequence(unsecured, { ...failed, err: "secret-canary-must-not-be-logged" }, after);
    let thrown: unknown;
    try { await ensureLockSettings("home", "private", command.invoke); } catch (error) { thrown = error; }
    expect(thrown).toBeInstanceOf(KeychainUnavailable);
    expect(String(thrown)).not.toContain("secret-canary");
    expect(command.calls).toHaveLength(3);
  }
});

test("unreadable initial policy still attempts the required settings, and a successful setter is accepted", async () => {
  const command = sequence(failed, { out: "", err: "", failed: false });
  await ensureLockSettings("home", "private", command.invoke);
  expect(command.calls).toHaveLength(2);
  expect(command.calls[1]).toEqual(["set-keychain-settings", "-l", "-u", "-t", "1800", "private"]);
});
