// Persisted contract only: browser snapshots remain FactoryState.
import { FactoryState } from "@shiptorio/shared";
import { migrateGauntlet } from "./gauntlet";

export const STATE_SCHEMA_VERSION = 2;
export const THOUGHT_LIMIT = 40;
export const INLINE_BYTES = 96 * 1024;
const CHUNK_CHARS = 16000; // <=64 KiB UTF-8, including astral characters
const CHUNK_FORMAT = "shiptorio-state-chunks";
export type StoredFactoryState = FactoryState & { schemaVersion: number };
export const jsonBytes = (value: unknown) => new TextEncoder().encode(JSON.stringify(value)).byteLength;

type Storage = Pick<DurableObjectStorage, "get" | "put" | "delete" | "transaction">;
type Chunks = { format: typeof CHUNK_FORMAT; chunks: number; bytes: number; schemaVersion: number };
const isChunks = (value: unknown): value is Chunks => !!value && typeof value === "object" && (value as Chunks).format === CHUNK_FORMAT;
const chunkKey = (i: number) => `stateChunk:${String(i).padStart(6, "0")}`;

// Every persisted version gets one migration. Never edit a released step: append another.
export const stateMigrations: ReadonlyArray<(s: StoredFactoryState) => void> = [
  s => { migrateGauntlet(s); }, // 0 -> 1: original inspector -> gauntlet + orbit watch
  s => { if (s.brain) s.brain.thoughts = s.brain.thoughts.slice(0, THOUGHT_LIMIT); }, // 1 -> 2: bounded decision history
];

export function migrateFactoryState(raw: unknown): StoredFactoryState {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) throw new Error("Invalid stored factory state");
  const value = raw as Record<string, unknown>;
  const version = Object.hasOwn(value, "schemaVersion") ? value.schemaVersion : 0;
  if (!Number.isInteger(version) || (version as number) < 0 || (version as number) > STATE_SCHEMA_VERSION)
    throw new Error(`Unsupported factory schema version: ${version}`);
  // Validate before changing anything. Keep unknown fields for forward-compatible deploys.
  FactoryState.omit({ brain: true }).parse(value);
  const next = structuredClone(value) as StoredFactoryState;
  for (let i = version as number; i < STATE_SCHEMA_VERSION; i++) {
    stateMigrations[i](next);
    next.schemaVersion = i + 1;
  }
  FactoryState.parse(next);
  return next;
}

export function persistedState(state: FactoryState): StoredFactoryState {
  const next = { ...state, schemaVersion: STATE_SCHEMA_VERSION };
  if (next.brain) next.brain = { ...next.brain, thoughts: next.brain.thoughts.slice(0, THOUGHT_LIMIT) };
  return next;
}

async function readState(storage: Pick<Storage, "get">): Promise<unknown> {
  const value = await storage.get<unknown>("state");
  if (!isChunks(value)) return value;
  if (!Number.isSafeInteger(value.chunks) || value.chunks < 1 || value.chunks > 10000) throw new Error("Invalid state chunk manifest");
  const parts: string[] = [];
  for (let i = 0; i < value.chunks; i++) {
    const part = await storage.get<string>(chunkKey(i));
    if (typeof part !== "string") throw new Error(`Missing factory state chunk ${i}`);
    parts.push(part);
  }
  const text = parts.join("");
  if (new TextEncoder().encode(text).byteLength !== value.bytes) throw new Error("Factory state size mismatch");
  return JSON.parse(text);
}

export async function loadFactoryState(storage: Storage): Promise<StoredFactoryState | null> {
  return storage.transaction(async tx => {
    const raw = await readState(tx);
    if (raw == null) return null;
    const next = migrateFactoryState(raw);
    // Migration and version are one commit. Failure leaves the original intact.
    if ((raw as StoredFactoryState).schemaVersion !== next.schemaVersion) await writeState(tx, next);
    return next;
  });
}

async function writeState(storage: Pick<Storage, "get" | "put" | "delete">, state: StoredFactoryState) {
  const previous = await storage.get<unknown>("state");
  const text = JSON.stringify(state), bytes = new TextEncoder().encode(text).byteLength;
  const chunks = bytes > INLINE_BYTES ? Math.ceil(text.length / CHUNK_CHARS) : 0;
  for (let i = 0; i < chunks; i++) await storage.put(chunkKey(i), text.slice(i * CHUNK_CHARS, (i + 1) * CHUNK_CHARS));
  await storage.put("state", chunks ? { format: CHUNK_FORMAT, chunks, bytes, schemaVersion: STATE_SCHEMA_VERSION } : state);
  if (isChunks(previous)) for (let i = chunks; i < previous.chunks; i++) await storage.delete(chunkKey(i));
}

export async function saveFactoryState(storage: Storage, state: FactoryState): Promise<void> {
  const next = persistedState(state);
  await storage.transaction(tx => writeState(tx, next));
}

export function stateSize(state: FactoryState) {
  const stored = persistedState(state);
  return { schemaVersion: STATE_SCHEMA_VERSION, stateBytes: jsonBytes(stored), items: state.items.length,
    thoughtBytes: jsonBytes(stored.brain?.thoughts ?? []), thoughts: stored.brain?.thoughts.length ?? 0,
    chunked: jsonBytes(stored) > INLINE_BYTES };
}
