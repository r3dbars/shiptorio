import { expect, test } from "bun:test";
import { botAdmissionPath, prepareBotPersona } from "./setup.mjs";

function harness(options: { gated?: boolean; wrongPassword?: boolean; loginStatus?: number; resetStatuses?: number[] } = {}) {
  const events: string[] = [];
  let gated = options.gated ?? true, current = new URL("about:blank"), mounts = 0, resets = 0;
  const passwordField = {
    count: async () => gated ? 1 : 0,
    fill: async (_value: string) => { events.push("password-filled"); },
    waitFor: async ({ state }: { state: string }) => { expect(state).toBe("hidden"); if (gated) throw Error("Password form remains visible"); },
  };
  const navigate = (url: string) => {
    current = new URL(url);
    if (!gated && current.pathname === "/test/login") { mounts++; events.push("game-mounted"); current = new URL("https://shiptorio.dev/?source=live&onboard=repo"); }
  };
  const page = {
    goto: async (url: string) => { events.push(`page:${new URL(url).pathname}`); navigate(url); return { status: () => gated ? 401 : 200 }; },
    getByLabel: () => passwordField,
    getByRole: () => ({ click: async () => { events.push("password-submitted"); if (!options.wrongPassword) { gated = false; navigate(current.href); } } }),
    waitForURL: async (_predicate: unknown) => {},
    waitForTimeout: async (ms: number) => { expect(ms).toBe(2000); events.push("reset-wait"); },
  };
  const context = { request: {
    get: async (url: string, init: { maxRedirects: number }) => {
      expect(gated).toBe(false); expect(init.maxRedirects).toBe(0);
      expect(new URL(url).pathname).toBe("/test/login"); events.push("api-login");
      return { status: () => options.loginStatus ?? 303 };
    },
    post: async (url: string, init: { headers: { origin: string } }) => {
      expect(new URL(url).pathname).toBe("/test/reset"); expect(init.headers.origin).toBe("https://shiptorio.dev");
      // Reset must never overlap a mounted game/poller, including an old factory.
      expect(mounts).toBe(0); events.push("api-reset");
      const status = options.resetStatuses?.[resets++] ?? 200;
      return { status: () => status, ok: () => status === 200 };
    },
  } };
  return { page, context, events, mounts: () => mounts };
}
const staging = { origin: "https://shiptorio.dev", persona: "test-newbie", local: false, width: 390, password: "synthetic-preview" };

test("staging admits through inert password UI, then API login/reset before the first game mount", async () => {
  const h = harness();
  await prepareBotPersona({ ...staging, ...h });
  expect(h.events).toEqual(["page:/test/users", "password-filled", "password-submitted", "api-login", "api-reset", "page:/test/login", "game-mounted"]);
  expect(h.mounts()).toBe(1);
});

test("an already-admitted staging session never mounts the previous game before reset", async () => {
  const h = harness({ gated: false, resetStatuses: [409, 200] });
  await prepareBotPersona({ ...staging, ...h });
  expect(h.events).toEqual(["page:/test/users", "api-login", "api-reset", "reset-wait", "api-reset", "page:/test/login", "game-mounted"]);
});

test("missing/wrong preview password, denied login and failed reset remain failures before gameplay", async () => {
  for (const [options, override, expected] of [
    [{}, { password: undefined }, "preview password"],
    [{ wrongPassword: true }, {}, "form remains visible"],
    [{ loginStatus: 403 }, {}, "login unavailable: HTTP 403"],
    [{ resetStatuses: [503] }, {}, "reset unavailable: HTTP 503"],
  ] as const) {
    const h = harness(options);
    await expect(prepareBotPersona({ ...staging, ...h, ...override })).rejects.toThrow(expected);
    expect(h.mounts()).toBe(0);
  }
});

test("local, guest and second-width flows retain ordinary browser login without staging reset", async () => {
  for (const change of [{ local: true }, { persona: "test-guest" }, { width: 1280 }]) {
    const h = harness({ gated: false });
    const options = { ...staging, ...change };
    expect(botAdmissionPath(options)).toBe("/test/login");
    await prepareBotPersona({ ...options, ...h });
    expect(h.events).toEqual(["page:/test/login", "game-mounted", "page:/test/login", "game-mounted"]);
    expect(h.events).not.toContain("api-reset");
  }
});
