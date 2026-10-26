import { createHmac, createPublicKey, generateKeyPairSync, verify } from "node:crypto";
import { describe, expect, it, spyOn } from "bun:test";
import { appJwt, installationToken, runnerInstallationToken, verifyWebhookSignature } from "../src/github";

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


describe("runner publishing credentials", () => {
  it("limits issuance to one repository and contents publishing, leaving server credentials unchanged", async () => {
    const { privateKey } = generateKeyPairSync("rsa", { modulusLength: 2048, privateKeyEncoding: { type: "pkcs8", format: "pem" }, publicKeyEncoding: { type: "spki", format: "pem" } });
    const env = { GITHUB_APP_ID: "123", GITHUB_APP_PRIVATE_KEY: privateKey };
    const bodies: (unknown | undefined)[] = [];
    const request = spyOn(globalThis, "fetch").mockImplementation((async (_url: unknown, init?: RequestInit) => {
      bodies.push(init?.body ? JSON.parse(String(init.body)) : undefined);
      return Response.json({ token: "fake-token" });
    }) as typeof fetch);
    try {
      expect(await runnerInstallationToken(env, 42, "owner/selected-repo")).toBe("fake-token");
      expect(bodies[0]).toEqual({ repositories: ["selected-repo"], permissions: { contents: "write", metadata: "read" } });
      await installationToken(env, 42);
      expect(bodies[1]).toBeUndefined();
      for (const repo of ["owner", "owner/repo/extra", "owner/..", "../repo", "owner/repo?other", "owner/repo\n", "owner/repo\\other"]) {
        await expect(runnerInstallationToken(env, 42, repo)).rejects.toThrow("Invalid runner repository");
      }
      expect(request).toHaveBeenCalledTimes(2);
    } finally { request.mockRestore(); }
  });
});
