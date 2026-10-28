import { afterEach, expect, test } from "bun:test";
import { mkdtemp, mkdir, rm, symlink, writeFile, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { assertLocalEndpoint, assertResolvesLocal, detectLocalModel, localModelConfig, parseLocalEdits, runLocalAssembler, OLLAMA_URL } from "../src/local-model";
import { fakeOllama, type FakeOllama } from "./fake-ollama";

let server: FakeOllama | undefined;
let dirs: string[] = [];
afterEach(async () => { server?.stop(); server = undefined; for (const d of dirs) await rm(d, { recursive: true, force: true }); dirs = []; });
const checkout = async () => { const d = await mkdtemp(join(tmpdir(), "shiptorio-local-")); dirs.push(d); return d; };
const edits = (files: { path: string; content: string }[], summary = "Fixed it") => JSON.stringify({ summary, files });

test("config is opt-in, defaults to Ollama, and refuses endpoints off this machine or LAN", () => {
  expect(localModelConfig({})).toBeNull();
  expect(localModelConfig({ SHIPTORIO_LOCAL_MODEL: "qwen2.5-coder:7b" })).toEqual({ baseUrl: OLLAMA_URL, model: "qwen2.5-coder:7b" });
  for (const ok of ["http://localhost:1234/v1", "http://127.0.0.1:8080/v1", "http://192.168.1.20:11434/v1", "http://gpu-box.local:8000/v1", "http://[::1]:11434/v1"]) expect(() => assertLocalEndpoint(ok)).not.toThrow();
  for (const bad of ["https://api.openai.com/v1", "http://8.8.8.8/v1", "http://user:pw@localhost/v1", "file:///etc/passwd", "http://localhost.evil.com/v1", "nope"]) expect(() => assertLocalEndpoint(bad)).toThrow();
  expect(() => localModelConfig({ SHIPTORIO_LOCAL_MODEL: "x; rm -rf /" })).toThrow();
  expect(localModelConfig({}, { model: "llama3.2:3b", url: "http://127.0.0.1:8080/v1" })).toEqual({ baseUrl: "http://127.0.0.1:8080/v1", model: "llama3.2:3b" });
  expect(localModelConfig({ SHIPTORIO_LOCAL_MODEL: "a" }, { model: "b" })?.model).toBe("a");
  expect(() => localModelConfig({}, { model: "m", url: "https://api.example.com/v1" })).toThrow();
});

test.skipIf(process.env.SHIPTORIO_CHECK_SANDBOX === "1")("detection reports a loaded model and explains a missing one", async () => {
  server = fakeOllama(() => "{}", ["llama3.2:3b", "qwen2.5-coder:7b"]);
  expect((await detectLocalModel({ baseUrl: server.url, model: "qwen2.5-coder:7b" })).ok).toBe(true);
  const missing = await detectLocalModel({ baseUrl: server.url, model: "gemma:2b" });
  expect(missing.ok).toBe(false);
  expect(missing.reason).toContain("gemma:2b");
  expect((await detectLocalModel({ baseUrl: "http://127.0.0.1:1/v1", model: "x" })).ok).toBe(false);
});

test("the model's reply is untrusted: JSON only, approved paths only, no duplicates", () => {
  expect(parseLocalEdits("```json\n" + edits([{ path: "README.md", content: "hi" }]) + "\n```", ["README.md"]).files).toHaveLength(1);
  expect(() => parseLocalEdits("Sure! Here is the fix", ["README.md"])).toThrow("JSON");
  expect(() => parseLocalEdits(edits([]), ["README.md"])).toThrow("no file edits");
  expect(() => parseLocalEdits(edits([{ path: ".github/workflows/ci.yml", content: "x" }]), ["README.md"])).toThrow("outside");
  expect(() => parseLocalEdits(edits([{ path: "README.md", content: "a" }, { path: "README.md", content: "b" }]), ["README.md"])).toThrow("outside");
  expect(() => parseLocalEdits(JSON.stringify({ files: [{ path: "README.md", content: 5 }] }), ["README.md"])).toThrow("malformed");
});

test.skipIf(process.env.SHIPTORIO_CHECK_SANDBOX === "1")("assembler sends the plan and files to the local model and writes only approved edits", async () => {
  const work = await checkout();
  await writeFile(join(work, "README.md"), "Run bun isntall\n");
  server = fakeOllama(body => {
    expect(body.model).toBe("qwen2.5-coder:7b");
    expect(body.messages[1].content).toContain("Fix the typo");
    expect(body.messages[1].content).toContain("Run bun isntall");
    return edits([{ path: "README.md", content: "Run bun install\n" }, { path: "docs/new.md", content: "# New\n" }], "Fixed the typo");
  });
  const out = await runLocalAssembler({ plan: "Fix the typo in README", allowedPaths: ["README.md", "docs/new.md"] }, work, { baseUrl: server.url, model: "qwen2.5-coder:7b" });
  expect(out).toEqual({ summary: "Fixed the typo", paths: ["README.md", "docs/new.md"] });
  expect(await readFile(join(work, "README.md"), "utf8")).toBe("Run bun install\n");
  expect(await readFile(join(work, "docs/new.md"), "utf8")).toBe("# New\n");
  expect(server.requests).toHaveLength(1);
});

test.skipIf(process.env.SHIPTORIO_CHECK_SANDBOX === "1")("assembler refuses big jobs, symlink escapes, empty edits and endpoint errors", async () => {
  const work = await checkout(), outside = await checkout();
  const config = () => ({ baseUrl: server!.url, model: "qwen2.5-coder:7b" });
  server = fakeOllama(() => edits([{ path: "link.md", content: "pwned" }]));
  await expect(runLocalAssembler({ plan: "x", allowedPaths: ["a", "b", "c", "d"] }, work, config())).rejects.toThrow("subscription");
  expect(server.requests).toHaveLength(0);
  await writeFile(join(outside, "secret.md"), "keep");
  await symlink(join(outside, "secret.md"), join(work, "link.md"));
  await expect(runLocalAssembler({ plan: "x", allowedPaths: ["link.md"] }, work, config())).rejects.toThrow("regular file");
  await mkdir(join(work, "real"));
  await symlink(outside, join(work, "real", "dir"));
  await expect(runLocalAssembler({ plan: "x", allowedPaths: ["real/dir/secret.md"] }, work, config())).rejects.toThrow("regular directory");
  expect(await readFile(join(outside, "secret.md"), "utf8")).toBe("keep");
  server.stop();
  await writeFile(join(work, "same.md"), "same");
  server = fakeOllama(() => edits([{ path: "same.md", content: "same" }]));
  await expect(runLocalAssembler({ plan: "x", allowedPaths: ["same.md"] }, work, config())).rejects.toThrow("no changes");
  server.stop();
  server = fakeOllama(() => new Response("model not found", { status: 404 }));
  await expect(runLocalAssembler({ plan: "x", allowedPaths: ["same.md"] }, work, config())).rejects.toThrow("404");
});

test.skipIf(process.env.SHIPTORIO_CHECK_SANDBOX === "1")("local discovery and source-bearing requests refuse 307/308 redirects", async () => {
  const work = await checkout();
  await writeFile(join(work, "README.md"), "synthetic approved source");
  let escaped = 0;
  const destination = Bun.serve({ hostname: "127.0.0.1", port: 0, fetch: () => { escaped++; return Response.json({}); } });
  try {
    for (const status of [307, 308]) {
      const origin = Bun.serve({ hostname: "127.0.0.1", port: 0, fetch: () => new Response(null, { status, headers: { location: `${destination.url}escaped` } }) });
      try {
        const config = { baseUrl: origin.url.toString().replace(/\/$/, ""), model: "synthetic" };
        expect((await detectLocalModel(config)).ok).toBe(false);
        await expect(runLocalAssembler({ plan: "synthetic plan", allowedPaths: ["README.md"] }, work, config)).rejects.toThrow();
        expect(await readFile(join(work, "README.md"), "utf8")).toBe("synthetic approved source");
      } finally { origin.stop(true); }
    }
    expect(escaped).toBe(0);
  } finally { destination.stop(true); }
});

test.skipIf(process.env.SHIPTORIO_CHECK_SANDBOX === "1")("HTTP envelope caps reject oversized discovery and completion before edits", async () => {
  const work = await checkout();
  await writeFile(join(work, "README.md"), "original synthetic file");
  // Padding, rather than message content, bypassed the previous inner-message check.
  const oversized = JSON.stringify({ choices: [{ message: { content: edits([{ path: "README.md", content: "changed" }]) } }], padding: "x".repeat(900_000) });
  for (const declaredLength of [false, true]) {
    const endpoint = Bun.serve({ hostname: "127.0.0.1", port: 0, fetch: () => {
      const bytes = new TextEncoder().encode(oversized);
      const stream = new ReadableStream<Uint8Array>({ start(controller) {
        for (let at = 0; at < bytes.length; at += 8192) controller.enqueue(bytes.slice(at, at + 8192));
        controller.close();
      } });
      return new Response(stream, { headers: declaredLength ? { "content-length": String(bytes.length) } : {} });
    } });
    try {
      const config = { baseUrl: endpoint.url.toString().replace(/\/$/, ""), model: "synthetic" };
      const detection = await detectLocalModel(config);
      expect(detection.ok).toBe(false);
      expect(detection.reason).toContain("too large");
      await expect(runLocalAssembler({ plan: "synthetic", allowedPaths: ["README.md"] }, work, config)).rejects.toThrow("HTTP response is too large");
      expect(await readFile(join(work, "README.md"), "utf8")).toBe("original synthetic file");
    } finally { endpoint.stop(true); }
  }
});

test("a local-looking name must resolve to a local address", async () => {
  await expect(assertResolvesLocal("http://gpu-box.local:8000/v1", async () => [{ address: "192.168.1.20" }])).resolves.toBeUndefined();
  await expect(assertResolvesLocal("http://localhost:11434/v1", async () => [{ address: "127.0.0.1" }, { address: "::1" }])).resolves.toBeUndefined();
  await expect(assertResolvesLocal("http://gpu-box.local:8000/v1", async () => [{ address: "93.184.216.34" }])).rejects.toThrow("resolve");
  await expect(assertResolvesLocal("http://gpu-box.local:8000/v1", async () => [{ address: "10.0.0.2" }, { address: "8.8.8.8" }])).rejects.toThrow("resolve");
  await expect(assertResolvesLocal("http://127.0.0.1:1/v1")).resolves.toBeUndefined();
});
