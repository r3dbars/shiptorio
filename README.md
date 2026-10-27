# Shiptorio

**The factory must grow.**

Your codebase is a Factorio-style map. Feedback is the ore: Sentry errors, user emails, GitHub issues and
PostHog traffic. The machines are agents you place and wire together. What ships is real pull requests.

Muse Spark runs the floor: triage, splitting, routing, inspection and planning. Coding work goes to Spark's own
agent, or to Codex and Claude Code running on your own machine with your own subscriptions.

## Built during the Meta AI Developer Hackathon

Everything in this repository was written between Oct 26 and Nov 4, 2026, during the event.
Nothing was carried over from an earlier project.

See [PLAN.md](PLAN.md) for the build plan and [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) for the game design.
The stack is Cloudflare (Workers, Durable Objects, D1, KV), not the Fly/Neon setup those docs describe.

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
| `docs/` | Plan docs, art direction, and the Pixel Prototype / Item Lab HTML |
| `briefs/` | Briefs for the other lanes (Codex, Muse Code) |

`AGENTS.md` has the full context for coding agents. `docs/SETUP.md` covers going live.

## Original game music

The composed foundry theme plays by default. Use `?music=1` to compare the older score;
`?music=2` links still select the foundry theme.
Music starts after a gesture; its switch and separate volume are in Settings.
“Up from the Mine”, its original synthesized instruments and generated audio are
[CC0 1.0](https://creativecommons.org/publicdomain/zero/1.0/); see
[the music inventory](web/public/music/LICENSES.md). There are no sampled audio assets.

## License

[MIT](LICENSE). Fonts are SIL OFL 1.1 (license files sit next to them) and the music is CC0.

Shiptorio is a fan-inspired project and isn't affiliated with or endorsed by Wube Software or Factorio.
All game art is original.

Found a security issue? See [SECURITY.md](SECURITY.md).
