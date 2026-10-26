/** A fresh data key per write, wrapped by the Worker master key. Scope is authenticated twice. */
export interface Envelope { iv: string; ciphertext: string; keyVersion: string; wrappedKey: string; wrapIv: string }
export interface KeyEnv { CRED_MASTER_KEY?: string; CRED_KEY_VERSION?: string; CRED_PREVIOUS_KEYS?: string }
const enc = new TextEncoder();
const b64 = (v: ArrayBuffer | Uint8Array) => btoa(String.fromCharCode(...new Uint8Array(v)));
const bytes = (v: string) => Uint8Array.from(atob(v), c => c.charCodeAt(0));
async function master(env: KeyEnv, version: string) {
  try {
    const raw = version === (env.CRED_KEY_VERSION || "1") ? env.CRED_MASTER_KEY : (JSON.parse(env.CRED_PREVIOUS_KEYS || "{}") as Record<string, string>)[version];
    if (!raw || bytes(raw).length !== 32) throw new Error();
    return await crypto.subtle.importKey("raw", bytes(raw), "AES-GCM", false, ["encrypt", "decrypt"]);
  } catch { throw new Error("Credential encryption key unavailable"); }
}
export async function encryptCredential(env: KeyEnv, binding: string, value: unknown): Promise<Envelope> {
  const keyVersion = env.CRED_KEY_VERSION || "1";
  const key = await master(env, keyVersion);
  const dataKey = crypto.getRandomValues(new Uint8Array(32));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const wrapIv = crypto.getRandomValues(new Uint8Array(12));
  const additionalData = enc.encode(`${binding}:${keyVersion}`);
  const dek = await crypto.subtle.importKey("raw", dataKey, "AES-GCM", false, ["encrypt"]);
  const ciphertext = await crypto.subtle.encrypt({ name: "AES-GCM", iv, additionalData }, dek, enc.encode(JSON.stringify(value)));
  const wrappedKey = await crypto.subtle.encrypt({ name: "AES-GCM", iv: wrapIv, additionalData }, key, dataKey);
  dataKey.fill(0);
  return { iv: b64(iv), ciphertext: b64(ciphertext), keyVersion, wrappedKey: b64(wrappedKey), wrapIv: b64(wrapIv) };
}
export async function decryptCredential<T>(env: KeyEnv, binding: string, envelope: Envelope): Promise<T> {
  try {
    const key = await master(env, envelope.keyVersion);
    const additionalData = enc.encode(`${binding}:${envelope.keyVersion}`);
    const raw = await crypto.subtle.decrypt({ name: "AES-GCM", iv: bytes(envelope.wrapIv), additionalData }, key, bytes(envelope.wrappedKey));
    const dek = await crypto.subtle.importKey("raw", raw, "AES-GCM", false, ["decrypt"]);
    new Uint8Array(raw).fill(0);
    const plaintext = await crypto.subtle.decrypt({ name: "AES-GCM", iv: bytes(envelope.iv), additionalData }, dek, bytes(envelope.ciphertext));
    return JSON.parse(new TextDecoder().decode(plaintext)) as T;
  } catch { throw new Error("Credential decryption failed"); }
}
