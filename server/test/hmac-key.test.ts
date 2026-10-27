import { describe, expect, it } from "bun:test";
import { HmacKeyCache } from "../src/hmac-key";
import { verifyWebhookSignature } from "../src/github";
import { verifyHmac } from "../src/sources/types";
import { pairToken, readRunnerToken } from "../src/runner-auth";

const encoder = new TextEncoder();
const importKey = (secret: string, hash: "SHA-256" | "SHA-1") => crypto.subtle.importKey("raw", encoder.encode(secret), { name: "HMAC", hash }, false, ["sign"]);
describe("bounded HMAC signing-key imports", () => {
  it("shares concurrent imports but isolates secrets and algorithms", async () => {
    let imports = 0;
    const cache = new HmacKeyCache((secret, hash) => { imports++; return importKey(secret, hash); });
    const keys = await Promise.all(Array.from({ length: 20 }, () => cache.get("fixture-a")));
    expect(imports).toBe(1);
    expect(keys.every(key => key === keys[0])).toBe(true);
    expect(keys[0].extractable).toBe(false);
    expect(keys[0].usages).toEqual(["sign"]);
    expect(await cache.get("fixture-b")).not.toBe(keys[0]);
    expect(await cache.get("fixture-a", "SHA-1")).not.toBe(keys[0]);
    expect(imports).toBe(3);
  });
  it("bounds retained entries and evicts the least recently used key", async () => {
    let imports = 0;
    const cache = new HmacKeyCache((secret, hash) => { imports++; return importKey(secret, hash); });
    for (let i = 0; i < 16; i++) await cache.get(`fixture-${i}`);
    await cache.get("fixture-0");
    await cache.get("fixture-16");
    await cache.get("fixture-0");
    expect(imports).toBe(17);
    await cache.get("fixture-1");
    expect(imports).toBe(18);
  });
  it("retries failed imports instead of caching a rejection", async () => {
    let imports = 0;
    const cache = new HmacKeyCache((secret, hash) => {
      if (++imports === 1) return Promise.reject(new Error("fixture unavailable"));
      return importKey(secret, hash);
    });
    await expect(cache.get("fixture-a")).rejects.toThrow("fixture unavailable");
    expect(await cache.get("fixture-a")).toBeDefined();
    expect(imports).toBe(2);
  });
  it("preserves valid signatures, raw body integrity, rotation and runner expiry", async () => {
    const body = '{"action":"opened"}';
    const key = await importKey("fixture-old", "SHA-256");
    const signature = Buffer.from(await crypto.subtle.sign("HMAC", key, encoder.encode(body))).toString("hex");
    for (let i = 0; i < 2; i++) {
      expect(await verifyWebhookSignature("fixture-old", body, `sha256=${signature}`)).toBe(true);
      expect(await verifyHmac("fixture-old", body, signature)).toBe(true);
      expect(await verifyWebhookSignature("fixture-new", body, `sha256=${signature}`)).toBe(false);
      expect(await verifyHmac("fixture-new", body, signature)).toBe(false);
      expect(await verifyHmac("fixture-old", body + " ", signature)).toBe(false);
    }
    const identity = { repo: "fixture/repo", pairId: "pair", expires: 2000 };
    const token = await pairToken("fixture-old", identity);
    expect(await readRunnerToken("fixture-old", token, 1000)).toEqual(identity);
    expect(await readRunnerToken("fixture-new", token, 1000)).toBeNull();
    expect(await readRunnerToken("fixture-old", token, 2000)).toBeNull();
  });
});
