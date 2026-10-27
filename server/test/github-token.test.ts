import { describe, expect, it } from "bun:test";
import { gh, GitHubError, installationToken, purgeInstallationTokens, runnerInstallationToken } from "../src/github";

async function credentials() {
  const keys = await crypto.subtle.generateKey({ name: "RSASSA-PKCS1-v1_5", modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: "SHA-256" }, true, ["sign", "verify"]);
  return { GITHUB_APP_ID: crypto.randomUUID(), GITHUB_APP_PRIVATE_KEY: `-----BEGIN PRIVATE KEY-----\n${Buffer.from(await crypto.subtle.exportKey("pkcs8", keys.privateKey)).toString("base64")}\n-----END PRIVATE KEY-----` };
}

// Other test files can leave provider calls in flight (retries with backoff) that land on this file's fetch mock.
// Answer anything that isn't the GitHub API with a 503 so it never counts as a GitHub request.
function onlyGitHub(handler: (url: any, init?: RequestInit) => Promise<Response>) {
  return (url: any, init?: RequestInit) => String(url).startsWith("https://api.github.com/") ? handler(url, init) : Promise.resolve(new Response(null, { status: 503 }));
}

describe("installation token lifecycle", () => {
  it("coalesces issuance, caches by installation and scope, and refreshes one minute before expiry", async () => {
    const env = await credentials();
    const original = globalThis.fetch, clock = Date.now;
    const now = clock(); let at = now, issued = 0;
    Date.now = () => at;
    globalThis.fetch = onlyGitHub(async () => Response.json({ token: `cache-${++issued}`, expires_at: new Date(at + 3600000).toISOString() })) as unknown as typeof fetch;
    try {
      expect(await Promise.all([installationToken(env, 1), installationToken(env, 1)])).toEqual(["cache-1", "cache-1"]);
      expect(await installationToken(env, 1)).toBe("cache-1");
      expect(await runnerInstallationToken(env, 1, "org/demo")).toBe("cache-2");
      expect(await installationToken(env, 2)).toBe("cache-3");
      at = now + 3540001;
      expect(await installationToken(env, 1)).toBe("cache-4");
      purgeInstallationTokens(1);
      expect(await installationToken(env, 1)).toBe("cache-5");
    } finally { globalThis.fetch = original; Date.now = clock; }
  });
  for (const status of [401, 403]) {
    it(`${status} refetches once and surfaces the second failure`, async () => {
      const env = await credentials(); const original = globalThis.fetch;
      let issued = 0, requests = 0;
      globalThis.fetch = onlyGitHub(async (url: any) => String(url).endsWith("/access_tokens") ? Response.json({ token: `retry-${env.GITHUB_APP_ID}-${++issued}`, expires_at: new Date(Date.now() + 3600000).toISOString() }) : (requests++, new Response(null, { status }))) as unknown as typeof fetch;
      try {
        const token = await installationToken(env, 10);
        await expect(gh("/test", token)).rejects.toBeInstanceOf(GitHubError);
        expect(issued).toBe(2); expect(requests).toBe(2);
      } finally { globalThis.fetch = original; }
    });
  }
  it("uses the replacement credential on a successful retry", async () => {
    const env = await credentials(); const original = globalThis.fetch;
    let issued = 0; const used: string[] = [];
    globalThis.fetch = onlyGitHub(async (url: any, init?: RequestInit) => {
      if (String(url).endsWith("/access_tokens")) return Response.json({ token: `success-${++issued}`, expires_at: new Date(Date.now() + 3600000).toISOString() });
      used.push(new Headers(init?.headers).get("authorization")!);
      return used.length === 1 ? new Response(null, { status: 401 }) : Response.json({ ok: true });
    }) as unknown as typeof fetch;
    try { expect(await gh("/test", await installationToken(env, 11))).toEqual({ ok: true }); expect(used).toEqual(["Bearer success-1", "Bearer success-2"]); } finally { globalThis.fetch = original; }
  });
  it("cross-isolate generation changes refresh even tokens held by an ongoing operation; suspension fails closed", async () => {
    let version = 1, status = "active", issued = 0, calls = 0;
    const env = { ...await credentials(), DB: { prepare: () => ({ bind: () => ({ run: async () => ({}), first: async () => ({ token_version: version, status }) }) }) } };
    const original = globalThis.fetch;
    globalThis.fetch = onlyGitHub(async (url: any) => String(url).endsWith("/access_tokens") ? Response.json({ token: `generation-${++issued}`, expires_at: new Date(Date.now() + 3600000).toISOString() }) : (calls++, Response.json({ ok: true }))) as unknown as typeof fetch;
    try {
      const old = await installationToken(env as never, 50);
      version++;
      await gh("/test", old);
      expect(issued).toBe(2);
      status = "suspended";
      await expect(gh("/test", old)).rejects.toThrow("suspended");
      expect(calls).toBe(1);
    } finally { globalThis.fetch = original; }
  });
});

describe("shared installation tokens", () => {
  const kv = () => { const data = new Map<string, string>(); return { data, get: async (k: string, type?: string) => { const v = data.get(k); return v === undefined ? null : type === "json" ? JSON.parse(v) : v; }, put: async (k: string, v: string) => { data.set(k, v); }, delete: async (k: string) => { data.delete(k); } }; };
  // A second module instance stands in for another Worker isolate with an empty in-memory cache.
  const isolate = (n: number) => { const path = `../src/github.ts?isolate=${n}-${crypto.randomUUID()}`; return import(path) as Promise<typeof import("../src/github")>; };
  it("another isolate reuses the encrypted KV token instead of minting, and never stores it in plaintext", async () => {
    const cache = kv();
    const env = { ...await credentials(), CACHE: cache, CRED_MASTER_KEY: Buffer.from(crypto.getRandomValues(new Uint8Array(32))).toString("base64") };
    const original = globalThis.fetch; let issued = 0;
    globalThis.fetch = (async () => Response.json({ token: `shared-${++issued}`, expires_at: new Date(Date.now() + 3600000).toISOString() })) as unknown as typeof fetch;
    try {
      const [a, b] = await Promise.all([isolate(1), isolate(2)]);
      expect(await a.installationToken(env as never, 70)).toBe("shared-1");
      expect(await b.installationToken(env as never, 70)).toBe("shared-1");
      expect(issued).toBe(1);
      expect([...cache.data.values()].join()).not.toContain("shared-1");
      // Close to expiry, the shared copy is ignored and a fresh token replaces it.
      const clock = Date.now; Date.now = () => clock() + 3300000;
      try { expect(await (await isolate(3)).installationToken(env as never, 70)).toBe("shared-2"); } finally { Date.now = clock; }
    } finally { globalThis.fetch = original; }
  });
  it("after GitHub refuses a token, the retry mints instead of reusing the shared copy", async () => {
    const env = { ...await credentials(), CACHE: kv(), CRED_MASTER_KEY: Buffer.from(crypto.getRandomValues(new Uint8Array(32))).toString("base64") };
    const original = globalThis.fetch; let issued = 0; const used: string[] = [];
    globalThis.fetch = (async (url: any, init?: RequestInit) => {
      if (String(url).endsWith("/access_tokens")) return Response.json({ token: `refused-${++issued}`, expires_at: new Date(Date.now() + 3600000).toISOString() });
      used.push(new Headers(init?.headers).get("authorization")!);
      return used.length === 1 ? new Response(null, { status: 401 }) : Response.json({ ok: true });
    }) as unknown as typeof fetch;
    try {
      const [a, b] = await Promise.all([isolate(4), isolate(5)]);
      await a.installationToken(env as never, 71);
      expect(await b.gh("/test", await b.installationToken(env as never, 71))).toEqual({ ok: true });
      expect(used).toEqual(["Bearer refused-1", "Bearer refused-2"]);
    } finally { globalThis.fetch = original; }
  });
});
