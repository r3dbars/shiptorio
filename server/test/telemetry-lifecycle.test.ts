import { expect, it, spyOn } from "bun:test";
import { currentRedactor, inTrace, log } from "../src/telemetry";

it("prepares environment secrets once per trace and isolates concurrent requests", async () => {
  const info = spyOn(console, "info").mockImplementation(() => {});
  let reads = 0;
  const env = (secret: string) => ({ get API_KEY() { reads++; return secret; } });
  try {
    await Promise.all(["fixture-alpha", "fixture-beta"].map(secret => inTrace({ requestId: secret }, env(secret) as never, () => {}, async () => {
      for (let i = 0; i < 3; i++) {
        await Promise.resolve();
        const entry = log("info", "fixture.event", { message: secret }, { persist: false });
        expect(entry.message).toBe("[REDACTED]");
      }
    })));
    expect(reads).toBe(2);
    expect(info).toHaveBeenCalledTimes(6);
    const rotated = inTrace({ requestId: "rotation" }, env("fixture-rotated") as never, () => {}, () => log("info", "fixture.event", { message: "fixture-rotated" }, { persist: false }));
    expect(rotated.message).toBe("[REDACTED]");
    expect(reads).toBe(3);
  } finally { info.mockRestore(); }
});

it("shares registered request credentials with subsequent logs and drops them after the trace", () => {
  const info = spyOn(console, "info").mockImplementation(() => {});
  try {
    expect(currentRedactor()).toBeUndefined();
    inTrace({ requestId: "credential-scope" }, {}, () => {}, () => {
      const redactor = currentRedactor()!;
      redactor.register({ token: "fixture-decrypted-only" });
      expect(log("info", "fixture.event", { message: "fixture-decrypted-only" }, { persist: false }).message).toBe("[REDACTED]");
      inTrace({ requestId: "nested" }, {}, () => {}, () => expect(currentRedactor()).not.toBe(redactor));
      expect(currentRedactor()).toBe(redactor);
    });
    expect(currentRedactor()).toBeUndefined();
  } finally { info.mockRestore(); }
});
