import { expect, test } from "bun:test";
import { runnerOrigin } from "../src/origin";

test("self-hosted origins are supported without accepting insecure or credential-bearing URLs", () => {
  for (const origin of ["https://shiptorio.com", "https://shiptorio-test.example.workers.dev", "https://factory.example:8443", "http://localhost:8787", "http://127.0.0.1:9876", "http://[::1]:8787"]) {
    expect(runnerOrigin(origin + "/")).toBe(origin);
  }
  for (const origin of ["http://remote.example", "https://user:secret@factory.example", "https://factory.example/path", "https://factory.example?key=x", "https://factory.example#fragment", "file:///tmp/runner", "invalid"]) {
    expect(() => runnerOrigin(origin)).toThrow();
  }
});
