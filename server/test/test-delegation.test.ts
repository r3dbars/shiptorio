import { expect, test } from "bun:test";
import { delegateTestRequest, verifyTestDelegation } from "../src/test-delegation";
const key = "k".repeat(64), user = { id: -9001, login: "test-newbie" };
const path = "https://shiptorio.dev/api/repos/test-fixture/test-newbie/action";
test("delegation strips browser credentials and binds method, path, body, identity and expiry", async () => {
  const req = await delegateTestRequest(new Request(path, { method: "POST", headers: { cookie: "private", authorization: "Bearer private", origin: "https://shiptorio.dev", "content-type": "application/json" }, body: '{"go":1}' }), user, key, 1000);
  expect(req.headers.has("cookie")).toBe(false); expect(req.headers.has("authorization")).toBe(false);
  expect(await verifyTestDelegation(req, key, 1001)).toBe(user.login);
  expect(await verifyTestDelegation(req, key, 61000)).toBeNull();
  expect(await verifyTestDelegation(req, "x".repeat(64), 1001)).toBeNull();
  expect(await verifyTestDelegation(new Request(path, { method: "POST", headers: req.headers, body: '{"go":2}' }), key, 1001)).toBeNull();
  expect(await verifyTestDelegation(new Request(path + "/other", { method: "POST", headers: req.headers, body: '{"go":1}' }), key, 1001)).toBeNull();
});
test("delegation rejects production, other repos, runner writes, positive identities and large bodies", async () => {
  for (const url of [path.replace(".dev", ".com"), path.replace("test-fixture/test-newbie", "r3dbars/shiptorio"), path.replace("action", "runner/pair")]) {
    expect(delegateTestRequest(new Request(url), user, key)).rejects.toThrow();
  }
  expect(delegateTestRequest(new Request(path), { ...user, id: 42 }, key)).rejects.toThrow();
  expect(delegateTestRequest(new Request(path, { method: "POST", body: "x".repeat(65537) }), user, key)).rejects.toThrow();
});
