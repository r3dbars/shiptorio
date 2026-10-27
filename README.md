# Shiptorio

**The factory must grow.**

AI review eval: caught 10/10 seeded bad fixes (100%); 0/5 good fixes flagged; 0 rules fallbacks, 0 unavailable. [Results and limits](docs/EVAL.md).

Your codebase is a Factorio-style map. Feedback is the ore: Sentry errors, user emails, GitHub issues and
PostHog traffic. The machines are agents you place and wire together. What ships is real pull requests.

Muse Spark runs the floor: triage, splitting, routing, inspection and planning. Coding work goes to Spark's own
agent, or to Codex and Claude Code running on your own machine with your own subscriptions.

## Built during the Meta AI Developer Hackathon

Building opened at 11:24 AM CT on Oct 26, 2026. Three commits landed just before that, and we're
listing them plainly: the initial commit with a README (9:33 AM CT), a Phase 1 scaffold of the Worker,
GitHub App and map (e2472b7, about 4,500 lines, 11:14 AM CT), and a wiring commit (31d4bb3, 11:18 AM CT).
Everything from c7257d2 (11:27 AM CT) onward was built during the event.
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
bun run test:storage # host-only real Durable Object storage integration
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

`bun test` and `bun run check` keep repository verification offline for the local runner's OS sandbox.
Run `bun run test:storage` separately on a host with Node.js 22+ and permission to bind a local TCP port.
It runs one real Wrangler/Miniflare Durable Object integration with a 25-second deadline and fails on
startup errors, assertion failures, timeout, or a missing test receipt. The required CI check and both
deployment workflows run this command before deployment; it requires no Cloudflare credentials.
