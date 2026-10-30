// Fixed numeric diagnostics for the isolated fixture only; never a request-header capability.
export const PRIVATE_SOCKET_TIMING = Symbol("private-socket-timing");
type Phase = "app_admin_view" | "app_deleted" | "app_installation" | "app_trace_auth" | "app_signed_in" | "app_scope_auth" | "app_repo_access" | "app_quotas" | "app_factory_lookup" | "app_ensure" | "app_socket_fetch" | "do_auth" | "do_load" | "do_admin_view" | "do_repo_access" | "do_frame" | "do_projection" | "do_redaction" | "do_send" | "session_d1" | "repo_session_d1" | "repo_policy_d1" | "repo_relationship_d1" | "repo_kv" | "repo_github";
export class PrivateSocketTiming {
  private entries = new Map<Phase, { count: number; duration: number }>();
  constructor(private readonly now = () => performance.now()) {}
  sync<T>(phase: Phase, run: () => T): T {
    const start = this.now();
    try { return run(); }
    finally { this.add(phase, start); }
  }
  private add(phase: Phase, start: number) {
    const prior = this.entries.get(phase) ?? { count: 0, duration: 0 };
    this.entries.set(phase, { count: prior.count + 1, duration: prior.duration + Math.max(0, this.now() - start) });
  }
  async measure<T>(phase: Phase, run: () => Promise<T>): Promise<T> {
    const start = this.now();
    try { return await run(); }
    finally {
      this.add(phase, start);
    }
  }
  header() { return [...this.entries].map(([phase, value]) => `${phase};dur=${value.duration.toFixed(1)};desc="${value.count} calls"`).join(", "); }
}
export function privateSocketTiming(env: object): PrivateSocketTiming | undefined {
  const value = (env as { [PRIVATE_SOCKET_TIMING]?: unknown })[PRIVATE_SOCKET_TIMING];
  return value instanceof PrivateSocketTiming ? value : undefined;
}
export function measureSocket<T>(timing: PrivateSocketTiming | undefined, phase: Phase, run: () => Promise<T>): Promise<T> { return timing ? timing.measure(phase, run) : run(); }
export function timingResponse(response: Response, timing: PrivateSocketTiming): Response {
  const headers = new Headers(response.headers), value = timing.header();
  if (value) headers.append("Server-Timing", value);
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers, ...(response.webSocket ? { webSocket: response.webSocket } : {}) });
}
