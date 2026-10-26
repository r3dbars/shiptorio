# shiptorio
The factory must grow. Your codebase as a Factorio map, where factories are agent pipelines that ship real PRs.

## What's here (phase 1)

- **The map.** Every top-level folder is a concrete pad, every file is a tile, colored by
  what it is (code, tests, styles, config, docs, assets). Drag to pan, scroll to zoom.
- **Live PRs.** Tiles touched by open PRs get outlined by CI status: orange pending,
  green passing, red failing. Click a PR in the Review chest to see only its files.
  Updates arrive over a websocket as GitHub webhooks come in.
- **Factories** (agents that open PRs) are phase 2.

## How it runs

One Cloudflare Worker does everything:

| Piece | What it does |
| --- | --- |
| `src/index.ts` | Routes, webhook handling, login, one-time App setup |
| `src/github.ts` | GitHub App JWT + installation tokens (pure WebCrypto) |
| `src/map.ts` | Repo tree → zones and tiles |
| `src/room.ts` | Durable Object per repo that fans events out to browsers |
| `public/` | The map UI |
| D1 | Installations, repos, PR state |
| KV | Cached maps (dropped on every push to the default branch) |

Setup steps are in [docs/SETUP.md](docs/SETUP.md).

```sh
npm install
npm test
npm run dev
```
