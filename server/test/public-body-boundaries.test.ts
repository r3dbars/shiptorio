import { expect, it, mock } from "bun:test";
import { testD1 } from "./d1-fixture";

mock.module("cloudflare:workers", () => ({ DurableObject: class { constructor(public ctx: unknown, public env: unknown) {} } }));
const { testApp: app } = await import("./app-fixture");
const { accessFastPath } = await import("../src/index");
const routes = [
  ["/api/runner-device/poll", 512, "password"],
  ["/api/runner-device/join", 256, "password"],
  ["/api/waitlist", 2048, "password"],
  ["/access", 4096, "password"],
  ["/auth/login", 4096, "waitlist"],
  ["/waitlist", 4096, "waitlist"],
] as const;
function env(mode: string) {
  return { SIGNUP_GATE_MODE: mode, DB: testD1(), SESSION_SECRET: "public-boundary-fixture-session", APP_PASSWORD: "public-boundary-fixture-password",
    FACTORY: { idFromName: (name: string) => name, get: () => ({ securityLimit: async () => ({ allowed: true, retryAfter: 0 }) }) } };
}
async function send(path: string, body: BodyInit, bindings: ReturnType<typeof env>, extra: Record<string, string> = {}) {
  const request = new Request(`https://shiptorio.com${path}`, { method: "POST", headers: { origin: "https://shiptorio.com", ...extra }, body });
  return path === "/access" ? (await accessFastPath(request, bindings as never))! : app.fetch(request, bindings);
}
for (const [path, limit, mode] of routes) {
  it(`${path} cancels an oversized stream before decoding/parsing it`, async () => {
    for (const declared of [undefined, "1"]) {
      let reads = 0, cancelled = false;
      const body = new ReadableStream<Uint8Array>({
        pull(controller) { reads++; controller.enqueue(new Uint8Array(reads === 1 ? limit : 1)); if (reads === 8) controller.close(); },
        cancel() { cancelled = true; },
      }, { highWaterMark: 0 });
      const response = await send(path, body, env(mode), declared ? { "content-length": declared } : {});
      expect({ status: response.status, reads, cancelled }).toEqual({ status: 413, reads: 2, cancelled: true });
    }
  });
  it(`${path} rejects excess UTF-8 bytes even below its character limit`, async () => {
    const body = JSON.stringify({ padding: "é".repeat(limit / 2) });
    expect(body.length).toBeLessThan(limit);
    expect((await send(path, body, env(mode))).status).toBe(413);
  });
}
it("the bounded reader accepts exact byte boundaries and preserves split UTF-8 and form text", async () => {
  const { boundedBody } = await import("../src/webhook-body");
  const text = 'name=caf%C3%A9+time&name=second&note=🔒';
  const bytes = new TextEncoder().encode(text);
  let offset = 0;
  const body = new ReadableStream<Uint8Array>({ pull(controller) {
    if (offset === bytes.length) controller.close();
    else controller.enqueue(bytes.slice(offset, ++offset));
  } });
  const decoded = await boundedBody(new Request("https://shiptorio.com/fixture", { method: "POST", body }), bytes.length);
  expect(decoded).toBe(text);
  expect(new URLSearchParams(decoded!).getAll("name")).toEqual(["café time", "second"]);
  expect(await boundedBody(new Request("https://shiptorio.com/fixture", { method: "POST", body: "x".repeat(256) }), 256)).toBe("x".repeat(256));
});
it("an oversized declared length rejects before any stream pull", async () => {
  const { boundedBody } = await import("../src/webhook-body");
  let reads = 0;
  const body = new ReadableStream<Uint8Array>({ pull(controller) { reads++; controller.close(); } }, { highWaterMark: 0 });
  const request = new Request("https://shiptorio.com/fixture", { method: "POST", headers: { "content-length": "257" }, body });
  expect(await boundedBody(request, 256)).toBeNull();
  expect(reads).toBe(0);
});
it("the direct public waitlist helper preserves JSON/form submissions and bounds its own reads", async () => {
  const { joinWaitlist } = await import("../src/waitlist");
  const bindings = env("password");
  const json = await joinWaitlist(new Request("https://shiptorio.com/api/waitlist", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ email: "first@example.com" }) }), bindings as never);
  expect(json.status).toBe(200);
  const form = await joinWaitlist(new Request("https://shiptorio.com/api/waitlist", { method: "POST", body: "email=second%40example.com" }), bindings as never);
  expect(form.status).toBe(303);
  expect((await bindings.DB.prepare("SELECT COUNT(*) AS n FROM signup_waitlist").first<{n:number}>())?.n).toBe(2);
  expect((await joinWaitlist(new Request("https://shiptorio.com/api/waitlist", { method: "POST", body: "x".repeat(2049) }), bindings as never)).status).toBe(413);
});
