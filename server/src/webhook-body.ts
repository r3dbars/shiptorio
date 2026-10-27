const MAX_WEBHOOK_BYTES = 1048576;

/** Enforce the limit while reading, even without an honest Content-Length. */
export async function boundedBody(request: Request, maxBytes: number): Promise<string | null> {
  if (Number(request.headers.get("content-length") ?? 0) > maxBytes) return null;
  if (!request.body) return "";
  const reader = request.body.getReader();
  let buffer = new Uint8Array(Math.min(8192, maxBytes));
  let bytes = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      const nextBytes = bytes + value.byteLength;
      if (nextBytes > maxBytes) {
        // Cancellation must not make the rejection wait for the sender to finish.
        void reader.cancel().catch(() => {});
        return null;
      }
      if (nextBytes > buffer.length) {
        const grown = new Uint8Array(Math.min(maxBytes, Math.max(nextBytes, buffer.length * 2)));
        grown.set(buffer.subarray(0, bytes));
        buffer = grown;
      }
      buffer.set(value, bytes);
      bytes = nextBytes;
    }
    // Decode once, preserving UTF-8 sequences split across chunks, like Request.text().
    return new TextDecoder().decode(buffer.subarray(0, bytes));
  } finally {
    reader.releaseLock();
  }
}

/** Provider webhook ceiling; keep signing callers on the existing default. */
export const webhookBody = (request: Request) => boundedBody(request, MAX_WEBHOOK_BYTES);
