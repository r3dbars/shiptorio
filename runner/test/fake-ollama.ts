// A stand-in for Ollama's OpenAI-compatible API. Tests script the reply; nothing leaves the machine.
export interface FakeOllama { url: string; requests: any[]; stop(): void }
export function fakeOllama(reply: (body: any) => string | Response, models = ["qwen2.5-coder:7b"]): FakeOllama {
  const requests: any[] = [];
  const server = Bun.serve({
    port: 0, hostname: "127.0.0.1",
    async fetch(req) {
      const path = new URL(req.url).pathname;
      if (req.method === "GET" && path === "/v1/models") return Response.json({ object: "list", data: models.map(id => ({ id, object: "model", owned_by: "library" })) });
      if (req.method === "POST" && path === "/v1/chat/completions") {
        const body = await req.json();
        requests.push(body);
        const out = reply(body);
        if (out instanceof Response) return out;
        return Response.json({ id: "chatcmpl-1", object: "chat.completion", model: body.model, choices: [{ index: 0, finish_reason: "stop", message: { role: "assistant", content: out } }] });
      }
      return new Response("not found", { status: 404 });
    },
  });
  return { url: `http://127.0.0.1:${server.port}/v1`, requests, stop: () => server.stop(true) };
}
