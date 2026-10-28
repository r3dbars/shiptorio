/** The real browser transport reserves only the exact text pong as its heartbeat. */
export function decodeFactoryFrame(payload) {
  if (payload === "pong") return { heartbeat: true };
  return { heartbeat: false, message: JSON.parse(String(payload)) };
}
