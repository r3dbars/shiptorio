import { expect, test } from "bun:test";
import { PRIVATE_SOCKET_TIMING, PrivateSocketTiming, privateSocketTiming, measureSocket, timingResponse } from "../src/private-socket-timing";
test("only an in-process symbol object enables fixed numeric timing phases", async () => {
  let at = 0;
  const timing = new PrivateSocketTiming(() => at);
  expect(privateSocketTiming({ PRIVATE_SOCKET_TIMING: timing })).toBeUndefined();
  expect(privateSocketTiming({ [PRIVATE_SOCKET_TIMING]: {} })).toBeUndefined();
  expect(privateSocketTiming({ [PRIVATE_SOCKET_TIMING]: timing })).toBe(timing);
  expect(await measureSocket(timing, "app_trace_auth", async () => { at = 125; return "retained"; })).toBe("retained");
  await expect(measureSocket(timing, "app_trace_auth", async () => { at = 130; throw Error("unchanged failure"); })).rejects.toThrow("unchanged failure");
  expect(timing.header()).toBe('app_trace_auth;dur=130.0;desc="2 calls"');
  const response = timingResponse(new Response("body", { headers: { "Server-Timing": "existing;dur=1" } }), timing);
  expect(response.headers.get("Server-Timing")).toBe('existing;dur=1, app_trace_auth;dur=130.0;desc="2 calls"');
  expect(await response.text()).toBe("body");
});
