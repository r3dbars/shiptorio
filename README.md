# Shiptorio

**The factory must grow.**

Review eval: caught 10/10 seeded bad fixes (100%); 0/5 good fixes flagged; 0 rules fallbacks, 0 unavailable. [Results and limits](docs/EVAL.md).

Your repo is a factory. Shiptorio draws it as one floating pixel-art deck with one line:
Repo → Planner → Builder → Checks → Review → Gate → Launch. Issues ride the line as crates, real PRs launch as
rockets, and there's always one bottleneck: the call that's waiting on you. Swipe the card and it moves. Approve
the same kind of work a few times and that step runs itself.

Shippy is your guide. He's powered by Meta Muse Spark, which reads the factory, finds the bottleneck and suggests
the next move. The code itself is written by Codex on your own machine, with your own subscription.

**Try it:** [shiptorio.dev](https://shiptorio.dev) opens straight into the tutorial. Creating your own factory
(GitHub sign-in) still needs the preview password for now.

## Built during the Meta AI Developer Hackathon

Building opened at 11:24 AM CT on Oct 26, 2026. Three commits landed just before that, and we're
listing them plainly: the initial commit with a README (9:33 AM CT), a Phase 1 scaffold of the Worker,
GitHub App and map (e2472b7, about 4,500 lines, 11:14 AM CT), and a wiring commit (31d4bb3, 11:18 AM CT).
Everything from c7257d2 (11:27 AM CT) onward was built during the event.
Nothing was carried over from an earlier project.

Where it's going: [docs/VISION.md](docs/VISION.md). The stack is Cloudflare (Workers, Durable Objects, D1, KV).
The early [PLAN.md](PLAN.md) and [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) are history (they describe a Fly/Neon setup and the old 3D map).

## Run it

Needs [Bun](https://bun.sh).

```sh
bun install
bun run dev:web     # http://localhost:5173/deck.html  (the deck + tutorial, nothing else needed)
bun run dev         # full stack on wrangler dev: http://localhost:8787
bun test
bun run test:storage # host-only real Durable Object storage integration
bun run typecheck
```

`/deck.html` plays the scripted tutorial. `/deck?source=sim` runs a fake factory in the browser, and
`/deck?source=live&repo=owner/name` connects to the real factory for that repo.

## Layout

| Dir | What |
| --- | --- |
| `shared/` | zod model + wire protocol, the contract between the lanes |
| `server/` | Cloudflare Worker (Hono), GitHub App, webhooks, Factory Durable Object, Muse Spark client |
| `web/` | Vite app; the game is the 2D pixel deck in `web/src/deck2d/` (the old React/Three.js map is parked) |
| `docs/` | Plan docs, art direction, and the Pixel Prototype / Item Lab HTML |

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
