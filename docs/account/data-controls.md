# Account and data controls — goal 13

Oct 26 checkpoint: make the live factory safe to leave as well as join.

- Settings uses the v3 slate/amber HUD styling and server-rendered pages, keeping the web lane isolated.
- JSON export contains factory state, items, permits, research and retained activity; excludes credentials and runner leases.
- Account deletion is limited to installations owned by the signed-in GitHub login. Collaborator access does not confer deletion rights.
- Deletion requires the exact repository confirmation list, stops each factory, closes sockets, revokes runner pairing and erases Durable Object storage before removing D1 and KV data.
- Retain only a minimal deletion receipt (random operation id, timestamp, counts), without login, repo names, credentials or exported factory data.
- GitHub issues, commits, PRs and third-party provider accounts remain at their source. The UI explains that provider-side app uninstall/key revocation is separate.
- Privacy and terms are drafts for Justin's review, not approved final policies.

Integration watch: auth user model, goal 3 encrypted credentials (installation/repo scope), goal 8 durable state export/backups. Recheck these before merging.
