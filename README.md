# shiptorio
The factory must grow. Your codebase as a Factorio map, where factories are agent pipelines that ship real PRs.

## Run it locally

```sh
npm install
npm run dev
```

Then open http://localhost:8787/?repo=demo/shiptorio and hit **Log in**.

The first `npm run dev` writes `.dev.vars`, sets up the local database, and seeds a
demo map of this repo with a few fake PRs. On localhost, login skips GitHub and signs
you in as `DEV_LOGIN`. You don't need the GitHub App or any Cloudflare credentials
to work on the UI.

```sh
npm test            # unit tests
npm run typecheck
```

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
| `public/` | The map UI (plain JS + canvas, no build step) |
| `scripts/dev-setup.mjs` | Local setup + demo seed that `npm run dev` runs |
| D1 `shiptorio` | Installations, repos, PR state |
| KV `shiptorio-cache` | Cached maps (dropped on every push to the default branch) |

The D1 database and KV namespace already exist on the Cloudflare account and are wired
into `wrangler.jsonc`. Going live is in [docs/SETUP.md](docs/SETUP.md).
