# Shiptorio
- Repo: r3dbars/shiptorio (saved to project). Pitch: codebase as a Factorio map; factories = agent pipelines shipping real PRs. Meta hackathon, submit by noon CT Nov 4.
- Stack: Justin chose Cloudflare (their .com is there), not the doc's Fly/Neon. Worker + GitHub App, D1 `shiptorio` + KV `shiptorio-cache` created, not deployed. PR #1 = phase-1 scaffold/reshape. AGENTS.md merged to main (PR #2).
- Lanes: Claude (this project) = frontend web/ with Justin. Codex/ChatGPT = backend server/ + runner/. shared/ contract changes go in their own PR.
- Design reference: Justin's Feedback Factory artifact https://claude.ai/artifact/HtWP6pHDcYn9TSByR6UJcn (Belts artboard).
- Cloudflare connector connected. Existing workers: transcripted-feedback, stack99-relay, r3dbar-subscribe, redbars — don't touch.
- Shiptorio Claude doc (design, architecture, build plan): https://claude.ai/artifact/AWJrfEvb9c7BRwvQNcj1XL. Repo handoff doc (all repo files verbatim): https://claude.ai/artifact/PEuV9HSPfkw9o4urNiY2nk. See [[shiptorio-claude-doc]].
- Justin's needs-hands: push ~/omni/shiptorio, wrangler login + deploy, /setup GitHub App, META_API_KEY, which .com (only r3d.bar seen).