# Shiptorio operations

Goal 14, 2026-10-26. In progress: isolate staging on shiptorio.dev, add feature
flags, dependency health, and a manual rollback path without scheduled Actions.
Day checkpoint: safe deployment and recovery for the first playable loop.

Production remains shiptorio.com. Staging has a separate Worker, D1, KV and
Factory Durable Object namespace. Never copy production factory state or mine
credentials into staging. Acceptance evidence is recorded here after live checks.
