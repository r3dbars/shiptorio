# Security policy

## Report a vulnerability privately

Use [GitHub private vulnerability reporting](https://github.com/r3dbars/shiptorio/security/advisories/new)
(Security → Report a vulnerability). Do not post vulnerabilities or credentials in public issues,
pull requests, comments, or workflow logs. If that form is unavailable, contact the maintainer
through the contact link on [Justin's website](https://justinbetker.com) to arrange a private channel.

Include the affected version or commit, reproduction steps, expected and observed behavior,
and the potential impact. Use a minimal example with test accounts and redacted credentials.
We aim to acknowledge reports within a few days and coordinate disclosure after a fix is available.

## Scope and supported versions

Only the latest `main` and the current hosted deployment are supported. Reports about
Shiptorio's Worker/API, browser app, local runner, GitHub App, authentication, tenant isolation,
credential handling, webhooks, and agent execution boundaries are in scope. A dependency
vulnerability is in scope when it has a demonstrated impact on Shiptorio.

Use your own repositories and accounts. Do not access other users' data, run destructive jobs,
exhaust shared resources, or test unrelated Cloudflare Workers or third-party services.
Issues in upstream providers belong with those providers; describe any Shiptorio impact privately.
There is no paid bug bounty or guaranteed response deadline.

The runner trust model is documented in [docs/runner-security.md](docs/runner-security.md)
and [docs/site/security.md](docs/site/security.md). Public issues and comments feed the factory
only when authored by the owner, org members or collaborators, or labeled `shiptorio` by
someone with triage access.
