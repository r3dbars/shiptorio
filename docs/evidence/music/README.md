# Foundry music review evidence (PR #263)

Run `bun run dev:web`, then `node scripts/music/verify.mjs` (requires repository Playwright
and its Chromium browser). Defaults to `http://127.0.0.1:5173`, writes to
`/tmp/shiptorio-music`; override with `MUSIC_URL` and `MUSIC_OUT`.
On macOS, compress the audition for review with:

```sh
afconvert -f m4af -d aac@44100 -b 80000 /tmp/shiptorio-music/foundry-preview.wav /tmp/shiptorio-music/foundry-preview.m4a
```

- [65-second audition](foundry-preview.m4a): original CC0 score/instruments, rendered
  with OfflineAudioContext. Idle 0–13s, layers rising 13–31s, blocked 31–47s,
  launch 47–55s, working 55–65s. **Synthetic audition**, not a simulator recording.
- [Desktop controls](desktop.png) and [iPhone 13 controls](phone.png): master volume
  and separate music volume fit the activity tray. At 1440×900 and 390×844 CSS px
  (phone image is 3× device pixels).
- [Browser results](results.json): no v2 score or audio requests before a gesture or
  while music is off; music enabled after gesture schedules notes; music-volume
  37% persists independently of master 50%; off stops scheduling; master mute suspends.
  No page errors or framework overlay observed.
- Separate live scheduler harness exercises blocked → idle → working → launch → working,
  retaining the bar clock. A browser stall recovers at the next eighth, rather than waiting a silent bar. A **synthetic visibility event** verifies the hidden handler
  suspends audio and stops scheduling; it does not prove OS background behavior.
- iPhone 13 emulation, Chromium at 4× CPU throttle, quality=2: 12.40s isolated music
  profile, 0.021% sampled scheduler self time, 6 active voices at the final sample.
  This excludes the 3D map and the browser audio-rendering thread; it is not a physical
  iPhone battery/CPU measurement. Runtime music decoded PCM is 0 bytes (no stems).
- Offline audition peak 0.486, RMS 0.0956 (~-20.4 dBFS); no digital clipping.
  These are sample statistics, not an integrated LUFS or perceptual listening claim.
- Built v2 chunk: 7.31 KB raw / 2.89 KB gzip; no runtime media payload. The service worker
  caches that hashed chunk on demand, with no precache request.

Validation: `bun run check` green after final code rebase (696 pass, 2 platform
skips, 698 total). `bun run test:fast` green before that rebase (679 pass,
2 platform skips, 681 total; 26 playtest cases / 332 decisions, no findings).
Music suite: 24 pass. Counts differ because concurrent changes landed on main.

[Actual 65s simulator music-bus recording](simulator-run.m4a) and [state trace](simulator-run.json).
Quiet-morning naturally exercised idle, working and launch, but did not enter blocked;
blocked is covered by the deterministic audition and live scheduler harness.

Still for listening acceptance: speaker/headphone audition for timbre, perceived loudness,
clicks/dropouts, physical iOS Safari/background behavior, and subjective mix checks on the simulator run. This PR intentionally leaves the original score as
the default; these gates must close before promoting v2.
