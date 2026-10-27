import { expect, test } from "bun:test";
import { Redactor } from "../src/redact";
import { sentryOptions } from "../src/telemetry";

const forms = (secret: string) => [secret, encodeURIComponent(secret), JSON.stringify(secret).slice(1, -1)].join("|");

test("late registration still scrubs longer overlapping secrets before their prefixes", () => {
  const prefix = "shared-private-value";
  const longer = `${prefix}-suffix`;
  const redactor = new Redactor({ TOKEN: prefix });
  expect(redactor.text(prefix)).toBe("[REDACTED]");
  redactor.register({ API_KEY: longer });
  expect(redactor.text(`${longer}|${prefix}`)).toBe("[REDACTED]|[REDACTED]");
  redactor.register({ TOKEN: prefix });
  expect(redactor.text(longer)).toBe("[REDACTED]");
});

test("warm caches preserve raw, URI, JSON and previous-key redaction", () => {
  const secret = 'opaque+/= "line\\\nnext';
  const previous = 'previous+/= "key\\\nline';
  const redactor = new Redactor({ SESSION_SECRET: secret });
  for (let i = 0; i < 3; i++) expect(redactor.text(forms(secret))).toBe("[REDACTED]|[REDACTED]|[REDACTED]");
  redactor.register({ CRED_PREVIOUS_KEYS: JSON.stringify({ "1": previous }) });
  for (let i = 0; i < 3; i++) expect(redactor.text(forms(previous))).toBe("[REDACTED]|[REDACTED]|[REDACTED]");
});


test("raw-secret priority is preserved when an encoded form overlaps another secret", () => {
  const redactor = new Redactor({ TOKEN: "+", API_KEY: "%2" });
  // The longer raw secret wins before the shorter secret's URI form; do not sort encoded lengths.
  expect(redactor.text("%2B")).toBe("[REDACTED]B");
  expect(redactor.text("%2B")).toBe("[REDACTED]B");
});

test("cached PEM secrets remain hidden in raw, URI and JSON forms", () => {
  const pem = "-----BEGIN PRIVATE KEY-----\nZmFrZS1rZXk=\n-----END PRIVATE KEY-----";
  const redactor = new Redactor({ GITHUB_APP_PRIVATE_KEY: pem });
  for (let i = 0; i < 3; i++) expect(redactor.text(forms(pem))).toBe("[REDACTED]|[REDACTED]|[REDACTED]");
});

test("Sentry options keep env secret sets isolated across interleaved callbacks", () => {
  const alpha = "opaque-alpha-private-value", beta = "opaque-beta-private-value";
  const a = sentryOptions({ SESSION_SECRET: alpha } as never);
  const b = sentryOptions({ SESSION_SECRET: beta } as never);
  for (let i = 0; i < 3; i++) {
    expect(a.beforeBreadcrumb!({ message: `${alpha}|${beta}` }, {})!.message).toBe(`[REDACTED]|${beta}`);
    expect(b.beforeBreadcrumb!({ message: `${alpha}|${beta}` }, {})!.message).toBe(`${alpha}|[REDACTED]`);
  }
});

test("Sentry callbacks observe secret mutation, removal and previous-key rotation", () => {
  const old = "opaque-first-private-value", next = 'opaque-next+/= "value', previous = "opaque-previous-private-value";
  const env: Record<string, string> = { SESSION_SECRET: old };
  const options = sentryOptions(env);
  expect(options.beforeBreadcrumb!({ message: old }, {})!.message).toBe("[REDACTED]");
  env.SESSION_SECRET = next;
  expect(options.beforeBreadcrumb!({ message: forms(next) }, {})!.message).toBe("[REDACTED]|[REDACTED]|[REDACTED]");
  expect(options.beforeBreadcrumb!({ message: old }, {})!.message).toBe(old);
  env.CRED_PREVIOUS_KEYS = JSON.stringify({ "1": previous });
  expect(options.beforeSend!({ message: previous, request: { url: "https://private.example" }, user: { id: "123", ip_address: "192.0.2.1" } }, {})).toEqual({ message: "[REDACTED]", user: { id: "123" } });
  delete env.SESSION_SECRET;
  delete env.CRED_PREVIOUS_KEYS;
  expect(options.beforeBreadcrumb!({ message: `${next}|${previous}` }, {})!.message).toBe(`${next}|${previous}`);
});
