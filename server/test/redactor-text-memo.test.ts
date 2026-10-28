import { describe, expect, test } from "bun:test";
import { Redactor } from "../src/redact";

describe("short-text redaction memo", () => {
  test("registering a secret re-scrubs previously cached raw, URI and JSON variants", () => {
    const secret = 'private/雪 "quoted"\\value';
    const texts = [secret, encodeURIComponent(secret), JSON.stringify(secret).slice(1, -1)].map(s => `prefix ${s} suffix`);
    const redactor = new Redactor();
    for (const text of texts) {
      expect(redactor.text(text)).toBe(text);
      expect(redactor.text(text)).toBe(text);
    }
    redactor.register({ ACCESS_TOKEN: secret });
    for (const text of texts) {
      expect(redactor.text(text)).toBe("prefix [REDACTED] suffix");
      expect(redactor.text(text)).toBe("prefix [REDACTED] suffix");
    }
  });

  test("instances cannot reuse another instance's plaintext or credential policy", () => {
    const secret = "opaque credential 雪";
    const plain = new Redactor();
    const privateInstance = new Redactor({ API_KEY: secret });
    expect(plain.text(secret)).toBe(secret);
    expect(privateInstance.text(secret)).toBe("[REDACTED]");
    expect(plain.text(secret)).toBe(secret);
    expect(privateInstance.text(secret)).toBe("[REDACTED]");
  });

  test("previous-key registration invalidates prior text even when top-level key already exists", () => {
    const redactor = new Redactor({ CRED_PREVIOUS_KEYS: "{}" });
    const secret = "previous opaque secret 雪";
    expect(redactor.text(secret)).toBe(secret);
    redactor.register({ CRED_PREVIOUS_KEYS: JSON.stringify({ old: secret }) });
    expect(redactor.text(secret)).toBe("[REDACTED]");
  });

  test("eviction, long strings, expansion, and empty outputs preserve fresh-instance results", () => {
    const credentials = { PASSWORD: "x", PRIVATE_KEY: "private/key雪" };
    const redactor = new Redactor(credentials);
    const values = ["", "x".repeat(256), "x".repeat(257), "plain".repeat(100), "Bearer credential", "Contact person@example.com", "private%2Fkey%E9%9B%AA"];
    for (let i = 0; i < 300; i++) redactor.text(`ordinary object key ${i}`);
    for (const value of values) {
      const expected = new Redactor(credentials).text(value);
      expect(redactor.text(value)).toBe(expected);
      expect(redactor.text(value)).toBe(expected);
    }
    // Adding a new secret after eviction still invalidates every surviving entry.
    redactor.text("ordinary object key 299");
    redactor.register({ TOKEN: "ordinary object key 299" });
    expect(redactor.text("ordinary object key 299")).toBe("[REDACTED]");
  });
});
