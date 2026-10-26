import { DurableObject } from "cloudflare:workers";
import { FactorySchema, RepoSchema, WebToServerSchema, type Factory } from "@shiptorio/shared";
import { applyCommand, emptyFactory, FactoryError, ingestIssue, patch } from "./factory";

const MAX_MESSAGE_BYTES = 64 * 1024;
const json = (value: unknown, status = 200) => Response.json(value, { status });

/** Internal binding only. The outer Worker authenticates and pins the repository. */
export class FactoryRoom extends DurableObject {
  private state?: Factory;

  async fetch(request: Request): Promise<Response> {
    return this.ctx.blockConcurrencyWhile(async () => {
      const url = new URL(request.url);
      const repo = RepoSchema.safeParse(url.searchParams.get("repo"));
      if (!repo.success) return json({ error: "Invalid repository" }, 400);
      if (!this.state) {
        this.state = await this.ctx.storage.get<Factory>("factory");
        if (!this.state) {
          this.state = emptyFactory(repo.data);
          await this.ctx.storage.put("factory", this.state);
        }
      }
      if (this.state.repo !== repo.data) return json({ error: "Repository mismatch" }, 409);
      if (url.pathname === "/live" && request.headers.get("upgrade")?.toLowerCase() === "websocket") {
        if (this.ctx.getWebSockets().length >= 100) return json({ error: "Connection limit reached" }, 429);
        const { 0: client, 1: server } = new WebSocketPair();
        this.ctx.acceptWebSocket(server);
        server.send(JSON.stringify({ type: "snapshot", version: 1, factory: this.state }));
        return new Response(null, { status: 101, webSocket: client });
      }
      if (url.pathname === "/state" && request.method === "GET") {
        return json({ type: "snapshot", version: 1, factory: this.state });
      }
      if (request.method !== "POST") return json({ error: "Not found" }, 404);
      const raw = await request.text();
      if (new TextEncoder().encode(raw).byteLength > MAX_MESSAGE_BYTES) return json({ error: "Message too large" }, 413);
      try {
        const data: unknown = JSON.parse(raw);
        let next: Factory;
        if (url.pathname === "/issue") {
          const issue = data as { number?: unknown; title?: unknown };
          if (!Number.isSafeInteger(issue?.number) || Number(issue.number) <= 0 || typeof issue?.title !== "string" || !issue.title.length || issue.title.length > 512) return json({error:"Invalid issue"},400);
          next = ingestIssue(this.state, { number: Number(issue.number), title: issue.title });
        } else if (url.pathname === "/command") {
          const command = WebToServerSchema.safeParse(data);
          if (!command.success) return json({ error: "Invalid factory command" }, 400);
          next = applyCommand(this.state, command.data);
        } else return json({ error: "Not found" }, 404);
        await this.save(next);
        return json({ type: "snapshot", version: 1, factory: this.state });
      } catch (error) {
        if (error instanceof SyntaxError) return json({ error: "Invalid JSON" }, 400);
        if (error instanceof FactoryError) return json({ error: error.message }, 409);
        throw error;
      }
    });
  }

  private async save(next: Factory): Promise<void> {
    if (!this.state || next === this.state) return;
    FactorySchema.parse(next);
    await this.ctx.storage.put("factory", next);
    const message = JSON.stringify(patch(this.state, next));
    this.state = next;
    for (const ws of this.ctx.getWebSockets()) {
      try { ws.send(message); } catch { /* closed peer */ }
    }
  }

  async webSocketMessage(ws: WebSocket, message: string | ArrayBuffer): Promise<void> {
    if (typeof message !== "string" || new TextEncoder().encode(message).byteLength > MAX_MESSAGE_BYTES) {
      ws.close(1009, "Invalid message size"); return;
    }
    await this.ctx.blockConcurrencyWhile(async () => {
      this.state ??= await this.ctx.storage.get<Factory>("factory");
      if (!this.state) { ws.close(1011, "Missing factory"); return; }
      try {
        const command = WebToServerSchema.safeParse(JSON.parse(message));
        if (!command.success) throw new FactoryError("Invalid factory command");
        await this.save(applyCommand(this.state, command.data));
      } catch (error) {
        // Never echo raw payloads or unknown exception strings into browser logs.
        ws.send(JSON.stringify({ type: "log", version: 1, repo: this.state.repo, jobId: null,
          level: "error", message: error instanceof FactoryError ? error.message : "Command failed" }));
      }
    });
  }
  async webSocketClose(ws: WebSocket, code: number): Promise<void> { ws.close(code === 1005 || code === 1006 || code === 1015 ? 1000 : code, "bye"); }
}
