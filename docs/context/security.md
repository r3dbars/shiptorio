# Public repository guardrails

Checkpoint: Oct 27 public-repo hardening, supporting the first playable loop.

- CodeQL analyzes JavaScript/TypeScript on PRs to main, pushes to main (baseline), and weekly.
  It runs without a build or project credentials and is advisory, not a required check.
  Existing required checks remain `check`, `selfhost`, and `stranger`.
- Dependabot runs weekly for Bun's npm workspace manifests/root text lockfile and GitHub
  Actions. Each ecosystem has one grouped version-update PR; major upgrades are ignored
  by default and need deliberate review. Security alerts still need maintainer triage.
- All HTML uses the central response policy in `server/src/security.ts`, including public
  assets, legal/docs pages, signup, preview gate, setup, authenticated forms and errors.
  CSP contains `frame-ancestors 'none'`; HTTPS responses use one-year HSTS. Local HTTP
  intentionally has no HSTS. Gate scripts retain the per-response nonce introduced in #260.
- Report vulnerabilities using SECURITY.md. Never put secret values in issues, PRs or logs.

## Full-history secret scan

Run Gitleaks locally on a full clone after fetching all branch and tag refs. Reports belong
outside the checkout with owner-only permissions. Do not upload reports as public artifacts.

```sh
umask 077
git fetch origin --prune --tags
gitleaks git . --log-opts="--all --full-history" --redact=100 --no-banner \
  --report-format=json --report-path=/private/tmp/shiptorio-gitleaks.json
```

Review candidates privately; publish only counts and disposition in the PR. For real findings,
privately give Justin the file, commit and provider and ask him to rotate/revoke the credential.
Public GitHub PRs have no private comments: use a private security advisory linked from the PR
without exposing the affected locations. A clean scan is evidence from known patterns, not a
proof that credentials have never leaked. Scan results and validation receipts are in the PR.

References: [Dependabot ecosystem support](https://docs.github.com/en/code-security/reference/supply-chain-security/supported-ecosystems-and-repositories),
[CodeQL configuration](https://docs.github.com/en/code-security/reference/code-scanning/workflow-configuration-options),
[Gitleaks](https://github.com/gitleaks/gitleaks).
