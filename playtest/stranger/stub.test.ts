import { expect, test } from "bun:test";
import { githubStub } from "./github-stub.mjs";
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
