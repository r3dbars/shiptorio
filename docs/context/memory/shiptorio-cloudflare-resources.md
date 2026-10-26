---
name: shiptorio-cloudflare-resources
description: Cloudflare resources created for Shiptorio (D1 + KV ids) and what's still not deployed, as of 2026-10-26
metadata:
  type: project
  modified: 2026-10-26T16:19:11.293Z
---

Created 2026-10-26 on Justin's Cloudflare account (Justin OK'd "get this ready for me to work on"):
- D1 `shiptorio` id 153f63dc-f65f-4c02-a0b1-6c78b7d6aa08 (ENAM). Schema 0001_init applied by hand via MCP and recorded in `d1_migrations`, so `wrangler d1 migrations apply --remote` is a no-op for it.
- KV `shiptorio-cache` id c9d7c44e1c304a2b9a285049ee1e3408.

The `shiptorio` Worker is NOT deployed yet: cloud sessions have no CLOUDFLARE_API_TOKEN and the Cloudflare MCP can't deploy Workers. Justin deploys with `npx wrangler login && npm run deploy`, or by adding the CLOUDFLARE_API_TOKEN/CLOUDFLARE_ACCOUNT_ID secrets plus the DEPLOY_ENABLED=true var for the GitHub Actions Deploy workflow. The GitHub App is created by Justin via `/setup` after the deploy.

Related: [[shiptorio-architecture]], [[shiptorio-repo]]
