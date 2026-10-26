import { createHmac, createPublicKey, generateKeyPairSync, verify } from "node:crypto";
import { describe, expect, it } from "vitest";
import { appJwt, verifyWebhookSignature } from "../src/github";

describe("verifyWebhookSignature", () => {
  const body = JSON.stringify({ hello: "factory" });
  const sig = "sha256=" + createHmac("sha256", "s3cret").update(body).digest("hex");

  it("accepts GitHub's signature", async () => {
    expect(await verifyWebhookSignature("s3cret", body, sig)).toBe(true);
  });

  it("rejects a wrong secret, a tampered body, or no header", async () => {
    expect(await verifyWebhookSignature("nope", body, sig)).toBe(false);
    expect(await verifyWebhookSignature("s3cret", body + " ", sig)).toBe(false);
    expect(await verifyWebhookSignature("s3cret", body, null)).toBe(false);
  });
});

describe("appJwt", () => {
  for (const type of ["pkcs1", "pkcs8"] as const) {
    it(`signs a valid RS256 JWT from a ${type} key`, async () => {
      const { privateKey, publicKey } = generateKeyPairSync("rsa", {
        modulusLength: 2048,
        privateKeyEncoding: { type, format: "pem" },
        publicKeyEncoding: { type: "spki", format: "pem" },
      });
      const jwt = await appJwt("12345", privateKey, 1_700_000_000_000);
      const [h, p, s] = jwt.split(".");
      const payload = JSON.parse(Buffer.from(p, "base64url").toString());
      expect(payload).toEqual({ iat: 1_699_999_940, exp: 1_699_999_940 + 540, iss: "12345" });
      const ok = verify("sha256", Buffer.from(`${h}.${p}`), createPublicKey(publicKey), Buffer.from(s, "base64url"));
      expect(ok).toBe(true);
    });
  }
});

// Missing local webhook configuration must fail closed, rather than throw.
it("rejects a webhook when no signing secret is configured", async () => {
  expect(await verifyWebhookSignature("", "{}", "sha256=bad")).toBe(false);
});
