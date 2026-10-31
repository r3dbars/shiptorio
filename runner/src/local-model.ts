import type { CheckSandbox } from "./sandbox";
import { localFiles } from "./local-files";
import { lookup } from "node:dns/promises";

// Geothermal power: a model on the player's own hardware (Ollama, llama.cpp server, LM Studio, MLX)
// behind an OpenAI-compatible endpoint. Free and always on, but small, so it only gets small jobs.
export interface LocalModelConfig { baseUrl: string; model: string }
export const OLLAMA_URL = "http://localhost:11434/v1";
/** Runner-side guardrails. The server routes conservatively too; this is the second lock. */
export const LOCAL_LIMITS = { maxFiles: 3, maxFileBytes: 64_000, maxOutputBytes: 400_000, maxResponseBytes: 800_000, maxDiscoveryBytes: 64_000, timeoutMs: 10 * 60 * 1000 } as const;

const PRIVATE_HOST = /^(?:localhost|127\.\d+\.\d+\.\d+|\[::1\]|10\.\d+\.\d+\.\d+|192\.168\.\d+\.\d+|172\.(?:1[6-9]|2\d|3[01])\.\d+\.\d+|[\w-]+\.local)$/i;

const PRIVATE_IP = /^(?:127\.\d+\.\d+\.\d+|10\.\d+\.\d+\.\d+|192\.168\.\d+\.\d+|172\.(?:1[6-9]|2\d|3[01])\.\d+\.\d+|169\.254\.\d+\.\d+|::1|f[cd][0-9a-f]{2}:.*|fe[89ab][0-9a-f]:.*)$/i;
/** A name (localhost, *.local) is only a hint: every address it resolves to must be loopback or private. */
export async function assertResolvesLocal(baseUrl: string, resolve: (host: string) => Promise<{ address: string }[]> = host => lookup(host, { all: true })): Promise<void> {
  const host = new URL(baseUrl).hostname.replace(/^\[|\]$/g, "");
  const addresses = await resolve(host);
  if (!addresses.length || addresses.some(a => !PRIVATE_IP.test(a.address))) throw new Error("Local model host must resolve to this computer or your local network");
}

/** Code goes to the endpoint, so it must stay on this machine or the local network. */
export function assertLocalEndpoint(raw: string): string {
  let url: URL;
  try { url = new URL(raw); } catch { throw new Error("Local model URL is not a valid URL"); }
  if (!["http:", "https:"].includes(url.protocol) || url.username || url.password || url.search || url.hash) throw new Error("Local model URL must be plain http(s) with no credentials");
  if (!PRIVATE_HOST.test(url.hostname)) throw new Error("Local model URL must point at this computer or your local network");
  return url.toString().replace(/\/+$/, "");
}

/** Env vars win; otherwise `local-model.json` ({ "model", "url" }) in the runner root, which survives re-pairing. */
export function localModelConfig(env: NodeJS.ProcessEnv, file?: { model?: unknown; url?: unknown } | null): LocalModelConfig | null {
  const model = (env.SHIPTORIO_LOCAL_MODEL || (typeof file?.model === "string" ? file.model : ""))?.trim();
  if (!model) return null;
  if (!/^[\w.:/@-]{1,120}$/.test(model)) throw new Error("Local model name has unexpected characters");
  const url = env.SHIPTORIO_LOCAL_MODEL_URL || (typeof file?.url === "string" ? file.url : "");
  return { baseUrl: assertLocalEndpoint(url.trim() || OLLAMA_URL), model };
}

/** Cap the whole HTTP envelope before parsing, including unknown fields and chunked bodies. */
async function boundedJson(response: Response, limit: number): Promise<unknown> {
  const declared = response.headers.get("content-length");
  if (declared && /^\d+$/.test(declared) && Number(declared) > limit) {
    await response.body?.cancel().catch(() => {});
    throw new Error("Local model HTTP response is too large");
  }
  const reader = response.body?.getReader();
  if (!reader) throw new Error("Local model HTTP response is empty");
  const chunks: Uint8Array[] = [];
  let bytes = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      bytes += value.byteLength;
      if (bytes > limit) throw new Error("Local model HTTP response is too large");
      chunks.push(value);
    }
  } catch (error) {
    await reader.cancel().catch(() => {});
    throw error;
  } finally { reader.releaseLock(); }
  const body = new Uint8Array(bytes);
  let offset = 0;
  for (const chunk of chunks) { body.set(chunk, offset); offset += chunk.byteLength; }
  return JSON.parse(new TextDecoder().decode(body));
}

/** Ollama, llama.cpp and LM Studio all answer GET /v1/models with { data: [{ id }] }. */
export async function detectLocalModel(config: LocalModelConfig, fetchImpl: typeof fetch = fetch): Promise<{ ok: boolean; models: string[]; reason?: string }> {
  try {
    await assertResolvesLocal(config.baseUrl);
    const r = await fetchImpl(`${config.baseUrl}/models`, { signal: AbortSignal.timeout(3000), redirect: "error" });
    if (!r.ok) return { ok: false, models: [], reason: `endpoint answered ${r.status}` };
    const body = await boundedJson(r, LOCAL_LIMITS.maxDiscoveryBytes) as { data?: { id?: unknown }[] };
    const models = (body.data ?? []).map(m => m.id).filter((id): id is string => typeof id === "string");
    // Some servers serve exactly one model and name it oddly; accept that case.
    const ok = models.includes(config.model) || models.length === 1;
    return { ok, models, reason: ok ? undefined : `model ${config.model} is not loaded (have: ${models.join(", ") || "none"})` };
  } catch (error) {
    return { ok: false, models: [], reason: error instanceof Error ? error.message : "endpoint unreachable" };
  }
}

export async function readScope(work: string, paths: string[], sandbox: CheckSandbox): Promise<Record<string, string | null>> {
  return localFiles(sandbox, work, paths, LOCAL_LIMITS.maxFileBytes);
}

export function localMessages(plan: string, files: Record<string, string | null>) {
  const listing = Object.entries(files).map(([path, text]) => text === null ? `--- ${path} (new file)\n` : `--- ${path}\n${text}\n`).join("\n");
  return [
    { role: "system", content: "You are a careful code assembler working offline. You only edit the files you are given. Reply with JSON only: {\"summary\": string, \"files\": [{\"path\": string, \"content\": string}]}. Each content is the COMPLETE new file. Include only files you changed. Never add credentials, network calls, shell commands or CI changes." },
    { role: "user", content: `Approved plan (follow it exactly, smallest change that works):\n${plan}\n\nFiles you may edit:\n${listing}` },
  ];
}

/** The model's reply is untrusted: exact JSON shape, approved paths only, bounded size. */
export function parseLocalEdits(text: string, allowedPaths: string[]): { summary: string; files: { path: string; content: string }[] } {
  if (text.length > LOCAL_LIMITS.maxOutputBytes) throw new Error("Local model reply is too large");
  const body = text.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
  let parsed: unknown;
  try { parsed = JSON.parse(body); } catch { throw new Error("Local model did not reply with JSON"); }
  const value = parsed as { summary?: unknown; files?: unknown };
  if (!value || typeof value !== "object" || !Array.isArray(value.files) || !value.files.length) throw new Error("Local model reply has no file edits");
  const seen = new Set<string>();
  const files = value.files.map(raw => {
    const f = raw as { path?: unknown; content?: unknown };
    if (typeof f?.path !== "string" || typeof f.content !== "string") throw new Error("Local model edit is malformed");
    if (!allowedPaths.includes(f.path) || seen.has(f.path)) throw new Error("Local model edited a path outside the approved scope");
    if (Buffer.byteLength(f.content) > LOCAL_LIMITS.maxFileBytes) throw new Error("Local model edit is too large");
    seen.add(f.path);
    return { path: f.path, content: f.content };
  });
  return { summary: typeof value.summary === "string" ? value.summary.slice(0, 500) : "Local model edit", files };
}

/**
 * Geothermal assembler. Reads the approved files, asks the local model for whole-file
 * replacements, writes them. The supervisor in cli.ts then runs exactly the same scope
 * checks, sandboxed typecheck/test/build, verify bay and trusted publication as any
 * subscription agent. Nothing here commits or pushes.
 */
export async function runLocalAssembler(job: { plan: string; allowedPaths: string[] }, work: string, config: LocalModelConfig, sandbox: CheckSandbox, fetchImpl: typeof fetch = fetch): Promise<{ summary: string; paths: string[] }> {
  if (!job.allowedPaths.length || job.allowedPaths.length > LOCAL_LIMITS.maxFiles) throw new Error(`Local power takes 1-${LOCAL_LIMITS.maxFiles} files; route this job to a subscription`);
  const files = await readScope(work, job.allowedPaths, sandbox);
  await assertResolvesLocal(config.baseUrl);
  const r = await fetchImpl(`${config.baseUrl}/chat/completions`, {
    redirect: "error", method: "POST", headers: { "content-type": "application/json" }, signal: AbortSignal.timeout(LOCAL_LIMITS.timeoutMs),
    body: JSON.stringify({ model: config.model, messages: localMessages(job.plan, files), temperature: 0.1, stream: false, response_format: { type: "json_object" } }),
  });
  if (!r.ok) throw new Error(`Local model failed (${r.status})`);
  const reply = await boundedJson(r, LOCAL_LIMITS.maxResponseBytes) as { choices?: { message?: { content?: unknown } }[] };
  const content = reply.choices?.[0]?.message?.content;
  if (typeof content !== "string") throw new Error("Local model reply has no message");
  const edits = parseLocalEdits(content, job.allowedPaths);
  const changed = edits.files.filter(edit => files[edit.path] !== edit.content);
  if (!changed.length) throw new Error("Local model made no changes");
  await localFiles(sandbox, work, changed.map(edit => edit.path), LOCAL_LIMITS.maxFileBytes, { edits: changed, expected: files });
  return { summary: edits.summary, paths: changed.map(edit => edit.path) };
}
