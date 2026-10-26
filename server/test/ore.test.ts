import { expect, it } from "bun:test";
import { foldSignal, oreWeight } from "../src/ore";
import { fakeGitHub, normalizeGitHub, githubSource } from "../src/sources/github";

it("folds an issue and its comments into one chunk without counting a retried signal twice", () => {
  const signal = normalizeGitHub(fakeGitHub())[0];
  const first = foldSignal(undefined, signal, signal.occurredAt);
  expect(foldSignal(first, signal)).toBe(first);
  const second = foldSignal(first, { ...signal, rawRef: "fake:comment-2", reporter: "example-second-user", usersAffected: 3, hints: ["route:/checkout"] }, signal.occurredAt);
  expect(second.id).toBe(first.id);
  expect(second.ore?.count).toBe(2);
  expect(second.customer?.reporters).toEqual(["example-reporter", "example-second-user"]);
  expect(second.customer?.usersAffected).toBe(3);
  expect(second.value).toBe(7);
  expect(second.ore?.linked).toEqual([]);
});

it("updates ore text while preserving work, and only attaches exact cross-source hints", () => {
  const signal = normalizeGitHub(fakeGitHub())[0];
  const first = { ...foldSignal(undefined, signal), state: "working" as const, attempts: 1 };
  const second = foldSignal(first, { ...signal, rawRef: "fake:edit", title: "Updated issue", body: "More context", hints: ["sentry:8812", "route:/checkout"] });
  expect(second.title).toBe("Updated issue");
  expect(second.state).toBe("working");
  expect(second.attempts).toBe(1);
  expect(second.ore?.linked).toEqual([]);
  expect(second.ore?.hints).toContain("sentry:8812");
});

it("documents stable evidence weights and recency decay instead of model-free priority guesses", () => {
  const signal = normalizeGitHub(fakeGitHub())[0];
  const ore = foldSignal(undefined, { ...signal, usersAffected: 10, severity: 2, paying: true }, signal.occurredAt).ore!;
  expect(oreWeight(ore, ore.lastSeen)).toBe(32);
  expect(oreWeight(ore, ore.lastSeen + 7 * 86400000)).toBe(16);
  expect(oreWeight(ore, ore.lastSeen + 100 * 86400000)).toBe(3.2);
});

it("ignores PR issue payloads, preserves close/reopen actions and normalizes comment reporters", () => {
  const p = fakeGitHub();
  expect(normalizeGitHub({ ...p, issue: { ...p.issue, pull_request: {} } })).toEqual([]);
  expect(normalizeGitHub(fakeGitHub("issues.closed"))[0].action).toBe("close");
  expect(normalizeGitHub(fakeGitHub("issues.reopened"))[0].action).toBe("upsert");
  const comment = normalizeGitHub({ ...p, comment: { id: 2, body: "It affects me", user: { login: "example-second-user" } } })[0];
  expect(comment.reporter).toBe("example-second-user");
  expect(comment.rawRef).toBe("github:comment:2");
  expect(comment.body).toContain("It affects me");
});

it("rejects unset, forged and tampered GitHub signatures", async () => {
  const raw = JSON.stringify(fakeGitHub());
  const secret = "fake-test-webhook-secret";
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const signature = "sha256=" + [...new Uint8Array(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(raw)))].map((b) => b.toString(16).padStart(2, "0")).join("");
  const request = (body = raw) => new Request("http://localhost/webhooks/github", { method: "POST", headers: { "x-hub-signature-256": signature }, body });
  expect(await githubSource.verify(request(), { GITHUB_WEBHOOK_SECRET: secret })).toBe(true);
  expect(await githubSource.verify(request(), {})).toBe(false);
  expect(await githubSource.verify(request("{}"), { GITHUB_WEBHOOK_SECRET: secret })).toBe(false);
  expect(await githubSource.verify(request(), { GITHUB_WEBHOOK_SECRET: "fake-wrong-secret" })).toBe(false);
});
