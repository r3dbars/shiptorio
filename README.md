# Shiptorio

**Shiptorio has shipped pull requests to its own repo.** An issue came in, the factory planned it, an agent built it,
checks and review passed, a person held Ship it, and it merged. Three of them so far:

- [#62](https://github.com/r3dbars/shiptorio/pull/62) Reject credential-bearing paths in the assembler file guard
- [#87](https://github.com/r3dbars/shiptorio/pull/87) Protect direnv credential files in the assembler path guard
- [#128](https://github.com/r3dbars/shiptorio/pull/128) Phone: tiny island, clipped scenario row, top-right buttons overlap

All three were opened by `shiptorio[bot]` and merged on Oct 26, 2026.

### The recorded run on r3dbars/Testing

<!-- Fill in after the recorded run. Keep it to links. -->
Not recorded yet. When it is, this lists the issue, the PR, the merge commit and the rocket trace.

- Issue: _todo_
- PR: [Testing #27](https://github.com/r3dbars/Testing/pull/27)
- Merge commit: _todo_
- Rocket trace: _todo_

**The factory must grow.**

Your software is a factory. GitHub issues ride a conveyor through seven stations:
**Repo → Planner → Builder → Checks → Review → Gate → Launch**. AI agents do the work, and every rocket that launches
is a real merged pull request. There's always a bottleneck, and it's usually waiting on one of your calls. Swipe the
card and the line moves. Approve the same kind of thing a few times and it becomes automatic.

Meta's Muse Spark makes the factory's decisions: triage, planning, routing and review. Coding goes to Codex or
Claude Code running on your own machine with your own subscription.

## Does the AI review work?

We seeded 15 candidate fixes against r3dbars/Testing, 10 bad and 5 good, and ran the live reviewer once on each.

AI review eval: caught 10/10 seeded bad fixes (100%); 0/5 good fixes flagged; 0 rules fallbacks, 0 unavailable. [Results and limits](docs/EVAL.md).

| | Sent to rework | Passed |
| --- | ---: | ---: |
| 10 bad fixes | 10 | 0 |
| 5 good fixes | 0 | 5 |

One run, a tiny repo, 90 API calls, about $0.34. It's a smoke test, not a benchmark. Receipts, method and limits are
in [docs/EVAL.md](docs/EVAL.md).

## Security, short version

- The runner isn't trusted. After an agent pushes, the server re-reads the diff from GitHub and rejects it unless
  it's one commit, only touches the files you approved, and stays under 10 files and 500 changed lines
  (`server/src/factory.ts`).
- Webhooks are checked with HMAC-SHA256 and a constant-time compare (`server/src/github.ts`).
- Runners get short-lived GitHub tokens scoped to one repo, and each job runs on a lease that expires
  (`server/src/github.ts`, `server/src/factory.ts`).
- Agents run in an OS sandbox on macOS and Linux (`runner/src/sandbox*.ts`) with a clean environment and argv-only
  spawns, no shell.
- Issue text and repo files reach Spark wrapped as untrusted evidence, never instructions.
- Agents only open PRs on `shiptorio/runner-*` branches. A merge needs a person, or a launch permit they granted.

More: [Security and privacy](docs/site/security.md) and [SECURITY.md](SECURITY.md).

## Built during the Meta AI Developer Hackathon

Building opened at 11:24 AM CT on Oct 26, 2026. Three commits landed just before that, and we're
listing them plainly: the initial commit with a README (9:33 AM CT), a Phase 1 scaffold of the Worker,
GitHub App and map (e2472b7, about 4,500 lines, 11:14 AM CT), and a wiring commit (31d4bb3, 11:18 AM CT).
Everything from c7257d2 (11:27 AM CT) onward was built during the event.
Nothing was carried over from an earlier project.

The north star is [docs/VISION.md](docs/VISION.md). The stack is Cloudflare (Workers, Durable Objects, D1, KV).
`PLAN.md` and `docs/ARCHITECTURE.md` are from the first day and describe an older design.

## Run it

Needs [Bun](https://bun.sh).

```sh
bun install
bun run dev:web     # http://localhost:5173/deck.html  (the deck + the story, nothing else needed)
bun run dev         # full stack on wrangler dev: http://localhost:8787
bun test
bun run test:storage # host-only real Durable Object storage integration
bun run typecheck
```

`/deck.html` plays the short story with no setup. `?source=sim` runs a fake factory in the browser.
`?source=live&repo=owner/name` connects to the real factory for that repo.

## Layout

| Dir | What |
| --- | --- |
| `shared/` | zod model + wire protocol, the contract between the lanes |
| `server/` | Cloudflare Worker (Hono), GitHub App, webhooks, Factory Durable Object, Muse Spark client |
| `web/` | Vite app. The game is the 2D pixel deck in `web/src/deck2d/` (`web/deck.html`); the old 3D map and React UI are on their way out |
| `docs/` | `VISION.md`, working context in `docs/context/`, the public docs site in `docs/site/` |
| `runner/` | The local runner that runs Codex or Claude Code on your machine |

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
