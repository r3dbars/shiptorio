// Offline microbenchmark, not an HTTP/DO load test or Cloudflare billing probe.
// bun server/scripts/profile-request-helpers.ts > /tmp/request-helper-profile.json
import { HmacKeyCache } from "../src/hmac-key";
import { redact, Redactor } from "../src/redact";

const encoder = new TextEncoder();
const samples = 30, iterations = 1000;
const env = { SESSION_SECRET: "fixture-session-only", META_API_KEY: "fixture-meta-only", GITHUB_WEBHOOK_SECRET: "fixture-webhook-only" };
const fields = { event: "fixture.event", message: "fixture-meta-only", repo: "fixture/repo" };
const body = encoder.encode('{"action":"opened","repository":{"full_name":"fixture/repo"}}');
// Synthetic helper counts exercise each path's components; they are not measured
// request mixes. Tick has no HMAC verification and deliberately exercises many logs.
const fixtures = [
  { name: "webhook helpers", secret: env.GITHUB_WEBHOOK_SECRET, logs: 4, indexes: 4 },
  { name: "tick logging helpers", secret: undefined, logs: 12, indexes: 2 },
  { name: "heartbeat helpers", secret: env.SESSION_SECRET, logs: 1, indexes: 0 },
  { name: "claim helpers", secret: env.SESSION_SECRET, logs: 1, indexes: 0 },
];
const percentile = (values: number[], p: number) => [...values].sort((a, b) => a - b)[Math.ceil(values.length * p) - 1];
let sink = 0;
const results = [];
for (const fixture of fixtures) {
  const cache = new HmacKeyCache();
  const run = async (cached: boolean) => {
    if (fixture.secret) {
      const key = cached ? await cache.get(fixture.secret) : await crypto.subtle.importKey("raw", encoder.encode(fixture.secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
      sink += (await crypto.subtle.sign("HMAC", key, body)).byteLength;
    }
    const prepared = cached ? new Redactor(env) : undefined;
    for (let i = 0; i < fixture.logs; i++) {
      const entry = (prepared ?? new Redactor(env)).value(redact(fields));
      if (cached && fixture.indexes) {
        const serialized = JSON.stringify(entry);
        for (let j = 0; j < fixture.indexes; j++) sink += serialized.length;
      } else for (let j = 0; j < fixture.indexes; j++) sink += JSON.stringify(entry).length;
    }
  };
  // Warm both implementations before alternating sample order to limit JIT/order bias.
  for (let i = 0; i < 100; i++) { await run(false); await run(true); }
  const measurements = { before: { wall: [] as number[], cpu: [] as number[] }, after: { wall: [] as number[], cpu: [] as number[] } };
  for (let sample = 0; sample < samples; sample++) {
    for (const cached of sample % 2 ? [true, false] : [false, true]) {
      const startCpu = process.cpuUsage(), start = performance.now();
      for (let i = 0; i < iterations; i++) await run(cached);
      const wall = performance.now() - start, cpu = process.cpuUsage(startCpu);
      const row = cached ? measurements.after : measurements.before;
      row.wall.push(wall / iterations);
      row.cpu.push((cpu.user + cpu.system) / 1000 / iterations);
    }
  }
  results.push({ fixture, ...Object.fromEntries(Object.entries(measurements).map(([name, values]) => [name, {
    wallMsPerIterationP50: percentile(values.wall, .5), wallMsPerIterationP95: percentile(values.wall, .95),
    processCpuMsPerIterationP50: percentile(values.cpu, .5), processCpuMsPerIterationP95: percentile(values.cpu, .95),
  }])) });
}
console.log(JSON.stringify({ runtime: Bun.version, samples, iterationsPerSample: iterations,
  metric: "local whole-process user+system CPU per batch divided by iterations; quantiles are batch means, not per-request CPU", cloudflareCpuReduction30Percent: "UNPROVEN", sink, results }, null, 2));
