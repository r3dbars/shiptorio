# Security

Please report vulnerabilities privately through GitHub: **Security → Report a vulnerability**
on this repository. Don't open a public issue.

Helpful to include: what you found, how to reproduce it, and what an attacker could do with it.
We'll acknowledge within a few days.

How Shiptorio treats untrusted input (issue text, plans, agent output) and isolates the local
runner is described in [docs/runner-security.md](docs/runner-security.md) and
[docs/site/security.md](docs/site/security.md). On a public repo, only issues and comments from
the owner, org members and collaborators feed the factory, unless someone with triage access
adds the `shiptorio` label.
