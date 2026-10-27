import { expect, test } from "bun:test";
import { maintainConnection, renewalDue, RunnerGrantRejected, runnerResponseError } from "../src/health";
import { Backoff } from "../src/recovery";
const authModule = "../../server/src/runner-auth";
const { pairToken, readRunnerToken, runnerGrantExpiry } = await import(authModule) as {
  pairToken(secret: string, identity: {repo: string; pairId: string; expires: number}): Promise<string>;
  readRunnerToken(secret: string, token: string, now?: number): Promise<object | null>;
  runnerGrantExpiry(user?: { expiresAt: number }, now?: number): number;
};

test("twelve hours asleep and ten minutes offline keep the same valid grant and reconnect", async () => {
  const start = 1700000000000;
  let now = start;
  const expires = runnerGrantExpiry(undefined, start);
  const pair = { repo: "fixture/repo", expires, token: await pairToken("fixture-secret", { repo: "fixture/repo", pairId: "fixture-pair", expires }) };
  const original = { ...pair };
  let renewals = 0, connected = 0, failures = 0;
  const backoff = new Backoff(() => 1);
  now += 12 * 3600_000;
  const onlineAt = now + 10 * 60_000;
  const step = () => maintainConnection(pair, {
    now: () => now,
    renew: async () => { renewals++; throw Error("The valid seven-day grant should not need renewal yet"); },
    heartbeat: async p => {
      if (now < onlineAt) throw new TypeError("Network unavailable");
      expect(await readRunnerToken("fixture-secret", p.token, now)).not.toBeNull();
      connected++;
    },
  });
  while (now <= onlineAt + 60_000 && !connected) {
    if (backoff.ready(now)) {
      try { await step(); backoff.reset(); }
      catch { failures++; backoff.fail(now); }
    }
    now += 1000;
  }
  expect(failures).toBeGreaterThan(1);
  expect(connected).toBe(1);
  expect(renewals).toBe(0);
  expect(pair).toEqual(original);
});

test("heartbeat renews early during an active build and never extends the approving session", async () => {
  const now = 1700000000000, sessionEnd = now + 6 * 3600_000;
  expect(runnerGrantExpiry({ expiresAt: sessionEnd } as any, now)).toBe(sessionEnd);
  const pair = { repo: "fixture/repo", token: "old", expires: now + 23 * 3600_000 };
  const order: string[] = [];
  await maintainConnection(pair, { now: () => now,
    renew: async p => { order.push("renew"); p.token = "renewed"; p.expires = runnerGrantExpiry(undefined, now); },
    heartbeat: async p => { order.push("heartbeat"); expect(p.token).toBe("renewed"); },
  });
  expect(order).toEqual(["renew", "heartbeat"]);
  expect(renewalDue(pair, now)).toBe(false);
});

test("backoff resumes after a backwards wall-clock correction", () => {
  const retry = new Backoff(() => 1);
  retry.fail(100000);
  expect(retry.ready(100500)).toBe(false);
  expect(retry.ready(500)).toBe(true);
});


test("only explicit permanent grant failures stop a connection; generic 401 and network failures stay retryable", async () => {
  for (const code of ["runner_grant_expired", "runner_grant_invalid", "runner_pair_revoked", "runner_access_revoked"]) {
    const error = await runnerResponseError(Response.json({code}, {status: code === "runner_access_revoked" ? 403 : 401}), "fixture/repo", "heartbeat");
    expect(error).toBeInstanceOf(RunnerGrantRejected);
    expect(error.message).toContain("shiptorio-runner pair");
  }
  for (const response of [new Response("upstream auth", {status:401}), Response.json({error:"unauthorized"}, {status:401}), Response.json({code:"runner_pair_revoked"}, {status:500}), Response.json({code:["runner_pair_revoked"]}, {status:401})]) {
    expect(await runnerResponseError(response, "fixture/repo", "heartbeat")).not.toBeInstanceOf(RunnerGrantRejected);
  }
});
