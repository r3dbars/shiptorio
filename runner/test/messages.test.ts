import { expect, test } from "bun:test";
import { assertJobAssignment, ClaimResponse, RenewResponse } from "../src/messages";
const id = "12345678-1234-4234-8234-123456789abc";
const job = { id, repo: "r3dbars/shiptorio", harness: "codex", baseSha: "a".repeat(40), branch: `shiptorio/runner-${id}`, allowedPaths: ["src/a.ts"], plan: "Fix a", lease: id, token: "test", deadline: 1234 };
test("runner accepts GitHub capitalization but rejects another repo, expired lease and changed branch", () => {
  const assigned = ClaimResponse.parse({ job: { ...job, repo: "r3dbars/Testing" } }).job!;
  expect(assigned.repo).toBe("r3dbars/testing"); // Recovery journals and receipt replay use the same identity as pairing.
  expect(() => assertJobAssignment(assigned, "r3dbars/testing", 1000)).not.toThrow();
  expect(() => assertJobAssignment(assigned, "other/testing", 1000)).toThrow("Invalid job assignment");
  expect(() => assertJobAssignment(assigned, "r3dbars/testing-other", 1000)).toThrow("Invalid job assignment");
  expect(() => assertJobAssignment(assigned, "r3dbars/testing", 1234)).toThrow("Invalid job assignment");
  expect(() => assertJobAssignment({ ...assigned, branch: `shiptorio/runner-${crypto.randomUUID()}` }, "r3dbars/testing", 1000)).toThrow("Invalid job assignment");
});
test("HTTP job assignments reject malformed and escaping executable fields", () => {
  expect(ClaimResponse.parse({ job }).job?.id).toBe(id);
  expect(ClaimResponse.parse({ job: { ...job, command: "sh -c evil" } }).job).not.toHaveProperty("command");
  for (const change of [{ harness: "sh" }, { baseSha: "--help" }, { allowedPaths: ["../secret"] }, { allowedPaths: [".git/config"] }, { allowedPaths: ["/tmp/file"] }, { allowedPaths: ["a;curl evil"] }, { allowedPaths: [".env"] }, { deadline: "tomorrow" }, { reworkPr: -1 }, { prTestFiles: ["../outside.test.ts"] }]) {
    expect(ClaimResponse.safeParse({ job: { ...job, ...change } }).success).toBe(false);
  }
  expect(RenewResponse.safeParse({ token: "bad\nINJECT=secret", expires: 1234 }).success).toBe(false);
});

test("base refresh assignments require the same PR and a new proof base, never an inferred push lease", () => {
  const refresh = { ...job, reworkPr: 99, verifyBaseSha: job.baseSha, refreshBase: { expectedHeadSha: "b".repeat(40) } };
  expect(ClaimResponse.parse({ job: refresh }).job?.refreshBase).toEqual(refresh.refreshBase);
  for (const change of [{ reworkPr: undefined }, { verifyBaseSha: undefined }, { verifyBaseSha: "c".repeat(40) }, { refreshBase: { expectedHeadSha: job.baseSha } }, { refreshBase: { expectedHeadSha: "--all" } }]) expect(ClaimResponse.safeParse({ job: { ...refresh, ...change } }).success).toBe(false);
});
