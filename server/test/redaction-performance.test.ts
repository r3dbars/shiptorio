import { expect, test } from "bun:test";
import { redactText } from "../src/redact";

// A separate process lets the watchdog stop a pathological regexp without hanging
// the entire suite. The old implementation exceeds this generous 2-second budget.
test("redaction handles long untrusted tokens without quadratic rescanning", async () => {
  const module = new URL("../src/redact.ts", import.meta.url).href;
  const child = Bun.spawn([process.execPath, "--no-env-file", "-e", `
    import { redactText } from ${JSON.stringify(module)};
    const token = "x".repeat(200000);
    if (redactText(token) !== token) process.exit(2);
    if (redactText(token + "@example.com") !== "[EMAIL]") process.exit(3);
    if (!redactText(token + "_api_key=private-value").endsWith("[REDACTED]")) process.exit(4);
  `], { stdout: "ignore", stderr: "pipe" });
  let timedOut = false;
  const timer = setTimeout(() => { timedOut = true; child.kill(); }, 2000);
  try {
    const code = await child.exited;
    expect(timedOut).toBe(false);
    expect(code).toBe(0);
  } finally { clearTimeout(timer); child.kill(); }
});

test("token boundaries preserve credential and email scrubbing", () => {
  expect(redactText('prefix custom_api_key="private"; another-secret: hidden'))
    .toBe('prefix custom_api_key="[REDACTED]"; another-secret: [REDACTED]');
  expect(redactText("Contact first.last+tag@example.co.uk or a-b@example.com."))
    .toBe("Contact [EMAIL] or [EMAIL].");
  expect(redactText("Bearer private-bearer github_pat_private sk-private"))
    .toBe("Bearer [REDACTED] [REDACTED] [REDACTED]");
  expect(redactText("ordinary_identifier=ordinary-value"))
    .toBe("ordinary_identifier=ordinary-value");
});
