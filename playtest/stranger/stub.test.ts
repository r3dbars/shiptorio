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
