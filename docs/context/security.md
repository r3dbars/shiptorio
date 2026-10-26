# Security boundaries

## Prompt injection

Issue titles/bodies, PR descriptions, file contents/comments, Sentry errors, PostHog data,
scar reasons, player history and model-generated plans are untrusted evidence. They do
not grant permissions. This protects the Oct 29 local-runner checkpoint.

- `server/src/spark.ts` wraps every user/assistant message with a JSON-escaped
  `UNTRUSTED_DATA_BEGIN` / `UNTRUSTED_DATA_END` envelope. Fake markers, chat role tokens,
  ANSI control characters and bidi controls are neutralized. Evidence is capped at
  64,000 input characters per message, replies at 100,000; planner file observations
  stay at 12,000 and issue observations at 8,000. External districts stay in user data,
  never developer instructions. All decision endpoints use strict Zod output schemas.
- Planner tools are the fixed enum `read_issue`, `read_file`, `assign_job`, `ask_player`.
  Exact candidate paths constrain reads and assignment; unknown fields/actions fail.
  Deck suggestions remain constrained to existing card/option IDs. Model output never
  grants merge permission or bypasses a station.
- `server/src/injection-policy.ts` is the common policy used by the Worker and runner.
  Forbidden paths include Git metadata/workflows, any `.env` filename, dev vars,
  credentials/secrets, private keys, CI/container configuration, package-manager auth,
  and agent instructions/configuration. These are refused even if present in an approved
  file list. Plans reject shell/network/SSH/home-read/credential instructions, are capped
  at 17,000 characters, and contain at most 10 explicit writable paths.
- The runner validates the plan before cloning or launching a harness, then sends it as
  untrusted task data under fixed supervisor restrictions. Codex shell/unified execution,
  web search and multi-agent tools are disabled; Claude gets only Read/Edit/Write/Glob/Grep.
  Subscription authentication remains native to the CLI; no server/provider/push secrets
  are inherited by the coding child. Repository scripts run only in the existing OS
  verification sandbox, with a private home and no network except frozen dependency
  installation without lifecycle scripts.
- Before publication, and again on receipt at the server, scope is capped at 10 files,
  500 changed lines and 200,000 diff characters. Publication still rebuilds approved
  regular-file snapshots in a fresh clone with isolated Git metadata and hooks. The server
  independently reads GitHub's compare patches, requires every patch and its changed-line
  count, rejects missing/truncated/binary evidence and checks the content before a PR
  opens or updates. Hosted dev assembly is also confined to its selected files and the
  same patch policy (its whole-file replacement counts against the line limit).
- New network/process-execution code, credential access, secret-looking additions,
  workflow edits, executable package-manifest changes and recognizable injection overrides fail deterministic security review,
  even if the model would answer pass. Incomplete review evidence also fails. The AI
  reviewer still checks the ordinary semantic correctness of permitted changes.

These are deliberately conservative gates: a legitimate new network integration or
security configuration or package-manifest edit needs a separate human-authored PR. Prompt formatting and
pattern matching are defense in depth, not a proof that a model understands every attack. Quoted injection instructions in security reports also
fail the review station and need human security handling rather than an automatic rework.
Native subscription CLIs retain their authentication access; this change does not claim
full OS isolation of the coding harness or protection against every obfuscated program.
Changes to already-existing executable scripts can still be dangerous, so tests execute
inside the OS boundary and publication never trusts agent-owned metadata.

Validation: `bun test server/test/injection.test.ts` uses a hostile fixture issue with
role spoofing, delimiter escapes, SSH/env exfiltration and workflow-edit instructions.
It proves bounded data framing, fixed tools, scope preservation, forbidden-path/command
rejection and mandatory review findings with scripted model replies. Factory lifecycle
coverage rejects missing evidence and malicious patch contents at the real receipt
boundary before opening a PR, then accepts a normal fix. These deterministic tests do
not claim a live-model red-team evaluation or a fresh native CLI UX test.
