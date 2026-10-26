import { expect, test } from "bun:test";
import { ClaimResponse, RenewResponse } from "../src/messages";
const id = "12345678-1234-4234-8234-123456789abc";
const job = { id, repo: "r3dbars/shiptorio", harness: "codex", baseSha: "a".repeat(40), branch: `shiptorio/runner-${id}`, allowedPaths: ["src/a.ts"], plan: "Fix a", lease: id, token: "test", deadline: 1234 };
test("HTTP job assignments reject malformed and escaping executable fields", () => {
  expect(ClaimResponse.parse({ job }).job?.id).toBe(id);
  for (const change of [{ harness: "sh" }, { baseSha: "--help" }, { allowedPaths: ["../secret"] }, { allowedPaths: [".git/config"] }, { allowedPaths: ["/tmp/file"] }, { allowedPaths: ["a;curl evil"] }, { allowedPaths: [".env"] }, { deadline: "tomorrow" }, { reworkPr: -1 }, { prTestFiles: ["../outside.test.ts"] }]) {
    expect(ClaimResponse.safeParse({ job: { ...job, ...change } }).success).toBe(false);
  }
  expect(RenewResponse.safeParse({ token: "bad\nINJECT=secret", expires: 1234 }).success).toBe(false);
});
