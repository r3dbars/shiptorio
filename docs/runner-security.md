# Local runner security

Shiptorio treats issue text, Spark plans, repositories, package scripts and agent output
as untrusted. The local supervisor owns authentication, job validation, checks and
publication. Spark still plans and judges; these controls only constrain execution.
This advances the Oct 29 local-runner checkpoint.

## Filesystem and process boundary

Each assignment gets a newly generated 0700 directory under `<runner root>/.work/`.
The supervisor clones the assigned GitHub repository into a fresh bare repository and
creates a detached worktree there at the validated base SHA. It never runs job code
in the user's main checkout. Repeated job IDs receive different directories. Invalid
IDs and symlinked work roots are rejected. A `finally` removes the whole job directory
on normal completion and errors. A hard kill, OS crash or power loss can leave an
orphan; stop the service before deleting old job directories manually.

macOS `sandbox-exec` encloses the agent, tests, installs and their descendants.
Only the job directory, sandbox temporary files and selected system/runtime files
are readable. Writes are limited to the job and private temporary directories.
The agent additionally gets its dedicated subscription home and HTTPS access.
Checks get neither that home nor network access. Process-environment inspection of
siblings, signals to outside processes, host-file access and symlink/hardlink escapes
are denied. The supervisor kills the child's process group after exit or timeout.
The OS boundary continues to apply to descendants, including those creating a new
process group. This is not a CPU, disk or memory quota system.

Unsupported platforms fail closed before claiming a job. Docker execution is not
implemented: a future container flag must preserve these boundaries, avoid mounting
the user's home/Docker socket, and address subscription sign-in before enabling it.
Docker availability alone never silently weakens isolation.

## Dedicated subscription sign-in

Agents no longer inherit the normal HOME, CODEX_HOME, PATH, shell configuration,
SSH_AUTH_SOCK, NODE_OPTIONS, cloud credentials, Git credentials or pairing token.
The runner constructs an environment with fixed system paths and private temporary
storage. The only subscription credential location explicitly allowed is
`<runner root>/.agent-home/` (gitignored). Codex uses its `.codex/` subdirectory.
Never point this directory at your real home or copy a whole existing config tree.

For a source checkout, create that directory and sign in separately, for example:

```sh
mkdir -p runner/.agent-home
chmod 700 runner/.agent-home
env -i PATH="$PATH" HOME="$PWD/runner/.agent-home" CODEX_HOME="$PWD/runner/.agent-home/.codex" codex login
bun run runner doctor
```

For the installed service, the runner root is
`~/Library/Application Support/Shiptorio`; sign in under its `.agent-home` instead.
Claude installations that rely on the user's macOS Keychain or additional external
runtime directories may fail closed. Do not grant the agent the whole Keychain or
home to bypass that failure. A file-based dedicated login must be supported and
verified before using that harness. Actual provider login/refresh is separate from
the OS sandbox probes; this change does not establish that both providers work.

The agent can read its assigned repository and its dedicated provider credentials,
and can contact HTTPS endpoints to perform inference. Those are deliberate trust
exceptions: a compromised agent/provider can disclose that repository or dedicated
credential. No local runner can promise protection against its own compromised OS,
trusted supervisor/runtime, or kernel sandbox bugs. macOS Seatbelt is deprecated;
keep macOS and agent binaries updated.

## Commands and message validation

Every HTTP claim, renewal and completion response is parsed with Zod. Assignments
validate UUIDs, hashes, harness, branch, paths, lease, deadline and bounded plan text.
Only executable assignment fields survive parsing; internal server audit metadata
is discarded. The runner checks repository equality, expiry and branch ownership
before creating files. No payload-supplied command is ever passed to a shell.

The supervisor's check allowlist permits frozen `bun install --ignore-scripts`,
`bun test`, and `bun run <script>` for an exact declared package script name with
no added arguments. Production checks remain typecheck/test/build. Repo-declared
script bodies can execute arbitrary code, so the allowlist is backed by the OS
sandbox rather than treated as sufficient isolation. Only frozen installation can
use the network-enabled check profile; it disables lifecycle scripts, env-file
loading and Bun configuration. Registry downloads still trust the lockfile and
registry and can contact HTTPS endpoints; no host/provider credentials are present.

The agent never receives the GitHub installation token. Publication reconstructs a
commit from frozen approved file bytes in another fresh trusted clone, ignoring
agent-owned hooks/configuration. Exact path scope, regular-file checks, patch size
and secret-pattern checks run before publication. Raw agent output remains local.
Evidence and retry receipts remain under `.work` with private file permissions;
receipts contain a job lease but no installation token. Delete them when no longer
needed. Secret-pattern matching is a defense, not a complete secret detector.

## GitHub authority

The server mints a short-lived GitHub App installation token restricted to the one
repository with `contents:write` and `metadata:read`. Personal tokens and ambient
Git credential helpers are never used. The token lives only in trusted supervisor
Git environments, is not stored in remotes, and is cleared after publication.
Only validated `shiptorio/runner-<UUID>` refs are pushed by the supervisor.

GitHub cannot scope an installation token to one branch. Independently enforce
repository branch/ruleset protection: contents-write can otherwise modify protected
work outside the supervisor if that credential or supervisor is compromised.

## Pairing and revocation

Signed pairing credentials expire after eight hours; a still-paired runner can renew.
There is one active pairing slot **per repository**, stricter than one per repo/user:
pairing again invalidates the previous slot, even for another allowed user. A single
unexpired running job prevents another claim from that slot. Copying a pairing token
does not create another slot. Treat the bearer token as a password.

In the live game's power sheet choose **Disconnect local runner**. The same-origin,
signed-in POST `/api/repos/<owner>/<repo>/runner/revoke` clears pairing and presence
and removes its solar power indicators. Subsequent claims, renewals and completion
receipts using the old pairing are refused. Browser session authentication is
required; runner credentials cannot invoke this endpoint. Re-pair to reconnect.

Revocation does not remotely kill a job already running, erase local login state,
or immediately revoke an already issued GitHub token. Stop the local runner/service
to halt active work; installation tokens retain their GitHub expiry. Invalidated
receipts cannot advance the gauntlet. Do not equate web disconnection with OS process
termination or provider sign-out.

## Verification

`bun test runner/test server/test/runner-pairing.test.ts server/test/webhook-intake.test.ts`
covers message/path injection, command allowlists, environment construction, private
workspace cleanup, pairing replacement/expiry/revocation, and on macOS real hostile
agent/test probes (host file access, writes, network, sibling secrets, child processes).
Publication tests inject hostile Git hooks; regression proof tests run a real linked
worktree with base-failing/head-passing tests. Linux CI runs portable cases and asserts
unsupported sandbox platforms fail closed; OS probes require macOS and skip inside
an already sandboxed verification run.
