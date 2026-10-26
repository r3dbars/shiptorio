// First-response timings for the live site: p50/p95 over N runs for the HTML shell, one hashed
// asset, the signed-in check, the repo list, and websocket open → first full FactoryState.
//   bun server/scripts/latency.ts [origin] [repo]          (default http://localhost:8787, r3dbars/shiptorio)
// Against the deployed site, pass the preview cookie: SHIPTORIO_COOKIE="shiptorio_access=...; shiptorio_session=..."
const origin = (process.argv[2] ?? "http://localhost:8787").replace(/\/$/, "");
const repo = process.argv[3] ?? "r3dbars/shiptorio";
const runs = Number(process.env.RUNS ?? 20);
const headers: Record<string, string> = process.env.SHIPTORIO_COOKIE ? { cookie: process.env.SHIPTORIO_COOKIE } : {};

const pct = (xs: number[], p: number) => [...xs].sort((a, b) => a - b)[Math.min(xs.length - 1, Math.floor((xs.length - 1) * p))];
const row = (name: string, xs: number[], extra = "") =>
  console.log(`${name.padEnd(26)} p50 ${pct(xs, 0.5).toFixed(0).padStart(5)} ms   p95 ${pct(xs, 0.95).toFixed(0).padStart(5)} ms ${extra}`);

async function time(url: string) {
  const t = performance.now();
  const r = await fetch(url, { headers, redirect: "manual" });
  const body = await r.arrayBuffer();
  return { ms: performance.now() - t, status: r.status, bytes: body.byteLength, timing: r.headers.get("server-timing"), cache: r.headers.get("cache-control") };
}

async function series(name: string, url: string) {
  const xs: number[] = [];
  let last: Awaited<ReturnType<typeof time>> | undefined;
  for (let i = 0; i < runs; i++) xs.push((last = await time(url)).ms);
  row(name, xs, `· ${last!.status} · ${(last!.bytes / 1024).toFixed(1)} KB${last!.cache ? ` · ${last!.cache}` : ""}${last!.timing ? ` · ${last!.timing}` : ""}`);
  return last!;
}

const html = await series("GET /", `${origin}/`);
const asset = (await (await fetch(`${origin}/`, { headers })).text()).match(/\/assets\/[\w.-]+\.js/)?.[0];
if (asset) await series(`GET ${asset.slice(0, 22)}…`, origin + asset);
else console.log("no /assets/*.js in the HTML (status", html.status, ")");
await series("GET /api/me", `${origin}/api/me`);
await series("GET /api/repos", `${origin}/api/repos`);

// websocket: open → first message carrying a full state
const ws: number[] = [];
let size = 0;
for (let i = 0; i < Math.min(runs, 10); i++) {
  const t = performance.now();
  const ms = await new Promise<number>((resolve) => {
    const sock = new WebSocket(`${origin.replace(/^http/, "ws")}/api/repos/${repo}/factory`, { headers } as unknown as string[]);
    const done = (v: number) => (sock.close(), resolve(v));
    setTimeout(() => done(NaN), 10_000);
    sock.onmessage = (e) => {
      const text = String(e.data);
      if (text.includes('"state"') || text.includes('"full"') || text.includes('"machines"')) (size = text.length), done(performance.now() - t);
    };
    sock.onerror = () => done(NaN);
  });
  if (!Number.isNaN(ms)) ws.push(ms);
}
if (ws.length) row("ws open → first state", ws, `· ${(size / 1024).toFixed(1)} KB`);
else console.log("ws: no full state within 10s (signed in? repo allowed?)");
