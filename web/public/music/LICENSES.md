# Shiptorio music licenses and asset inventory

“Up from the Mine” (2026), the score in `web/src/sound/foundryScore.ts`, its instrument
waveforms and any audio generated solely from it are dedicated to the public domain
under CC0 1.0: https://creativecommons.org/publicdomain/zero/1.0/ .
Written originally for this repository. No samples, SoundFonts, impulse responses,
third-party compositions, music models, or sample packs were used.

Runtime audio asset inventory: **empty**. Both music versions synthesize locally.
No music files are fetched or decoded. No source URL applies to original waveforms.
The v2 JavaScript chunk loads only after unlock with music enabled; the service worker
caches it on demand. Low quality (`?quality=2`) uses a smaller procedural arrangement.

Audition: run `node scripts/music/verify.mjs` against Vite to render a deterministic
65-second WAV from the same score/instruments (idle → working → blocked → launch).
This is a synthetic audition, not a recording of a real shipped PR or the simulator.
Generated audition files share the CC0 dedication. No generated file is a runtime stem.
