# Runner onboarding (Goal 11)

Oct 29 checkpoint: a new player installs a standalone runner, confirms a short-lived browser device code for a repository, and sees the machine online before approving Spark's plan. Repeating pairing adds another repository to the same local process; no token is copied by hand. Login remains owned by the Claude auth lane.

Implementation uses the existing Factory Durable Object binding for short-lived pairing records, repo-scoped runner credentials, and existing approved-job supervision. Installer assets ship with the Worker web build; no new Cloudflare resources. The requested connection card is a narrow web-lane integration, with no shared protocol changes.

Verification target: pairing expiry, wrong secret, replay, origin/session checks, repo selection, local config permissions, multi-repo polling, installer smoke, and a clean-user install-to-plan walkthrough. Fresh macOS VM and five-minute timing must be measured before claiming that acceptance criterion.
