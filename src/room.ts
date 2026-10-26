import { DurableObject } from "cloudflare:workers";

// One room per repo. Browsers hold a websocket here; webhooks POST /broadcast to fan events out.
// Uses the hibernation API so idle rooms cost nothing.
export class RepoRoom extends DurableObject {
  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname === "/broadcast" && request.method === "POST") {
      const msg = await request.text();
      for (const ws of this.ctx.getWebSockets()) {
        try {
          ws.send(msg);
        } catch {
          // socket already gone; the runtime cleans it up
        }
      }
      return new Response(null, { status: 204 });
    }

    if (request.headers.get("upgrade") === "websocket") {
      const { 0: client, 1: server } = new WebSocketPair();
      this.ctx.acceptWebSocket(server);
      return new Response(null, { status: 101, webSocket: client });
    }

    return new Response("not found", { status: 404 });
  }

  async webSocketMessage(ws: WebSocket, message: string | ArrayBuffer): Promise<void> {
    if (message === "ping") ws.send("pong");
  }

  async webSocketClose(ws: WebSocket, code: number): Promise<void> {
    ws.close(code, "bye");
  }
}
