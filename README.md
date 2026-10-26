# shiptorio
The factory must grow. Your codebase as a Factorio map, where factories are agent pipelines that ship real PRs.

Built for the Meta AI Developer Hackathon (Oct 26 to Nov 4, 2026). Muse Spark runs the
factory floor. Coding agents are the machines, and every rocket is a merged PR.

## Run it

Needs [Bun](https://bun.sh).

```sh
bun install
bun run dev:web     # http://localhost:5173/?source=sim  (UI + simulator, nothing else needed)
bun run dev         # full stack on wrangler dev: http://localhost:8787
bun test
bun run typecheck
```

`?source=sim` runs a fake factory in the browser with scripted scenarios
(`&scenario=quiet-morning` or `rework-loop`). `?source=live&repo=owner/name` connects to
the real factory for that repo.

## Layout

| Dir | What |
| --- | --- |
| `shared/` | zod model + wire protocol, the contract between the lanes |
| `server/` | Cloudflare Worker (Hono), GitHub App, webhooks, Factory Durable Object, Muse Spark client |
| `web/` | Vite + React + Three.js pixel-art map and panels |

`AGENTS.md` has the full context for coding agents. `docs/SETUP.md` covers going live.
