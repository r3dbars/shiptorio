import { expect, test } from "bun:test";
import { fixtureBusyResponse, sanitizedResetFailure } from "./reset-busy";

test("only allowlisted busy details and bounded lease retry survive the private wrapper", async () => {
  const upstream = Response.json({ code: "fixture_busy", blockers: ["request_leases", "runner_receipt"], activeRequests: 0, requestLeases: 2, leaseRetryAfterSeconds: 300,
    token: "private-token", leaseId: "12345678-1234-1234-1234-123456789abc", cookie: "session=private" },
    { status: 409, headers: { "set-cookie": "private", "authorization": "Bearer private", "x-private": "private", "retry-after": "999999" } });
  const safe = await sanitizedResetFailure(upstream);
  expect(safe.status).toBe(409); expect(safe.headers.get("retry-after")).toBe("300");
  expect(safe.headers.get("set-cookie")).toBeNull(); expect(safe.headers.get("authorization")).toBeNull(); expect(safe.headers.get("x-private")).toBeNull();
  const body = await safe.text();
  expect(JSON.parse(body)).toEqual({ code: "fixture_busy", blockers: ["request_leases", "runner_receipt"], activeRequests: 0, requestLeases: 2, leaseRetryAfterSeconds: 300 });
  expect(body).not.toContain("private"); expect(body).not.toContain("12345678");
});

test("transient work has no invented expiry and retry is never above the runner bound", async () => {
  const transient = fixtureBusyResponse(["runner_tick"], 0, 0, 0);
  expect(transient.status).toBe(409); expect(transient.headers.get("retry-after")).toBeNull();
  expect(await transient.json()).toEqual({ code: "fixture_busy", blockers: ["runner_tick"], activeRequests: 0, requestLeases: 0 });
  expect(fixtureBusyResponse(["runner_receipt"], 0, 0, 99999999).headers.get("retry-after")).toBe("600");
});

test("unknown/malformed/oversized provider errors remain generic and fail closed", async () => {
  for (const value of [null, { code: "fixture_busy", blockers: ["private-token"], activeRequests: 0, requestLeases: 0 },
    { code: "fixture_busy", blockers: ["runner_tick"], activeRequests: -1, requestLeases: 0 },
    { code: "fixture_busy", blockers: ["runner_tick"], activeRequests: 0, requestLeases: 0, leaseRetryAfterSeconds: 601 }]) {
    const safe = await sanitizedResetFailure(Response.json(value, { status: 409 }));
    expect(safe.status).toBe(409); expect(await safe.text()).toBe("Fixture reset failed");
  }
  const huge = await sanitizedResetFailure(new Response("secret".repeat(500), { status: 409 }));
  expect(huge.status).toBe(409); expect(await huge.text()).toBe("Fixture reset failed");
  const failed = await sanitizedResetFailure(new Response("private error", { status: 500 }));
  expect(failed.status).toBe(503); expect(await failed.text()).toBe("Fixture reset failed");
});
