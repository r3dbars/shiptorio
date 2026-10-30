# Geothermal power: local models in the runner

Your Claude and ChatGPT sign-ins are **solar plants**: strong, but every job spends your
weekly usage. A model on your own hardware is a **geothermal plant**: free and always on,
but small. Shiptorio sends it the small, low-risk jobs (docs, copy, tiny fixes) and keeps
the subscriptions for real work. **Every job still runs the whole gauntlet**: supervisor
checks, CI, verify bay, AI review, merge gate and orbit watch. A local model never gets a
shortcut.

Anything that speaks the OpenAI chat API works: Ollama, llama.cpp `llama-server`,
LM Studio, MLX servers, vLLM.

## Setup (2 minutes)

1. Run a model. With [Ollama](https://ollama.com):

   ```sh
   ollama pull qwen2.5-coder:7b
   ollama serve            # already running if you use the Ollama app
   ```

   Bigger is better if your machine has the memory (`qwen2.5-coder:14b` / `32b` on a
   32 GB+ Mac or a 24 GB GPU).

2. Tell the runner about it, from the repo:

   ```sh
   bun run runner geothermal qwen2.5-coder:7b
   # another server or machine on your network:
   bun run runner geothermal my-model http://192.168.1.20:8080/v1
   ```

   This writes `runner/local-model.json` (gitignored, no secrets) and checks the endpoint
   answers `GET /v1/models`. It survives re-pairing. `SHIPTORIO_LOCAL_MODEL` and
   `SHIPTORIO_LOCAL_MODEL_URL` env vars override it. The default URL is Ollama's
   `http://localhost:11434/v1`.

3. Restart the runner (`bun run runner watch`, or `bun run runner:service install` again
   for the background helper, which copies `local-model.json` along). `bun run runner doctor`
   shows `local: <model> at <url> (geothermal power)` when it's ready.

A geothermal plant ("Your computer") appears on the deck next to your other power. If the
model isn't loaded or the server is down, the runner simply doesn't offer it.

## How a job gets routed

1. **First card.** When a local model is online, an issue card offers *Plan on your
   computer (free)* next to *Plan with Claude / Codex*. It's recommended when the issue
   looks small (cleanup, or a title about a typo, docs, copy, rename, lint...).
2. **Plan.** The planner scopes the files and writes the plan as usual.
3. **Route.** With the file scope known, the fixed **geothermal guard** decides which
   plants are even allowed (`server/src/geothermal.ts`):
   - 1 to 3 files.
   - Nothing sensitive: `.github/`, `package.json`, lockfiles, wrangler/Docker config,
     migrations and SQL, or paths about auth, access, accounts, sessions, secrets, tokens,
     crypto, security, permissions, payments, billing or the runner itself.
   - First try only: an item with a scar, or a rework of an open PR, goes to a subscription.
   - No new features, unless the change is docs only.

   Then the planner (Muse Spark, `pickPower` in `server/src/spark.ts`) picks the cheapest
   allowed plant that will very likely pass every check first time, with a one-sentence
   reason. It's logged as a `route` decision in How it thinks. If the planner is down, the
   fixed rule picks: geothermal when allowed, else your first subscription. **The guard has
   the last word**: if the planner picks geothermal for something the guard forbids, the job
   moves to a subscription and the log says why.
4. **Approve.** The approval card says which plant builds it (`Power: geothermal, your
   computer (free). Docs-only change...`). Nothing builds until you approve.
5. **Build.** The runner's geothermal assembler (`runner/src/local-model.ts`) reads the
   approved files, sends the plan and those files to your local endpoint, and asks for
   whole-file replacements as JSON.
6. **Check.** From here it's the same supervisor as Claude and Codex: path and secret scan,
   sandboxed typecheck, tests and build, verify bay, trusted publication. Then the PR rides
   the gauntlet like any other. A failure leaves a scar, and the retry goes to a subscription.

## Safety

- **Your code stays local.** The endpoint must be localhost, `127.x`, `::1`, a private LAN
  address (`10.x`, `192.168.x`, `172.16-31.x`) or a `.local` host. Public URLs and URLs with
  credentials are refused, so the "free local plant" can't quietly be a cloud API.
- **The model's reply is untrusted.** It must be exact JSON, can only touch the approved
  paths, at most 3 files of 64 KB each. Symlinked targets or parent folders are refused.
- **The model runs nothing.** It only returns text. It gets no shell, no tools, no git and
  no tokens. The runner writes the files, then the normal supervisor takes over.
- **Two locks.** The server only routes guarded jobs to geothermal, and the runner refuses
  any local job with more than 3 files.

## Tests

- `runner/test/local-model.test.ts`: config, endpoint allowlist, detection, reply parsing,
  symlink escapes, size limits, against a fake Ollama server (`runner/test/fake-ollama.ts`).
- `server/test/geothermal.test.ts`: the guard, rule route, planner veto, plant mapping,
  planner pick validation.
- `server/test/geothermal-e2e.test.ts`: end to end. A runner with Claude + a local model
  checks in, the docs issue is offered on geothermal, planned, routed by the planner,
  approved, claimed as `local`; the fake Ollama writes the fix in a real git checkout,
  the supervisor scope check passes, and the receipt makes the factory open the PR and
  send it into the gauntlet.
- Sim: `?source=sim&scenario=geothermal` shows a docs fix on geothermal and a bug on
  Claude, both riding the whole gauntlet.

## Troubleshooting

| Symptom | Fix |
| --- | --- |
| `local: ... not ready: model X is not loaded` | `ollama pull X`, or use the exact id from `curl localhost:11434/v1/models` |
| `endpoint unreachable` | Start the server (`ollama serve`); check the port |
| `Local model did not reply with JSON` | Use a stronger or instruct-tuned coder model; small models sometimes ramble |
| No geothermal card | The issue didn't look small, or the guard ruled it out; the card shows the reason |
