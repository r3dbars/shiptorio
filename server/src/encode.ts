// Small text and byte helpers the Worker used to copy file to file. One copy each, so they can't drift.

/** Escape text for HTML: & < > " ' become numeric entities. */
export const escapeHtml = (s: string): string => s.replace(/[&<>"']/g, c => `&#${c.charCodeAt(0)};`);

/** Bytes as lowercase hex. */
export const toHex = (bytes: ArrayBuffer | Uint8Array): string =>
  Array.from(bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes), b => b.toString(16).padStart(2, "0")).join("");

/** SHA-256 of a UTF-8 string, as lowercase hex. */
export const sha256Hex = async (text: string): Promise<string> =>
  toHex(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text)));

/** "1 PR", "3 PRs": a count with its word, singular or plural. */
export const plural = (n: number, one: string, many = `${one}s`): string => `${n} ${n === 1 ? one : many}`;
