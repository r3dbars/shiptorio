# Shiptorio context

Shared notes for every agent (Claude threads, Codex) and Justin. Start with [`../../AGENTS.md`](../../AGENTS.md).
When you learn or decide something that will matter tomorrow, add it to the right file here and push.

## Read these 5 first

| File | What it is |
| --- | --- |
| [../VISION.md](../VISION.md) | The north star: Justin's goals and how to decide what's next |
| [demo-plan.md](demo-plan.md) | Plan to the demo video, day by day, and who owns which files now |
| [pixel-deck.md](pixel-deck.md) | The game surface (the 2D deck), its folders and art rules |
| [github-deck-loop.md](github-deck-loop.md) | How each station maps to real GitHub, Spark and runner events |
| [branches.md](branches.md) | dev and main: where PRs go and how promotion works |

## Working here

| File | What it is |
| --- | --- |
| [demo-script.md](demo-script.md) | The 2-minute demo video: shots and voiceover |
| [codex-deck-handoff.md](codex-deck-handoff.md) | How Codex works on the deck |
| [threads.md](threads.md) | Log of what each Claude thread and Codex task did |
| [testing.md](testing.md) | Test suites and how to run them |
| [new-user-path.md](new-user-path.md) | The stranger run: a new account from sign-in to first card (`bun run stranger`) |

## Reference (the code points here)

| File | What it is |
| --- | --- |
| [github-app.md](github-app.md) | GitHub App lifecycle: installs, webhooks, delivery |
| [github-connect.md](github-connect.md) | GitHub sign-in failure handling |
| [accounts.md](accounts.md) | Accounts and sign-in API |
| [signup-abuse.md](signup-abuse.md) | Sign-up gate and abuse limits |
| [runner-onboarding.md](runner-onboarding.md) | Pairing a local runner |
| [native-test-prerequisites.md](native-test-prerequisites.md) | Runner test prerequisites |
| [spark-audit.md](spark-audit.md) | Every decision Muse Spark makes, and its fallback |
| [meta-api.md](meta-api.md) | How we use the Meta Model API |
| [costs.md](costs.md) | Spark budgets and GitHub rate limits |
| [taps.md](taps.md) | The log of what players approve and skip |
| [security.md](security.md) | Threat model and mitigations |
| [encrypted-credentials.md](encrypted-credentials.md) | How mine credentials are stored |
| [ops.md](ops.md) | Diagnostics, Sentry, backup and recovery |
| [docs-site.md](docs-site.md) | The public docs site at /docs |
| [landing.md](landing.md) | Deck entry, preview access and the retained production landing page |

## Parked (code still exists, not in the demo)

| File | What it is |
| --- | --- |
| [growth-loop.md](growth-loop.md) | PostHog growth loop prototype |
| [support-mine.md](support-mine.md) | Customer email and Intercom as ore |
| [pricing.md](pricing.md) | Draft pricing; the beta is free |

## Evidence and history

- Before/after screenshots live in project files (`shiptorio/evidence/<repo path>`), not in git. `.gitignore` blocks new ones.
- [archive/](archive/README.md): retired docs (3D map era, old plans, one-off proofs). Not how things work today.

No secrets in this folder, ever. Resource ids (D1, KV) aren't secrets.
