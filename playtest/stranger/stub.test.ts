import { expect, test } from "bun:test";
import { githubStub } from "./github-stub.mjs";
import { sparkStub } from "./spark-stub.mjs";

test("persona GitHub fixture keeps its configured identity through issues and permission checks", async () => {
  const user = { id: -9001, login: "test-newbie", name: "Test newbie", avatar_url: null };
  const stub = githubStub({ origin: "http://localhost:8809", webhookSecret: "fixture", worker: async () => new Response(), user, repo: "test-fixture/test-newbie", repoId: 999001 });
  expect(await (await stub.outbound(new Request("https://api.github.com/user"))).json()).toEqual(user);
  const issues = await (await stub.outbound(new Request("https://api.github.com/repos/test-fixture/test-newbie/issues"))).json();
  expect(issues[0].html_url).toContain("test-fixture/test-newbie");
});

test("stranger Spark fixture distinguishes tool-based review from planning", async () => {
  const stub = sparkStub();
  const reply = await stub.outbound(new Request("https://fixture.meta/chat/completions", { method: "POST", body: JSON.stringify({ messages: [
    { role: "developer", content: "You are Muse Spark at Shiptorio's Review station, a hostile reviewer. Choose ONE tool per turn." },
    { role: "user", content: "UNTRUSTED_DATA_BEGIN\n{}\nUNTRUSTED_DATA_END" },
  ] }) }));
  const result = await reply.json();
  expect(JSON.parse(result.choices[0].message.content)).toMatchObject({ tool: "verdict", verdict: "pass" });
  expect(stub.calls).toEqual(["review"]);
  expect(stub.unexpected).toEqual([]);
});
test("stranger GitHub permission fixture grants only the installed repo/user with its installation token", async () => {
  const stub = githubStub({ origin: "http://localhost:8799", webhookSecret: "test", worker: async () => new Response() });
  const permission = `https://api.github.com/repos/${stub.state.repo}/collaborators/${stub.state.user.login}/permission`;
  const authorized = () => new Request(permission, { headers: { authorization: "Bearer ghs_stub_installation_token" } });
  expect((await stub.outbound(authorized())).status).toBe(403);
  stub.state.installation = 99001;
  expect((await stub.outbound(new Request(permission))).status).toBe(403);
  const response = await stub.outbound(authorized());
  expect(await response.json()).toEqual({ permission: "admin", user: { id: stub.state.user.id, login: stub.state.user.login } });
  expect((await stub.outbound(new Request(permission.replace(stub.state.user.login + "/permission", "another/permission"), { headers: authorized().headers }))).status).toBe(404);
});

test("fixture refuses stale merges and emits GitHub-shaped checks rather than automatic success", async () => {
  const stub = githubStub({ origin: "http://localhost:8799", webhookSecret: "test", worker: async () => new Response() });
  const call = (path: string, method = "GET", body?: unknown) => stub.outbound(new Request(`https://api.github.com/repos/${stub.state.repo}/${path}`, { method, ...(body ? { body: JSON.stringify(body) } : {}) }));
  stub.state.branches["shiptorio/runner-fixture"] = stub.state.headSha;
  expect((await call("pulls", "POST", { head: "shiptorio/runner-fixture", base: "main", title: "Fix" })).status).toBe(201);
  expect(await (await call(`commits/${stub.state.headSha}/check-runs`)).json()).toMatchObject({ total_count: 1, check_runs: [{ status: "in_progress", conclusion: null }] });
  const merge = (sha: string) => call("pulls/7/merge", "PUT", { sha, merge_method: "squash" });
  expect((await merge(stub.state.headSha)).status).toBe(409);
  stub.state.checks = "success";
  expect((await merge(stub.state.baseSha)).status).toBe(409);
  expect(stub.state.merges).toHaveLength(0);
  expect((await merge(stub.state.headSha)).status).toBe(200);
  expect((await merge(stub.state.headSha)).status).toBe(409);
  expect(stub.state.merges).toHaveLength(1);
});
