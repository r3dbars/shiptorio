// Private fixture diagnostics only. Phase names are fixed; no request data or credentials.
type Phase = "verify" | "enter" | "session" | "preview" | "seed" | "runner" | "app";
export class FixtureTiming {
  private start: number;
  private entries: string[] = [];
  constructor(private now = () => performance.now()) { this.start = now(); }
  mark(phase: Phase) {
    const at = this.now();
    this.entries.push(`fixture_${phase};dur=${Math.max(0, at - this.start).toFixed(1)}`);
    this.start = at;
  }
  attach(response: Response): Response {
    const headers = new Headers(response.headers);
    headers.append("Server-Timing", this.entries.join(", "));
    // Service/DO responses may have immutable headers. Preserve the actual
    // upgraded socket when wrapping; dropping it would break the private hop.
    return new Response(response.body, { status: response.status, statusText: response.statusText, headers, ...(response.webSocket ? { webSocket: response.webSocket } : {}) });
  }
}
